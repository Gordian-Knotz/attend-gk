# Context & sessions

Working notes from the AttendPAC v1 → v2 merge, written so the reasoning
behind the current state of this repo survives past the session that
produced it. The root `README.md` tells you how to run the thing; these
files tell you why it looks the way it does.

Sessions: **6 August 2026** (docs 01–08) and **10 August 2026** — first the
v3 port (docs 09–10, plus corrections marked inline in 03, 04, 06, 07 and
08), then a security audit and hardening pass (doc 11, plus corrections in
01, 02, 06 and 07), then the platform console and rate limiting (doc 12),
then the Railway deploy, the Activ-HR rename and four pieces of product work
(doc 13, plus corrections in 08 and 12). Then **11 August 2026**: the `/super`
tenant detail pages, a 28-finding review of the whole branch, and the first
authenticated browser pass (doc 14, plus corrections in 03, 06, 09 and 12).

> **The product is called Activ-HR.** Renamed from AttendPAC on 10 Aug 2026,
> user-visible strings only — the `--pac-*` design tokens, the `attendpac`
> package name and the `attendpac:offline-queue` key all keep the old name on
> purpose. Docs written before the rename say AttendPAC throughout; they are
> historical and were left alone. See [13](13-railway-rename-and-product-work.md).

| File | What's in it |
|---|---|
| [01-codebase-comparison.md](01-codebase-comparison.md) | The full v1 vs v2 audit: file counts, stack, routing, schema, and where each version genuinely won |
| [02-merge-decisions.md](02-merge-decisions.md) | Which direction the merge ran, what was ported, what was discarded, and the reasoning for each call |
| [03-what-was-built.md](03-what-was-built.md) | File-by-file breakdown of everything added or changed, with the non-obvious implementation details |
| [04-database-and-rls.md](04-database-and-rls.md) | Schema divergence, the RLS bugs found in both codebases, the new migrations — **and the 0007 geofence bypass found 10 Aug** |
| [05-design-system.md](05-design-system.md) | DS-01 tokens, the component conventions the ported UI had to match, and the design calls made along the way |
| [06-next-steps.md](06-next-steps.md) | Known gaps, caveats worth knowing before trusting a number on screen, and what to pick up next |
| [07-ui-motion-layer.md](07-ui-motion-layer.md) | React Bits: how it's installed (the CLI is broken here), what's vendored, every wrapper and why, and how to dial it back |
| [08-powersync-offline.md](08-powersync-offline.md) | Offline sync: scope, the geofence hole PowerSync's write path opened, and what's left to go live |
| [09-v3-hero-and-bento.md](09-v3-hero-and-bento.md) | What attend-v3 is, the centred Threads hero, and the bento rewrite on `/admin` — with the browser checks still owed |
| [10-live-db-bringup.md](10-live-db-bringup.md) | The ordered plan for running 0005–0008 against a real Postgres, with fixtures and expected values for every check |
| [11-security-hardening.md](11-security-hardening.md) | The CodeRabbit audit: how to run it on a whole codebase, the five criticals, the self-approved-leave hole it missed, and migration 0008 |
| [12-platform-console-and-limits.md](12-platform-console-and-limits.md) | `/super`, rate limiting (and why auth had to move server-side first), cookie/JWT policy, and the caching rule |
| [13-railway-rename-and-product-work.md](13-railway-rename-and-product-work.md) | The Railway deploy and what it found, the Activ-HR rename, the employee sidebar, Settings wired, and the landing-page changes |
| [14-tenant-detail-and-first-authed-pass.md](14-tenant-detail-and-first-authed-pass.md) | `/super/orgs/[id]`, the 28-finding CodeRabbit review (including a rate-limiter bypass), migration 0012, and the first authenticated browser pass — which found the mobile dashboard broken |
| [coderabbit-findings-10aug.md](coderabbit-findings-10aug.md) | Raw output — all 90 findings by severity |

