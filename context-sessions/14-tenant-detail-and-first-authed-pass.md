# 14 — Tenant detail pages, a full code review, and the first authenticated browser pass

Session of **11 August 2026**, continuing on `harden-security-audit`. Three
things happened: `/super` gained per-tenant pages, a CodeRabbit review of the
whole branch produced 28 findings that were triaged and fixed, and — for the
first time in four sessions — somebody actually logged in and looked at the
staff dashboard.

Design spec: `docs/superpowers/specs/2026-08-11-super-tenant-detail-design.md`.
Implementation plan: `docs/superpowers/plans/2026-08-11-super-tenant-detail.md`.

---

## What shipped

**`/super/orgs/[id]`** — a per-tenant page for the operator console. Header with
plan and billing badges and a suspension banner; four tiles (sites, staff,
punches in 30 days, and **staff who actually punched** in 30 days); a usage
chart; the site list with geofence centre, radius and per-site headcount; and
the roster. The overview table at `/super` became navigation: names link out,
plan and billing are read-only badges there, and the commercial controls moved
onto the tenant page.

Supporting changes: `src/lib/tenant-summary.ts` (pure, 9 tests) and
`SignupTrendChart` generalised into `DailyTrendChart`.

### The privacy line, and why it is where it is

RLS lets `super_admin` read every table for every tenant, so what this page
shows is a **decision, not a capability**. It shows aggregates plus roster
identity — name, role, site, last seen. It does not show individual attendance
records, leave requests, or `pay_rate`. Those two columns are omitted from the
`select` strings themselves rather than hidden in the markup, because a column
that never leaves Postgres cannot leak through a serialized prop or a stray log
line.

**Commercial controls moved off the overview table** because suspension locks an
entire company out of the product, and a control that does that sitting in row
14 of a dense table is a misclick with a customer on the other end.

### No migration was needed for the feature

Built entirely on `organizations`, `sites`, `employees` and `attendance_events`
as they already exist. That was a deliberate constraint: the whole feature is
reversible by deleting files, which matters on a branch already carrying
unexecuted migrations.

---

## The plan was wrong five times, and execution caught each one

Five tasks were executed with a fresh implementer and an independent reviewer
per task. Every single task surfaced a defect in the **planning**, not the
implementation. Worth recording because the ratio is the point.

1. **The module could not import what the plan told it to.** `@/` is a tsconfig
   alias Node knows nothing about, so it does not resolve under `node --test`;
   an extensionless relative import fails Node's ESM resolver; and a relative
   import carrying `.ts` fails `tsc` with TS5097. No spelling satisfies both
   tools. Ruling: `tenant-summary.ts` **imports nothing**, and the caller
   supplies `day_key` and the day labels. That is a better boundary anyway —
   the org timezone is applied in exactly one place.
2. **"19 routes" was never true.** Docs 12 and 13, the index README and this
   plan all asserted it as build verification. The table has **16** rows (17 now
   with the tenant page); `src/app` holds 15 `page.tsx` files plus the generated
   `/_not-found`. It originated in doc 12 and was repeated for two sessions as
   proof the build was healthy. A number nobody re-derives is a claim, not a
   measurement.
3. **A verification gate was cruder than the requirement.** The
   "no forbidden column" step grepped the file for the column *names*, so it
   failed on the doc comment that deliberately names them — and that comment is
   the point. The implementer dutifully reworded the comment to pass. Fixed the
   gate, restored the comment: test what the requirement says (neither column is
   *selected*), not whether the words appear.
4. **A brief dropped a behaviour.** The billing badge snippet omitted
   `.replace(/_/g, " ")`, regressing "past due" to "past_due".
5. **A brief missed stale copy that then lied.** A `Callout` on `/super` still
   said plan, billing and suspension were "writable here and nowhere else" —
   on a page that, after the change, writes none of them. Not a crash; copy
   telling an operator the opposite of the truth.

### The fixture route earned its place

`/super` needs a session, so the tenant page was checked through a temporary
fixture route with deliberately awkward data (a site name long enough to
truncate, a site with zero staff, two people who have never punched, one with no
site, a suspended org), then deleted — doc 09's pattern.

