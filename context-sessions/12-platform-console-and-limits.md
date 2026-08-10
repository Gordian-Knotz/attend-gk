# 12 — Platform console, rate limiting, sessions and caching

Session of **10 August 2026**, immediately after
[11](11-security-hardening.md). Four pieces of work, requested together:

1. a super-admin dashboard PAC can run its business from
2. rate limiting
3. session cookie and JWT configuration
4. database caching

Same branch: `harden-security-audit`.

---

## Decisions taken before building

**Deploy target: Railway** — a long-lived container. That single fact
decides the rate limiter: a `Map` in module scope survives between requests,
so an in-memory counter actually counts. On a serverless host it would not,
and the limiter would be decorative.

**Super-admin scope: cross-org metrics *and* commercial writes.** Framing
from the request: *"this is basically me and my company, to see who is using
our SaaS and who's paid."* So this is a vendor console, not a support tool —
no impersonation, no audit log for now.

**Rate limiting: auth, attendance writes, and the contact form.**

---

## `/super` — the platform console

### Why a new route segment and not more of `/admin`

Everything under `/admin` is written on the assumption it is scoped to one
organization. Adding cross-org pages into that layout is how a page ends up
quietly rendering another tenant's numbers — the assumption is implicit in
dozens of files and nothing enforces it. A separate segment with its own
layout makes the boundary structural rather than remembered.

`/admin/organizations` is now a redirect to `/super`. Kept rather than
deleted: it is in the sidebar history, in bookmarks, and in doc 03.

### What it shows

Four tiles — organizations, paying, on trial, active in 30 days — then a
signups area chart, an attention panel (past due, suspended, punches in the
window), and the tenant table.

**"Active" means they actually used the product**, not that a row exists.
An org that signed up and never clocked anyone in is a completely different
business fact from one running three sites, and a tenant count that conflates
them will flatter you. Active = not suspended, and at least one punch in the
last 30 days.

Counts are done in memory from four queries rather than 4N count queries.
The platform has tens of orgs; revisit if that stops being true.

### What it can write

Plan tier, billing status, suspension. Guarded three ways: the layout
redirects non-super-admins, the actions re-check, and RLS underneath.

**There is deliberately no delete.** Deleting an organization cascades to
every employee, attendance event and leave request it has ever recorded.
Non-payment is a conversation, not a reason to destroy an audit trail.
Suspension is the reversible equivalent and keeps the data.

### Migration 0010

Two things had to be true before any of this worked:

- **`billing_status` was free text.** `"past_due"`, `"pastdue"`,
  `"PAST_DUE"` and `"overdue"` could all coexist, and every "who has paid"
  filter would silently under-count. It is now a CHECK-constrained set, with
  existing rows normalised first so the constraint can't fail on old data.
- **0001's `org: admins update own` was too broad.** It let an `org_admin`
  update their own organization row — including, once these columns existed,
  setting their own `plan_tier` to `enterprise`, marking themselves
  `active`, or clearing a suspension somebody had just applied to them.

That second one is a per-column rule and RLS operates on rows, so it is
enforced by a `BEFORE UPDATE` trigger: org_admins may rename their
organization, and nothing else. Everything commercial is super_admin only.

### Found while writing the "how do I get super admin" instructions

Answering that question surfaced a privilege escalation the audit missed.

0003's `employees: admins manage roster` constrains *who* may write and
*which organization's rows* they may write. It does not constrain the
`role` column. So any `org_admin` could

```
PATCH /rest/v1/employees?id=eq.<themselves>   {"role": "super_admin"}
```

and take the platform — every tenant's attendance data, and, now that
`/super` exists, the ability to change anyone's plan, mark them paid, or
suspend them. It was a cross-tenant read hole before today; shipping the
console turned it into a commercial one.

Exactly the shape 0010 closed on `organizations`: a per-column rule, which
RLS cannot express. Same remedy —
`0011_employee_role_integrity.sql` adds a `BEFORE INSERT OR UPDATE` trigger
that lets nobody but an existing `super_admin` grant, remove or move one,
and blocks moving an employee between organizations at all.

