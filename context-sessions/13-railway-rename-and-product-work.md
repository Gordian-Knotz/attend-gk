# 13 — Railway deploy, the Activ-HR rename, and four pieces of product work

Session of **10 August 2026**, continuing straight on from
[12](12-platform-console-and-limits.md). Still on `harden-security-audit`.

Three distinct things happened, in this order: the PowerSync questions were
answered and closed off, the app went to Railway, and then four product changes
were requested and built.

---

## What the PowerSync review settled

PowerSync provisioning is **paused deliberately** — no instance exists. But the
three questions blocking it are answered, and two of them turned out to be
answered differently than the docs claimed.

### The migration gate is clear

0008–0011 were applied to the live project during this session. Probed through
PostgREST with the anon key: `attendance_events.client_event_id`,
`contact_requests` and `organizations.suspended_at` all resolve, which also
confirms PostgREST's schema cache picked the DDL up — the thing doc 12 records
as having cost time by looking exactly like a migration that never ran.

So the reason `NEXT_PUBLIC_POWERSYNC_URL` had to stay unset is gone. 0008 pins
`org_id`, `site_id` and `source in ('mobile','kiosk_qr')` on the staff insert
policy, so a sync upload can no longer claim `biometric` and skip the fence.

0011 is a trigger and can't be probed anonymously. Its test is still the one in
[10](10-live-db-bringup.md): an `org_admin` PATCHing their own role to
`super_admin` must be rejected.

### `libpowersync*.wasm` was never a blocker — and this one is worth reading

Two sessions treated the blocked `@journeyapps/wa-sqlite` postinstall as
something standing between us and a working database. Doc 08 said it "fails when
the DB opens, not at build time — which is why every build has been green".

That reasoning was wrong twice over, and the evidence was available both times.

**First:** the Web SDK never loads the builds that need those files.
`@powersync/web` 2.1.1 references only `wa-sqlite.mjs` and
`wa-sqlite-async.mjs` — the *static* builds, with the PowerSync core linked in.
The `*-dynamic-main` variants, which are the only consumers of
`libpowersync*.wasm`, are never referenced. Both static `.wasm` files were
already sitting in `public/@powersync/assets/`, put there by the
`postinstall: powersync-web copy-assets -o public` that has been running since
6 Aug. One `grep` over `node_modules/@powersync/web/dist` would have shown this.

**Second:** the script was approved, and it 404s.

```
Downloading libpowersync.wasm@v0.5.2
Could not download PowerSync SQLite core for dynamic linking. Dynamic builds
require libpowersync.wasm/libpowersync-async.wasm asset files. Static builds
should still function correctly.
Error: Could not download PowerSync core asset "libpowersync.wasm". Not Found
```

The asset is not published at that version. npm's block was never what stood
between us and those files, and **the package's own error message says the
static path is unaffected** — that sentence was there to be read the whole time.

The generalisable bit: *"I confirmed the files are absent"* is not the same
finding as *"the files are needed."* Doc 08 verified the first precisely — it
even quoted the filenames out of `download-dynamic-core.js` — and then asserted
the second without checking. Precision about the wrong question reads exactly
like rigour.

### `own_attendance` contradicted `insertOnly`

The sync rules carried a stream syncing each employee's punches down, commented
as letting the client "read back … currently clocked in". That could never have
worked: `insertOnly: true` means local writes go up and **nothing is ever
downloaded** into the table. The stream would have replicated every punch to the
device for the client to discard.

Resolved by removing the stream and keeping `insertOnly`, because the
kiosk-privacy argument is the stronger one. The cost is now stated in both
files: after a punch uploads, the device has no local record of it. If step 4
needs that, `insertOnly` comes off **and** the stream goes back, in one change.

### Recorded as gates for whoever provisions it

Three ways this fails quietly, now in `.env.example` and doc 08:

- **Instance version must be ≥ 1.20.1.** These rules use `config: edition: 3`
  (Sync Streams), and service-core 1.20.0 / sync-rules 0.32.0 ignored some
  filters under edition 3 — GHSA-q6wc-xx4m-92fj, authenticated users syncing
  rows they should not see. Our streams filter directly on `auth.user_id()`
  rather than using the affected shape, so they are probably fine, but tenant
  isolation is the whole argument for the narrow sync scope.