It found a real overflow bug, and the real route was **worse** than the fixture
suggested: 21px over at 390 and 91px at 320, because the real page renders
inside `/super`'s narrower `max-w-6xl px-6`. Cause was the standard CSS grid
min-content floor: the roster table's min-content became the column's floor, so
the overflow escaped to the document instead of being absorbed by the table's
own scroll container. Fixed with `min-w-0`, the idiom `/dashboard` already used.

---

## The CodeRabbit review — 28 findings

Run with the CLI in WSL against the **real** repo this time (`--base main`), not
doc 11's throwaway snapshot, so it was not limited to the free CLI allowance.
14 major, 14 minor. All 17 code and SQL findings were fixed and independently
re-reviewed as ADDRESSED; nine of ten documentation findings were fixed.

**The most serious, by a distance:** `clientIpFrom` read the **leftmost**
`x-forwarded-for` entry — which the caller sets. Anyone could rotate that header
and walk past both the auth limiter and the contact-form limiter. The rate
limiting doc 12 added was, against a deliberate attacker, decorative. It now
takes the rightmost entry, with the single-Railway-hop assumption written down
so it breaks loudly if a second proxy appears.

**In the attendance path**, three more that cost money rather than tidiness:

- a transient failure on a direct punch submit **discarded the punch** instead
  of queueing it — precisely the case the offline queue exists for;
- an online punch could overtake older queued ones, producing an out-of-order
  ledger;
- `flushQueue` never updated `lastEvent` from the last accepted replay, so after
  a reload the widget could offer "check in" to someone already checked in.

Also fixed: a malformed `clientEventId` was coerced to `null`, silently
disabling the idempotency that stops the queue double-recording attendance;
`23505` was treated as a benign duplicate for *any* unique violation; PostgREST
error messages were returned to the client verbatim; `/admin/settings`
hardcoded `07:15` and `09:00` while the logic held them as default parameters,
so the card that exists to expose those thresholds could disagree with them; a
failed sign-out was surfaced into a dropdown that then closed, telling the user
nothing on a shared kiosk; and an invalid `NEXT_PUBLIC_ORG_TIME_ZONE` reached
`Intl` and threw at render.

One finding was skipped with reason: `reactbits/RotatingText.tsx` is vendored
byte-for-byte on purpose and is currently orphaned.

### Migration 0012 — written, **unexecuted**

Three findings were in **already-applied** migrations, so editing those files
would have changed nothing in production while creating drift between the files
and reality. They went into `0012_security_review_fixes.sql`, which is
idempotent like 0008–0011:

- **`employee_site_id` was not scoped to the caller's organization.** It is
  `SECURITY DEFINER` and granted to `authenticated`, so any signed-in user could
  call it over RPC with another tenant's employee id and learn that person's
  site. Now scoped via `current_employee()`. Its only callers are two
  manager-tier `select` policies, which already gate on `org_id` first, so
  legitimate reads are unchanged.
- **`guard_organization_columns()` had no unauthenticated escape hatch.** 0011's
  equivalent opens with `if auth.uid() is null then return new`, which is the
  only way the first `super_admin` can exist and what lets the seeder work.
  0010's did not, so service-role and SQL-editor writes to `organizations` could
  be rejected.
- **`contact_requests` had no delete path and no retention**, while storing
  `source_ip` beside a name, email, phone and free text. Now a `super_admin`
  delete policy plus `purge_contact_requests(interval default '12 months')`,
  deliberately **not** scheduled — turning on a recurring job is the owner's
  call.

---

## The first authenticated look, and what it found

A staff demo account was provisioned (see below), which finally made
`/dashboard` reachable. **It was broken at mobile widths, badly**, and had been
since the sidebar was added.

The container was unconditionally `flex`. The sidebar and the mobile rail are
siblings, so below `md` the rail became a flex **item** of the row and sat
*beside* the content instead of above it: 627px of content in a 390px window,
the greeting and site name clipped mid-word, and the rail's active-item
highlight stretched down the entire page as a full-height orange bar. It is a
row only from `md` up now.

Two false leads on the way, both recorded in `scripts/smoke-authed.mjs`:

- A short `waitForURL` left the run on `/login`, where `document.querySelector("aside")`
  is legitimately `null` — so the first diagnosis reported "the sidebar is
  absent" and no overflow. Every assertion after a failed sign-in is a phantom.
  **I initially blamed the rate limiter for this. That was wrong** — a longer
  wait signs in fine.
- The attendance card was reported empty by a `/In\b|Out\b/` regex. The badges
  are uppercased by CSS and `innerText` reflects that, so the rows were there
  all along.