The bootstrap escape hatch is `auth.uid() is null` — the SQL editor, a
migration, or the service role. That is deliberate and it is the only way
the first super_admin can exist. It also means the trigger does not
constrain `scripts/seed-demo-data.mjs` or the staff-invite action, both of
which use the service role; the invite action validates `role` against
`('staff','manager')` in application code instead.

**Worth generalising:** this is now the third per-column rule in this schema
that RLS silently could not enforce — `attendance_events` (0008),
`organizations` (0010), `employees` (0011). When a policy grants write
access to a table, ask separately which *columns* that write should be
allowed to touch. RLS will not ask it for you.

### The honest limit on suspension

`OrgSuspended` blocks the *rendered* surfaces — `/admin` and `/dashboard`.
It is an application control, not a database one, so a suspended org's
members can still reach their own rows through PostgREST with a valid
session.

Closing that properly means adding a `not suspended` predicate to the RLS
policies, which is a wider change than this one. **Do that before suspension
is ever used against someone motivated to go around it.** For withholding a
UI from a customer who is late paying an invoice, this is proportionate.

super_admin is exempt from the block — locking ourselves out of the console
that lifts suspensions would be an unfortunate way to discover the bug.

---

## Rate limiting

`src/lib/rate-limit.ts`. Sliding window over timestamps, not a fixed window:
a fixed window lets someone spend the full allowance at 0:59 and again at
1:01, which is double the intended rate at exactly the moment it matters.

| Limiter | Limit | Window | Keyed on |
|---|---|---|---|
| `auth:ip` | 20 | 15 min | client IP |
| `auth:id` | 6 | 15 min | email |
| `auth:reset` | 3 | 1 hour | IP *and* address |
| `attendance` | 60 | 10 min | employee id |
| `contact` | 3 | 1 hour | client IP |

Auth is keyed two ways because they catch different attacks: per-IP stops
one host spraying many accounts, per-identifier stops a distributed attempt
on one account. A successful sign-in resets the account bucket, so someone
who fat-fingered their password four times isn't still throttled after
getting it right.

Attendance is keyed on the **user, not the IP** — a whole site's staff share
one connection, and a per-IP cap would throttle a shift change.

### The caveat, stated plainly

**Buckets are per process.** Scale Railway to N replicas and each enforces
the limit independently, so the real ceiling becomes N × the configured
limit. Correct for one container, wrong for four.

`RateLimitStore` is an interface for exactly this reason. When you scale
out, implement it against Redis and pass it to `createLimiter` — no call
site changes. `MAX_KEYS` (20,000) is a memory bound, not a tuning knob:
keys come from client IPs, so without it an attacker rotating source
addresses turns the limiter into unbounded allocation.

### Auth had to move to the server first

This is the part worth knowing. **Sign-in, sign-up and password reset ran
entirely in the browser**, calling Supabase's API directly. That is the
supported SSR pattern and it works — but it means sign-in traffic never
touches this application, so nothing here could see it, count it, or slow it
down. There was no endpoint to rate-limit.

They are now server actions in `src/app/login/actions.ts`. Three side
benefits beyond the limits:

- **One place where auth cookies are written.**
- **No account-existence oracle.** "No such account" and "wrong password"
  now return one identical message, and password reset always reports
  "if that address has an account…" regardless of outcome. Distinguishing
  them turns the login form into a tool for validating a scraped email list.
- **`/login` dropped from 231 kB to 163 kB**, because the browser Supabase
  client is no longer imported into that route.

### The contact form, finally

Doc 11 left it on `mailto:` as an honest stopgap. Rate-limiting a `mailto:`
link is meaningless — there is no request — so the ask forced the real fix:
`contact_requests` (migration 0009), a server action, and a per-IP cap.

This is **the only anon-writable table in the schema**. It is safe only
because the row references nothing, can't be read back by the writer, and is
length-bounded by a CHECK constraint as well as by the action. That comment
is in the migration too. Do not copy the policy onto a table that joins to
tenant data.

Reads are super_admin only — these are leads for the vendor, not tenant data.