- **"Use Supabase Auth" is not just a checkbox.** Legacy HS256 project → paste
  the JWT Secret into the Legacy field. Newer asymmetric signing keys → leave it
  **empty** so PowerSync auto-configures JWKS. Wrong choice: the client connects
  and syncs nothing.
- **The publication must be named `powersync`.** It already is.

---

## Railway

Project `activ-hr`, service `web`, one container.
Live at `web-production-c7d3e.up.railway.app`.

Deployed with `railway up` from the working tree, not from GitHub — so what is
running is the branch state, not a pushed commit. Variables set on the service:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_ORG_TIME_ZONE`.

**`SUPABASE_SERVICE_ROLE_KEY` is set neither here nor in `.env.local`.** It was
reported as added; it is not in the file, which has not been modified since
6 Aug. Staff invite and the demo seeder are broken in both places until it is.

Two properties of this deployment worth carrying forward:

- **`NEXT_PUBLIC_*` is inlined at build time.** Variables were set *before* the
  first build for that reason; setting one afterwards does nothing until a
  rebuild. This is also why the values had to be right at project-creation time
  rather than fixed up after seeing the first deploy fail.
- **The rate limiter is per process.** Correct on one container, decorative at
  N replicas. Swap `RateLimitStore` for Redis *before* the second replica.

### The deploy found something the audit didn't

The smoke test asserted that protected routes redirect a signed-out visitor.
All five did — but look at the query strings:

```
/admin      -> /login?next=%2Fadmin     middleware (searchParams.set encodes)
/dashboard  -> /login?next=%2Fdashboard middleware
/super      -> /login?next=/super       the layout's own string
```

**`/super` was never in `PROTECTED_PATHS`.** Its layout was catching it.

Never an open hole — the layout redirect is real, and middleware's matcher still
ran `getUser()` on the route so session refresh was happening. What `/super`
lacked was the fail-closed env guard and any guarantee that protection survives
someone editing that layout.

The part that stings: **doc 12 used exactly this signature to diagnose the
middleware bug**, wrote down that encoded-vs-unencoded distinguishes the two
layers, and then recorded "all five redirect" as a pass. The evidence was in the
table. Third time around for the same lesson: *a route is only protected by the
layer you can point at.* Adding a route segment means adding it to
`PROTECTED_PATHS` in the same change.

---

## The rename to Activ-HR

**User-visible only, by explicit decision.** What changed: copy, page titles,
metadata, the wordmark, the footer attribution, the contact address. What did
not: the `--pac-*` design tokens and every `bg-pac-*` utility, the `attendpac`
package name, `attendpac.db`, and the `attendpac:offline-queue` localStorage key.

That last exclusion is the one with a reason beyond effort. Renaming the queue
key **orphans any punches queued on a device that hasn't synced** — they become
unreadable under the new key. Changing it needs a read-both-keys migration, and
that belongs with the step-4 rewrite that deletes the localStorage path anyway.

Two structural changes came out of it:

- **`src/lib/brand.ts`** — `PRODUCT_NAME`, `SUPPORT_EMAIL`, `SUPPORT_MAILTO`,
  `VENDOR_LINE`. The next rename is one file.
- **`src/components/brand/wordmark.tsx`** — the wordmark was the same pair of
  spans inlined in **seven** files (site header, footer, admin sidebar,
  `/super`, login, onboarding, reset-password). Having to edit seven files to
  change a name is the argument for it being one component. The italic-primary
  second half is kept: per [05](05-design-system.md) that accent is the brand's
  signature device, and the wordmark is where it's established.

> **`SUPPORT_EMAIL` is a placeholder.** It is `hello@activ-hr.com`, chosen so
> nothing shipped with the old brand on it. Nobody has confirmed that mailbox
> exists. It backs the contact form's fallback and the suspension notice, so if
> it doesn't receive mail then enquiries go nowhere — which is the exact failure
> [11](11-security-hardening.md) recorded for the old timeout-and-pretend
> contact form, reintroduced by a different route. One line to fix.

Note also that the FAQ's claims about a payroll **API** and **shift swaps** now
say "Activ-HR" instead of "AttendPAC". Doc 11 left those deliberately as
marketing copy; renaming them didn't make them true.

---

## `/dashboard` gets a sidebar

Four sections — Clock in, Shifts, History, Leave — with the same sliding active
highlight (`layoutId`) the admin sidebar uses, so a promoted employee recognises
the furniture.

**They are anchors into one page, not routes.** The alternative was
`/dashboard/shifts`, `/dashboard/attendance` and `/dashboard/leave`, which means
three more RLS-scoped queries and three more failure states — and doc 11 is
explicit that a failed query must not render as an empty state. For a shift
worker, "No shifts scheduled" when the query actually errored is the one wrong
answer with consequences. One page has one set of queries and one set of error
paths. Promote it when a section outgrows a card.

The active row is tracked with `IntersectionObserver` against the viewport,
which is correct **because `/dashboard` scrolls the document**. If its `<main>`
ever becomes its own `overflow-y-auto` container — as the admin one is — this
needs `root` set to that element. That is the same trap
[07](07-ui-motion-layer.md) hit with GSAP ScrollTrigger, and it is now commented
at the observer.

Mobile gets a horizontal rail rather than a dropdown: there are four
destinations and a dropdown hides all of them behind a tap. Sign-out stayed in
the header rather than being duplicated into the sidebar footer.

---

## Settings, no longer a stub

Doc 06 listed the gap as "site geofence *editing* (currently add/delete only)
and org profile/billing". All three are in.

**Organization rename** via `updateOrganizationName`. Name only — and not merely
by convention. Migration 0010 installs a `BEFORE UPDATE` trigger that lets an
org_admin change nothing on that row but its name, because RLS operates on rows
and this is a per-column rule. Plan tier and billing are therefore rendered
**read-only with a Callout pointing at us**, rather than as controls that would
always fail at the database. Widening the update payload doesn't grant
permission, it produces an opaque error.

**`updateSite`** is new. Sites could be added and deleted but never corrected,
so moving a fence twenty metres meant deleting and recreating it. The geofence
validation is now **extracted and shared** with `createSite` rather than copied:
doc 11 records three places where the audit found byte-identical security logic
in two files, and an edit path validating less than the create path would let
someone widen a radius to 20 km after the fact.

**The time rules are shown, not hidden** — timezone, the 07:15 late cutoff, the
09:00 absent cutoff. These three decide whether somebody is recorded as late,
and an admin reading a report is entitled to know what the number was computed
against. They are not editable: the timezone is an env var and the cutoffs are
org-wide constants. The real fixes — per-shift comparison against
`shifts.start_at`, and `sites.timezone` — both need migrations, and are still
doc 06's.

### A typing trap worth knowing

`updateSite` initially returned the *narrowed variable* from its validator
(`return checked`) instead of a fresh object literal. Every dialog under
`/admin` reads results as `result?.error`, which only type-checks while the
action's inferred return type is a union of object **literals** — TypeScript
normalises those by adding `error?: undefined` to the success member. Handing
back a typed variable breaks the normalisation, and the error surfaces at the
call site rather than in the action. Both actions now return fresh literals,
with a comment saying why.

---

## Landing page

- **"Who sees what" removed**, and the footer's `/#access` link removed with it
  rather than repointed. Doc 02 refused to ship dead links; leaving that one
  would have been shipping one.