`npm run smoke:authed` now covers this: **41 checks**, three widths, both
themes, asserting among other things that the rail sits at the top-left and not
beside the content.

### RLS verified against the live database for the first time

Doc 11 listed these as owed "once a database exists". Queried with a real staff
session, so RLS applied exactly as the app sees it:

| Check | Result |
|---|---|
| `biometric_devices` | **0 rows** — doc 11's worst finding (any employee could read `webhook_secret`, which authenticates the geofence-exempt `biometric` source) is closed and proven |
| `leave_requests` | 2 rows, both their own — 0008's four-tier read policy holds; staff cannot read colleagues' leave |
| `organizations` | 1 — no cross-tenant visibility, with three other orgs present |
| `attendance_summary` | 0 |

---

## The demo account

`staff.demo@pac.africa`, role **staff**, at **Alpha Pride Security / Two Rivers
Mall**. Created through the Admin API with `email_confirm: true`, so it needs no
mailbox — Supabase only checks deliverability on self-serve signup. Seeded with
5 shifts, 9 attendance events (including one late arrival and one day with no
clock-out, so the documented "unmatched events contribute zero hours" case is
visible) and 2 leave requests, one approved and one pending.

**The password is not in this repository.** It was given directly and belongs in
a password manager. Rotate or delete the account when it stops being useful.

Two things about it worth knowing:

- **Clock-in will be rejected.** Every site in the database is in Nairobi, and
  the geofence is re-validated server-side and in a trigger. The button renders
  and then refuses unless you are within ~150m of Two Rivers Mall. Seeing the
  dashboard and being able to punch on it are separate problems.
- Seeded punches use `source: 'manual'`, the documented exemption for an admin
  correction with no GPS. A `'mobile'` punch without coordinates is rejected —
  the trigger applies to the service role too, because RLS is bypassed and
  triggers are not.
- `morpheousbyte@gmail.com` was **left as `super_admin`** deliberately. Demoting
  it was considered and rejected: it is one of only two super-admins, and 0011
  means only an existing super_admin or the service role can restore the role.

---

## Verification

```
npm test         ✓ 9/9
npx tsc --noEmit ✓ exit 0
npm run lint     ✓ exit 0
npm run build    ✓ 17 routes + ƒ Middleware, exit 0
npm run smoke    ✓ 107/107 (public, 3 widths × 2 themes + reduced motion)
npm run smoke:authed ✓ 41/41 (/dashboard, 3 widths, both themes)
Railway            deployment 4b0e3dad SUCCESS
```

Live at `web-production-c7d3e.up.railway.app`. Branch pushed.

---

## Where to pick up

1. **Run migration 0012.** It is written, idempotent and **unexecuted**. Until
   it runs, `employee_site_id` remains a cross-tenant site lookup callable by
   any authenticated user, and `contact_requests` still has no deletion path.
   Deploying the app did not apply it.
2. **`/super` and `/super/orgs/[id]` have still never rendered.** They need a
   `super_admin` session; the demo account is staff. The layout was checked
   through a fixture route, not the real page with real data. Either use a
   super-admin login with `smoke:authed` extended to cover it, or repeat the
   fixture trick.
3. **`/admin/settings`, `/admin` and `/checkin` are also unrendered.** The
   authed script now makes this cheap — extend its matrix once you have an admin
   login.
4. **`RevealHeading` renders `opacity: 0` into the SSR HTML**, so headings stay
   invisible with JavaScript off. CodeRabbit rates it major; doc 06 lists it as
   an open decision with three named options. It changes the signature reveal on
   every heading on the site, so it needs a decision, not a patch.
5. **`SUPPORT_EMAIL` is still a placeholder** (`hello@activ-hr.com`), backing the
   contact form's fallback and the suspension notice.
6. **Performance is 72** on Lighthouse and the cause is the motion layer —
   600ms of blocking time from 1.6s of script bootup, not bundle size. The
   options are ranked at the end of doc 13 and all of them trade away visual
   identity.
7. **The leads inbox.** `contact_requests` is written by the landing page and
   read by nothing, so every enquiry since 0009 is unread. The design spec names
   this as the natural next `/super` page.

Still true from doc 13: the rate limiter is per-process, so keep Railway at one
replica until `RateLimitStore` is backed by Redis.