---

## Sessions, cookies and JWT

`src/lib/supabase/cookies.ts` is now the single policy, applied in all three
places that write auth cookies (server client, browser client, middleware —
middleware is where the refreshed cookie is actually written on most
requests, and it was previously using library defaults).

- `sameSite: "lax"` — the auth cookie has no cross-site use, and `strict`
  would break the top-level navigation back from a password-recovery email.
- `secure` in production only — on `http://localhost` a Secure cookie is
  dropped and nobody can sign in.
- `path: "/"`.
- `flowType: "pkce"` on every client. The authorization code is exchanged
  against a verifier the client holds, so a code intercepted from a redirect
  URL — browser history, referrer header, a proxy log — can't be redeemed
  alone. Both clients must agree or the `/reset-password` exchange fails.
- `detectSessionInUrl` on for the browser client (it picks up the recovery
  code), off on the server (middleware owns refresh; leaving it on makes the
  two race for the same cookie).

### httpOnly is deliberately NOT set

It is the obvious hardening and it breaks this app: the browser Supabase
client reads the session from `document.cookie` to keep client components
authenticated and to refresh tokens. Setting httpOnly leaves it unable to
see a session that exists.

The mitigation for XSS reading the token is therefore not the flag — it is
that nothing renders untrusted HTML (no `dangerouslySetInnerHTML` anywhere
in `src/`, checked during the audit) and that tokens are short-lived.
**Making these httpOnly requires moving all auth reads server-side first.**
Don't flip it and assume it worked; check that a client component still sees
a session.

### Not code — do these in the Supabase dashboard

The parts that matter most here aren't in the repo:

| Setting | Where | Suggested |
|---|---|---|
| JWT expiry | Auth → Sessions | 3600s. Shorter limits the window a stolen token is useful. |
| Refresh token rotation | Auth → Sessions | **On** |
| Reuse interval | Auth → Sessions | 10s — tolerates a double-fire without invalidating a live session |
| Inactivity timeout | Auth → Sessions | Consider one for a shared kiosk |
| Auth rate limits | Auth → Rate Limits | Supabase's own, upstream of ours |
| Email confirmations | Auth → Providers | Currently off — signup returns a session immediately |
| SMTP | Auth → Emails | Still required for password reset ([10](10-live-db-bringup.md) §4.3) |

---

## Database caching

`src/lib/cache.ts`. The rule that governs this file:

> **Almost nothing here may go in a shared cache.** Every query runs as the
> signed-in user and RLS decides what comes back, so two callers issuing an
> identical query legitimately receive different rows. A cache keyed on the
> query — which is what `unstable_cache` keys on — would serve one tenant's
> rows to another. That is not a performance regression, it is a data breach
> with a fast response time.

So there are two tools and they are not interchangeable:

**`perRequest`** — React's `cache()`. Deduplicates within one render pass,
discarded when the response is sent, never crosses a request and therefore
never crosses a user. Safe by construction. Applied to `getEmployeeContext`,
which the admin layout, the page and the sidebar each call — three identical
`auth.getUser()` + employees round trips per navigation, now one.

**`cachePlatformAggregate`** — `unstable_cache`, for `/super` figures that
are identical for every viewer *because* the only viewers are super_admins
seeing the whole platform. Tagged, so `updateOrgPlan` and friends invalidate
it on write. Nothing org-scoped may use this.

If you want a third tool, the answer is almost certainly `perRequest`.

**Not done: connection pooling.** Supabase's pooler (port 6543) matters for
a container holding many connections, and it is a connection-string change
plus a check that nothing depends on session-level state. It belongs with
the Railway deploy, not here.

---

## Migration order, updated

```
0001 … 0007                     as before
0008_attendance_insert_integrity.sql   RLS + trigger hardening   ← doc 11
0009_contact_requests.sql              landing-page enquiries    ← this session
0010_platform_administration.sql       billing constraint, suspension,
                                       per-column update guard   ← this session
seed.sql                               run last
```

0009 and 0010 are independent of each other; both assume 0001.