## Where we left off — 11 Aug 2026 (tenant pages, reviewed, first authed pass)

`tsc`, `lint`, `build` (**17 routes + `ƒ Middleware`**), `npm test` 9/9,
`npm run smoke` 107/107 and `npm run smoke:authed` 41/41 all green. On branch
**`harden-security-audit`**, pushed, **not merged**.

> **Start here: [14](14-tenant-detail-and-first-authed-pass.md).** Three things
> from it that change what you should do next:
>
> 1. **Migrations 0001–0012 are ALL applied.** 0012 landed 11 Aug and was
>    verified behaviourally, not assumed: as a real staff session,
>    `employee_site_id()` now returns `null` for an employee in another
>    organization and the correct site for one in your own. Both smoke passes
>    stayed green afterwards, so the narrower function broke no legitimate read.
>    Caveat: `purge_contact_requests` exists but is **not scheduled**.
> 2. **The rate limiter was bypassable.** `clientIpFrom` trusted the leftmost
>    `x-forwarded-for` entry — the one the caller sets. Fixed, but it means the
>    limiting doc 12 describes was decorative against a real attacker until now.
> 3. **The first authenticated look found `/dashboard` broken at mobile widths**
>    — the rail sat beside the content, 627px wide in a 390px window. Fixed.
>    `npm run smoke:authed` exists so this is checkable from now on.

> **RLS is verified on the live database for the first time.** With a real staff
> session: `biometric_devices` returns 0 rows (doc 11's worst finding, closed and
> proven), `leave_requests` returns only their own (0008's four-tier policy
> holds), and only their own organization is visible. See doc 14.

**The app is deployed.** Railway project `activ-hr`, service `web`, one
container, live at `web-production-c7d3e.up.railway.app`. Deployed from the
working tree with `railway up`, so what runs there is the branch state.
Migrations **0001–0011 are all applied** to the live Supabase project.

> ~~`SUPABASE_SERVICE_ROLE_KEY` is missing~~ — **added 11 Aug**, to `.env.local`
> and to Railway. Staff invite and the seeder work now.
>
> Still outstanding: **`SUPPORT_EMAIL` in `src/lib/brand.ts` is a placeholder**
> (`hello@activ-hr.com`, unconfirmed), and it backs the contact form's fallback
> and the suspension notice. One line.