- **The client band moved to just above the footer** and now animates. Under the
  hero it was asking for trust before the page had made any claim to
  corroborate.
- **The capture cards use `PixelCard`.**

### The marquee is CSS, not `LogoLoop`

React Bits has a component for this and it was rejected. Doc 07 records
`LogoLoop` as vendored and then removed — it was the only file producing lint
errors — and like every React Bits component it ignores
`prefers-reduced-motion`. Twenty lines in `globals.css` do the same job with a
media query that switches the animation off *and* drops the duplicated name set,
so reduced motion doesn't get five names printed twice.

The track holds the list twice and travels exactly `-50%`, so the second copy is
under the cursor as the first finishes and the seam is invisible. **Change the
duplicate count and the `-50%` together** or it jumps. Ends are masked rather
than cut, because a hard edge reads as clipped content — the defect doc 07 found
with the Aurora backdrop.

Doc 07's original objection to LogoLoop still stands, though: *five names is a
thin marquee.* Duplicating the list makes the belt continuous rather than five
names sliding past a gap, but adding real names is a better fix than tuning the
duration.

### `PixelCard` is a rewrite, not a wrapper

The third time this call has been made, after `ui/spotlight-card.tsx` and
`motion/bento.tsx`, and for the same two reasons. The registry component's root
element is