> **Updated 10 Aug 2026.** This said "all three of 0008–0010 are unexecuted".
> 0008–0011 are now all applied — see
> [13](13-railway-rename-and-product-work.md) for the confirmation probe.
> Note that 0011 postdates this list and belongs at the end of it.

---

## Verification

```
tsc --noEmit  ✓ exit 0
npm run lint  ✓ exit 0, no warnings
npm run build ✓ 19 routes + ƒ Middleware 92.9 kB, exit 0
Playwright    ✓ 1366×1000, 390×844, 320×844, both themes
```

`/super` 12.2 kB (274 kB). `/login` 4.51 kB (163 kB), down from 231 kB.

---

## The browser pass — and the bug it found

Driven with Playwright against a production build. **It immediately found
something neither the audit nor two green builds had.**

### `middleware.ts` had never run. Not once.

The smoke test asserted that every protected route redirects a signed-out
visitor to `/login`. `/admin`, `/onboarding` and `/super` did. **`/dashboard`
and `/checkin` did not** — they rendered their own signed-out fallback
instead.

That was the thread. Pulling it:

- `/super` redirected to `/login?next=%2Fsuper` — which is the string its
  *layout* passes, not the one middleware builds.
- `/admin` redirected to `/login` with **no** query string at all — the
  layout's `redirect("/onboarding")` bouncing onward.
- `npm run build` output had **no `ƒ Middleware` line**.

`middleware.ts` was at the repository root. The app is in `src/app`. Next
requires middleware to sit beside the `app` directory, so with a `src`
layout it must be `src/middleware.ts`. At the root it is simply not
compiled — no warning, no error, and every build green.

Consequences, all of which had been true since the file was written on
6 Aug:

- **Route protection was entirely page-level.** It happened to hold, because
  every protected page also checks for itself — but `PROTECTED_PATHS` was
  decorative, and any new route added on the assumption middleware covers it
  would have shipped unguarded.
- **The fail-closed env guard from [11](11-security-hardening.md) was
  inert**, as were the `/checkin` and `/api` additions and the
  segment-aware matcher. A whole hardening item that verified clean and did
  nothing.
- **Server-side session refresh was never happening.** This is the one with
  reach beyond auth-gating: `@supabase/ssr` relies on middleware calling
  `getUser()` on each request to rotate the token and write the refreshed
  cookie. Its absence is the likeliest explanation for any "randomly signed
  out" behaviour, and it would have got worse under the shorter JWT expiry
  this session recommends.

Fixed by `git mv middleware.ts src/middleware.ts`. The build now reports
`ƒ Middleware 92.9 kB`, and all five protected routes redirect with the
correct `?next=`.

**Worth generalising:** a misplaced Next.js convention file fails silently.
`tsc`, `lint` and `build` cannot tell you that a file you wrote is being
ignored — only exercising the behaviour can. Two sessions of green builds
did not catch this; the first browser assertion did.

### Confirmed working

| Check | Result |
|---|---|
| Protected routes | All five (`/admin`, `/dashboard`, `/checkin`, `/onboarding`, `/super`) redirect to `/login?next=…` |