> **The public routes have had a browser pass: `npm run smoke`.** 99 checks at
> three widths in both themes, plus reduced motion. It found **five hydration
> mismatches** (React #418) caused by five components deciding a reduced-motion
> fallback *during render* — live since 6 Aug, invisible until someone finally
> emulated the preference. All fixed by gating on mount. Full account in
> [13](13-railway-rename-and-product-work.md).
>
> **Partly resolved 11 Aug.** `/dashboard` *has* now been rendered, via a staff
> demo account, and it was broken at mobile widths — see doc 14.
> `npm run smoke:authed` covers it at three widths in both themes. Still
> unrendered: `/super`, `/super/orgs/[id]`, `/admin/settings`, `/admin` and
> `/checkin` — those need an **admin or super_admin** session, and the demo
> account is staff. Extend the authed script's matrix once you have one.

> **Lighthouse: performance 72, accessibility 100, best practices 100, SEO 100.**
> Paint is fine (FCP 0.6s, LCP 1.4s, CLS 0); the score is held down by **600 ms
> of blocking time from 1.6 s of script bootup** — the motion layer, not the
> bundle. Unused JS is only 48 KiB, so code-splitting is not the fix. Making it
> faster means dialling back WebGL/gsap, which is a brand decision; the options
> are ranked at the end of [13](13-railway-rename-and-product-work.md).

> **Read this first if you read nothing else.** The browser pass found that
> **`middleware.ts` had never run** — it sat at the repository root while the
> app lives in `src/`, so Next never compiled it. No warning, no error, two
> sessions of green builds. Route protection was entirely page-level, and
> **server-side session refresh was never happening**, which is the likeliest
> cause of any "randomly signed out" behaviour. Moved to `src/middleware.ts`;
> the build now reports it. Full account in
> [12](12-platform-console-and-limits.md).

> **The live project is further along than these docs used to claim.**
> Migrations **0001–0011 are all applied** as of 10 Aug. The repeated "nothing
> has run against a live Supabase instance" in docs 03, 06 and 11 is out of
> date — see the table in [12](12-platform-console-and-limits.md) for the probe
> and [13](13-railway-rename-and-product-work.md) for the 0008–0011 confirmation.

> Note: the entry below previously said "committed, not pushed" of the v3
> hero work. `main` *is* pushed — `github.com/Gordian-Knotz/attend-gk`,
> 0 ahead / 0 behind. Corrected.

### What changed — part three: deploy, rename, product work ([13](13-railway-rename-and-product-work.md))

- **Railway.** Project `activ-hr`, one container. Every `NEXT_PUBLIC_*` value is
  inlined at **build** time, so setting one after a deploy does nothing until a
  rebuild.
- **The deploy found `/super` missing from `PROTECTED_PATHS`** — its layout was
  catching it, not middleware. Not an open hole, but doc 12 had recorded "all
  five redirect" as a pass while its own encoded-vs-unencoded `?next=` test sat
  in the evidence. Third outing for the same lesson.
- **Renamed to Activ-HR**, user-visible only. Strings in `src/lib/brand.ts`; the
  wordmark, previously inlined in seven files, is one component.
- **`/dashboard` has a sidebar** — four anchors into one page rather than four
  routes, so there stays one set of queries and one set of failure states.
- **Settings is no longer a stub** — org rename, per-site geofence editing, and
  plan/billing read-only *because 0010's trigger enforces that*, not by
  convention.
- **Landing page** — "Who sees what" removed (and its footer link with it), the
  client band moved above the footer as a CSS marquee, capture cards rebuilt on
  a rewritten `PixelCard`.
- **PowerSync stays paused, but is unblocked.** The migration gate is clear, the
  `libpowersync*.wasm` "blocker" was never real, and the `own_attendance` stream
  contradicted `insertOnly` and is gone.

### What changed — part two: platform console ([12](12-platform-console-and-limits.md))

- **`/super`** — PAC's own operator console. Cross-org metrics (paying, on
  trial, genuinely active) plus writes for plan tier, billing status and
  suspension. Its own route segment, not part of `/admin`, so the
  one-org-at-a-time assumption every `/admin` page makes can't leak.
  `/admin/organizations` now redirects there.
- **Rate limiting** on auth, attendance and the contact form. In-memory,
  which is correct on one Railway container and **wrong past one replica** —
  swap `RateLimitStore` for Redis when you scale.
- **Auth moved to server actions.** It ran browser-side, so no limiter could
  see it. Side effects: no more account-existence oracle, and `/login`
  dropped 231 kB → 163 kB.
- **Cookie and JWT policy** in one place, PKCE everywhere. The dashboard
  settings that aren't code are tabulated in doc 12.
- **Caching**, with the rule that most of this data is RLS-scoped and must
  never enter a shared cache.
- **Migrations 0009** (contact_requests) **and 0010** (billing constraint,
  suspension, per-column update guard). Both applied since, on 10 Aug.

### What changed — part one: the audit ([11](11-security-hardening.md))

A full-codebase CodeRabbit review, then **88 of its 90 findings applied**,
plus one hole it missed. Raw findings in
[coderabbit-findings-10aug.md](coderabbit-findings-10aug.md).

The five things most worth knowing:

1. **`0008_attendance_insert_integrity.sql`** closes the 0007 bypass and four
   more RLS holes. Re-runnable by design. **Applied 10 Aug**, with 0009–0011.
2. **Staff could approve their own leave** — CodeRabbit missed this one.
   `leave: self insert` checked only `employee_id`, and `status` had no
   constraint, so posting `status: 'approved'` moved you out of the absent
   count. A second fraud path that never touches the geofence.