```
h-[400px] w-[300px] aspect-[4/5] rounded-[25px] border-[#27272a]
```

— a fixed-size, dark-only card with a 25px radius in a system whose radius is
`0.2rem` and which has to work on paper as well as ink. And it *concatenates*
the caller's `className` onto that string rather than merging it, so conflicting
utilities both land in the class attribute and CSS source order picks the
winner. You cannot reliably override it from outside.

Kept: the `Pixel` particle model, its appear/disappear/shimmer state machine,
and the 60fps rAF throttle. Changed:

- the surface is `ui/card.tsx`'s shell verbatim, so `CardHeader` /
  `CardContent` lay out inside it exactly as in a plain `Card`
- the canvas is an `aria-hidden`, absolutely-positioned background layer rather
  than a grid sibling of the content
- **colours are read from the `--pac-*` custom properties at init.** The brand
  ramp is theme-independent — only the surfaces flip between paper and ink — so
  one read suffices and there is no duplicated hex to keep in sync. This is the
  wart [09](09-v3-hero-and-bento.md) records for `hero-threads.tsx`, avoidable
  here only because a canvas fill style is a string, where a WebGL uniform is a
  `vec3` that cannot read CSS
- `prefers-reduced-motion` renders a plain card with no canvas and no listeners.
  The original still ran the rAF loop at speed 0

The vendored copy was **deleted** rather than left in `reactbits/`, since a
rewrite doesn't consume it and the repo already carries four orphans. Re-pull
with `curl https://reactbits.dev/r/PixelCard-TS-TW.json`.

The three capture methods stay side by side and equal-height. `CardSwap` was
considered and rejected: it turns a comparison into a sequence, and the point of
that section is that you can see all three at once.

---

## Verification

```
tsc --noEmit  ✓ exit 0
npm run lint  ✓ exit 0, no warnings
npm run build ✓ 19 routes + ƒ Middleware 92.9 kB, exit 0
Railway         deployment 76efd62c SUCCESS
```

Route sizes: `/` 32.1 kB (267 kB), `/dashboard` 11.1 kB (313 kB),
`/admin/settings` 5.7 kB (130 kB) — up from a 127 B stub.

Asserted against the **live deployment**, not a local build: no `AttendPAC` or
`pac.africa` anywhere in the HTML; `hello@activ-hr.com` present; "Who sees what"
and `id="access"` both gone; the marquee's byte offset is after the contact
section's, i.e. it really is near the bottom; three pixel canvases render; and
all six protected routes redirect with a **middleware-encoded** `?next=`,
including `/super`.

### Not verified — and this is the line that matters

**None of the visual work has been in a browser.** Playwright isn't installed
here, so what exists is HTML assertions and no pixels.
[07](07-ui-motion-layer.md), [09](09-v3-hero-and-bento.md) and
[12](12-platform-console-and-limits.md) each record a green build followed by
real defects found on the first actual look — a clipped backdrop, an invisible
CTA band, a middleware file that never compiled. Assume the same applies here.

The four things to look at first:

1. **`PixelCard` on paper.** Two inherited opacities have already needed
   lowering on paper specifically (Aurora, then Threads). An orange pixel field
   behind `CardDescription` is the same shape of problem, and the canvas is at
   `opacity-70` on a guess.
2. **The marquee** — seam at the wrap point, and whether 38s reads as calm or as
   broken.
3. **The employee sidebar at 390 and 320**, including whether `scroll-mt-20`
   actually clears the sticky mobile rail.
4. **`/admin/settings`** — four cards and a dialog, none of it looked at, and
   the dialog is the piece most likely to overflow on a phone.

Everything behind auth — `/dashboard`, `/admin/settings`, `/super` — still needs
a session, which is unchanged from [12](12-platform-console-and-limits.md).