> **Corrected 10 Aug 2026, from the Railway deploy.** All five *do* redirect,
> but not all five were redirected by **middleware**. `/super` was never added
> to `PROTECTED_PATHS`; its own layout was catching it. The live smoke test
> gives it away in the query string — `/admin` and `/dashboard` redirect to
> `?next=%2Fadmin` (middleware, which URL-encodes through `searchParams.set`)
> while `/super` went to `?next=/super` (the layout's own string). That is
> the same signature this document used to diagnose the middleware bug in the
> first place, and it was sitting in the evidence unread.
>
> It was never an open hole — the layout redirect is real, and middleware's
> matcher still ran `getUser()` on the route, so session refresh was
> happening. What `/super` was missing is the fail-closed env guard and the
> guarantee that protection survives someone editing that layout. Now in
> `PROTECTED_PATHS`.
>
> This is the third time this exact lesson has come around: **a route is only
> protected by the layer you can point at.** Adding a route segment means
> adding it to `PROTECTED_PATHS` in the same change.
| Open redirect | `https://example.org/pwned`, `//example.org/pwned` and `/\example.org` all stayed on origin |
| Auth rate limit | Engaged on attempt **7** — the per-identifier limit is 6. "Too many attempts for this account. Try again in 15 minutes." |
| Credential enumeration | Failure message identical regardless of whether the account exists |
| Horizontal overflow | `scrollWidth <= clientWidth` at 1366, 390 and 320, both themes |
| Console | Clean. The only output is a headless-GPU `ReadPixels` warning from the WebGL hero — environmental, not ours |

### A false alarm, recorded so it isn't chased again

The first run reported eight headings stuck at `opacity: 0`. They are not.
Measuring after `networkidle` measures *before* the scroll-triggered reveal
has fired, so every below-the-fold heading reads as invisible. Scrolling the
page and re-measuring gives `opacity: 1` on all eight.

This is the same trap doc [07](07-ui-motion-layer.md) already documented
with `fullPage` screenshots, hit again from a different direction. The
smoke test now scrolls before it measures.

**What is real:** with JavaScript disabled, all eight headings stay
invisible. That is the `RevealHeading` SSR question doc
[06](06-next-steps.md) lists as an open decision — now measured rather than
suspected.

### Still not verified

- **`/super` has never been rendered.** It needs a `super_admin` session.
- **The contact form fails against the live project** — correctly. It shows
  *"We couldn't record that just now. Email hello@pac.africa directly"*
  because `contact_requests` doesn't exist yet. The error path works; the
  feature needs 0009.
- **Suspension end to end** — suspend a scratch org, confirm its admin and
  its staff both see the notice, then restore.
- **That a legitimate offline-queue drain of ~20 punches doesn't trip the
  attendance limiter.**

---

## What is actually applied on the live project

Probed through PostgREST with the anon key on 10 Aug. This corrects the
repeated claim in docs 03, 06 and 11 that *nothing* has run against a live
database — **most of it has.**

| Migration | State | Marker used |
|---|---|---|
| 0001–0006 | **applied** | `employees`, `notifications` tables respond |
| 0007 | **applied** | `geo_distance_m()` resolves |
| 0008 | **not applied** | `attendance_events.client_event_id` absent; `employee_site_id()` absent |
| 0009 | **not applied** | `contact_requests` 404 |
| 0010 | **not applied** | `organizations.suspended_at` absent |
| 0011 | **not applied** | written after the probe; closes the role-escalation hole above |

RLS is working: anon sees zero rows on every table.

> An earlier hand-written 0008 — the sketch in [10](10-live-db-bringup.md)
> §1 — was applied by hand. The file now in `supabase/migrations/` is a
> superset of it: same policy tightening, plus the leave self-approval fix,
> the device-secret fix, the four-tier read policies, `client_event_id` and
> `employee_site_id()`. Neither of those last two exists on the project, so
> **the committed 0008 still needs running.**

### 0008 is safe to run twice

That situation — a migration partly applied by hand before the file existed
— is exactly why it has to be. Every statement is idempotent:

| Object | Mechanism |
|---|---|
| policies | `drop policy if exists` then create |
| functions | `create or replace` |
| trigger | `drop trigger if exists` then create |
| column | `add column if not exists` |
| index | `create index if not exists` |
| constraints | `drop constraint if exists`, then add — **with existing rows normalised first** |

That last row is the one that would otherwise bite. `add constraint`
validates rows already in the table, so a legacy `leave_requests.status` or
`leave_type` outside the new allow-list would abort the entire migration.
Unrecognised values are now folded onto a safe default first — a leave
request is somebody's time off, not scratch data, so nothing is deleted.
The `client_event_id` unique index likewise nulls any duplicate keys a
partial run could have left behind, keeping the punch and discarding the key.

All three of 0008–0010 now end with `notify pgrst, 'reload schema'`.
PostgREST serves from a cached schema and does not notice DDL, so a new
column or function 404s through the API until the cache happens to refresh
— which looks exactly like the migration not having run, and cost time on
10 Aug for precisely that reason.