3. **Any employee could read biometric webhook secrets**, which authenticate
   the geofence-exempt `biometric` source. Now admin-only, and the devices
   page no longer selects the column.
4. **Everything time-related ran on the server's timezone.** New
   `src/lib/timezone.ts` makes `Africa/Nairobi` (env-overridable) the single
   source for cutoffs, bucketing and display.
5. **Failed database queries rendered as confident empty states** — "No
   staff yet", all KPIs zero, and an exportable CSV of zeros.

### Blocked on you, in order

1. ~~**Run migrations 0008, 0009, 0010 and 0011.**~~ **Done, 10 Aug 2026.**
   Both live holes are closed: the geofence is no longer bypassable via
   `source: 'biometric'` (0008 pins `org_id`, `site_id` and `source` on the
   staff insert policy), and an `org_admin` can no longer PATCH themselves to
   `super_admin` (0011). Verified through PostgREST —
   `attendance_events.client_event_id`, `contact_requests` and
   `organizations.suspended_at` all resolve, so the schema cache picked the
   changes up too. 0011 is a trigger and can't be probed anonymously; its
   test is in [10](10-live-db-bringup.md)'s checklist.
2. **Add `SUPABASE_SERVICE_ROLE_KEY`** — to `.env.local` *and* to Railway.
   Still absent from both as of 10 Aug; the only keys in the file are the two
   `NEXT_PUBLIC_` Supabase ones. Blocks the `/admin/staff` invite and
   `scripts/seed-demo-data.mjs`, in dev and in production.

   ```bash
   railway variables --service web --set "SUPABASE_SERVICE_ROLE_KEY=<key>"
   ```
3. **Confirm the support address.** `SUPPORT_EMAIL` in `src/lib/brand.ts` is
   `hello@activ-hr.com` — a placeholder nobody has verified receives mail. It
   backs the contact form's fallback and the suspension notice, so if it
   doesn't, enquiries vanish silently. One line.
4. **Look at the routes behind auth in a browser.** The public ones are done —
   `npm run smoke` covers them at three widths in both themes plus reduced
   motion, 107 checks, and it found five hydration bugs and a landing-page
   overflow. Playwright *is* installed now. What it cannot reach is anything
   needing a session: `/dashboard` with its sidebar, `/admin/settings`,
   `/super` and the new `/super/orgs/[id]`. The tenant page's layout was checked
   through a fixture route (which found a real overflow bug); the real page with
   real data has still never rendered.
5. **Work through [10](10-live-db-bringup.md)** — seed against the real project,
   then the three computations most likely to be subtly wrong (day bucketing,
   check-in pairing, absent arithmetic). The migrations half of that plan is
   done; Phase 3 and Phase 4 are not. Add the 0008 cases from
   [11](11-security-hardening.md) to Phase 4.
6. **Browser-check the routes behind auth.** The public ones are done —
   see [12](12-platform-console-and-limits.md). Still unrendered: `/super`
   (never once), `/admin` as the real page, `/dashboard`, `/checkin`,
   `/onboarding`. All need a session. Also worth exercising once you have
   one: a suspend/restore round trip on a scratch org, and that a ~20-punch
   offline-queue drain doesn't trip the attendance limiter.
7. ~~`npm install-scripts approve @journeyapps/wa-sqlite`~~ **Closed — it was
   never a blocker.** Approved on 10 Aug; the script then runs and **404s**
   fetching `libpowersync.wasm@v0.5.2`, which is simply not published. It
   doesn't matter: `@powersync/web` only loads the *static* wa-sqlite builds,
   which are present and already copied into `public/@powersync/assets/`. The
   package's own error says as much. Full account in
   [08](08-powersync-offline.md).
8. **Provision PowerSync** — Cloud instance, `supabase/powersync-setup.sql`
   on a **direct** Postgres connection (DDL and `CREATE ROLE` can't go
   through PostgREST), deploy `powersync/sync-rules.yaml`, then the env var.
   The migration gate is clear, so this is now unblocked. Read
   [08](08-powersync-offline.md) item 2 first — the instance version, the
   "Use Supabase Auth" JWT setup and the publication name each fail quietly
   if you get them wrong.

**First job after those:** rewrite `src/app/dashboard/checkin-widget.tsx`
and `/checkin` onto local SQLite, dropping the localStorage queue. Held back
deliberately — see the end of [08](08-powersync-offline.md).

### The browser pass was done

Playwright at 1366×1000, 390×844 and 320×844, both themes, **zero console
errors**. Full results in [09](09-v3-hero-and-bento.md).

Confirmed: Threads is exactly full-bleed with no hard edges (the Aurora
defect did not recur); `color-mix` + `calc()` resolves so the glow ring
really paints; the proximity maths works, including the edge-distance change
that keeps the large chart card lit; mobile stacks cleanly.

**Two defects found and fixed:** the italic accent phrase was breaking across
the line (now `whitespace-nowrap`, break falls at the sentence boundary), and
Threads at 40% muddied the hero paragraph on paper (now 25% light / 60%
dark).

Mobile widths are no longer unreviewed — the landing page and the bento were
both checked at 390 and 320.

**Still unreviewed:** `/admin` as the real page rather than a fixture copy,
plus `/dashboard`, `/checkin` and `/onboarding`. All need an authenticated
session, so they depend on item 3 above.

> **Scope note, security pass.** The above describes the *v3 hero* browser
> pass only. Nothing from the hardening session has been in a browser —
> see [11](11-security-hardening.md) → Verification.

### Open decisions

**`RevealHeading` renders `opacity: 0` into the SSR HTML**, so section
headings stay invisible if JS never runs. Inherent to scroll-triggered
reveals. Accept it, reveal on mount rather than on scroll, or drop `initial`
and animate from a CSS-visible state.

**`hero-threads.tsx` duplicates `--pac-orange` as a literal**
(`[0.91, 0.325, 0.18]`) because a WebGL uniform can't read a CSS variable.
If the token changes, that number has to change with it. No good way around
it; worth knowing it's there.

**Four orphaned files** left on disk so the previous hero can be restored:
`hero-backdrop.tsx`, `hero-preview.tsx`, `hero-rotator.tsx`,
`reactbits/Aurora.tsx`. Delete them once the new hero has been seen and kept.

### Also open, carried over

Generate database types (`supabase gen types`) — the Supabase client is
still untyped. The stray `C:\Users\PAC\package-lock.json` that makes every
build warn about workspace root. `next lint` is deprecated in Next 16 (the
`lint` script already calls `eslint` directly, so this is mostly done).
`setup-admin.sql` now takes the bootstrap super-admin's address as a
variable you edit at the top; it used to hardcode a personal one.

## The short version

Two independent builds of the same product existed: `attend-v1` and
`attend-v2`, both Next.js + Supabase, neither under version control.

The working assumption going in was "v1 is stronger on frontend, v2 has the
backend." The audit didn't support that. **v2 was ahead on both** — it has a
real design system, a component library, and roughly 4,300 lines of working
app code against v1's 1,200. v1's genuine advantages were narrower and
specific: more marketing copy, working charts, a cross-org admin view, and
password reset.

So: **v2 became the base, and v1's real wins were rebuilt inside it.** No v1
code was copied verbatim — its Supabase clients don't run on Next 15, and
its data model is incompatible with v2's. See
[02-merge-decisions.md](02-merge-decisions.md) for the full rationale.

`attend-v1` was left untouched on disk as a reference copy. Nothing in this
repo depends on it.

## A note on this folder's name

Renamed from `context & sessions` to `context-sessions` on 10 Aug 2026. The
`&` needed quoting in every shell that touched it. Older documents in this
folder still quote the old path where they are recording what was written at
the time — those are historical and were left alone; live references in the
root `README.md` were updated.
