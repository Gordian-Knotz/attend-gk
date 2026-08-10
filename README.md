# Activ-HR

Workforce attendance & time management platform.
Engineering delivery: Gordian Knotz Technovation.

> Renamed from AttendPAC on 10 Aug 2026. The rename is **user-visible only**:
> the DS-01 design tokens are still `--pac-ink`, `--pac-orange` and friends,
> the npm package is still `attendpac`, and the PowerSync database file and
> offline-queue key still carry the old name — renaming that key would orphan
> punches queued on a device that hasn't synced yet. Every customer-facing
> string lives in `src/lib/brand.ts`.

## Stack

- **Next.js 15** (App Router, TypeScript) — pinned to 15, not latest, to stay
  consistent with the other properties in the estate.
- **Tailwind CSS v4** (CSS-first config, no `tailwind.config.ts`).
- **shadcn/ui** components, hand-built rather than CLI-installed (see note
  below), style: `new-york`.
- **Supabase** (Postgres + Auth + RLS) — schema in `supabase/migrations/`.
- **Recharts** for the attendance trend and per-site charts.
- **Motion** (formerly Framer Motion — the `motion` package) for reveals,
  page transitions and the sliding nav indicators.
- **React Bits** components, vendored into `src/components/reactbits/` and
  used through brand wrappers. See
  `context-sessions/07-ui-motion-layer.md`.
- **PowerSync** (`@powersync/web`) for offline check-in — wired but inert
  until `NEXT_PUBLIC_POWERSYNC_URL` is set. See
  `context-sessions/08-powersync-offline.md`.
- **next-themes** for the light/dark toggle.
- **@fontsource** packages for the brand typefaces — self-hosted, no Google
  Fonts CDN dependency.

## What's here

- **`/`** — marketing/landing page: hero, client band, the full feature
  inventory grouped into four clusters, the three capture methods, an
  industry switcher (five industries, deep-linkable as `/#logistics` etc.),
  FAQs, a pilot-request contact form, and the client band — which now sits
  immediately above the footer as a paused-on-hover marquee. "Log in" /
  "Sign up" in the header both go to `/login`.

  The roles table ("Who sees what") was removed on 10 Aug, and the footer link
  pointing at it went with it rather than becoming a dead anchor.
- **`/login`** — Supabase email/password auth, with a "Forgot password?"
  flow that emails a reset link. Signing up creates a new account with no
  organization attached yet; signing in routes you to `/admin`,
  `/dashboard`, or `/onboarding` depending on your role.
- **`/reset-password`** — where that emailed link lands. Exchanges the
  recovery code for a short-lived session, takes a new password, then signs
  out and sends you back to `/login`.
- **`/onboarding`** — shown to any signed-in user with no `employees` row.
  Lets them name an organization and become its `org_admin`, via a
  dedicated Postgres RPC (`create_organization_for_self`) that bootstraps
  one org + one default site + their own employee row atomically.
- **`/dashboard`** — the staff-facing dashboard, behind its own sidebar
  (Clock in / Shifts / History / Leave, highlighted by scroll position; a
  horizontal rail at mobile widths). Those four are anchors into one page
  rather than routes, so there is one set of queries and one set of failure
  states to get right. Clock in/out (geofenced,
  browser Geolocation API, offline-queued via localStorage, server-side
  geofence re-validation on every submit) is one card among several — this
  week's shifts, recent attendance, and leave requests (submit + status)
  all live here too. The clock-in flow is the "Web Kiosk / QR" capture
  path from Section 04 — it shares the schema, geofence math, and
  offline-queue logic the React Native (Expo) app will use later.
- **`/admin`** — the admin dashboard. All of Overview, Sites, Staff,
  Schedule, and Devices now query and mutate real data:
  - **Overview** — today's present/late/absent/on-leave counts, a 14-day
    attendance trend chart, an exceptions table, per-site check-in ratios,
    and a notices panel (post/dismiss org- or site-wide messages).
  - **Sites** — list + add/delete, each showing staff and device counts.
  - **Staff** — roster with role/site, an "Invite staff" flow that sends a
    real Supabase Auth email invite and links the account, and remove.
  - **Schedule** — next 14 days of shifts grouped by day, add/delete.
    Managers can only write shifts at their own site (enforced by RLS, not
    just the UI).
  - **Devices** — registered biometric terminals per site, register/remove,
    each with an auto-generated webhook secret (partially masked).
  - **Reports** — 7/14/30-day timesheet: hours worked (from paired
    check-in/check-out events), attendance rate, late arrivals and
    absences, the trend and per-site charts, a per-employee table, and a
    CSV export that matches the table exactly.
  - **Organizations** — super_admin only, hidden from everyone else: every
    client org on the platform with plan tier, billing status, and staff
    and site counts. Read-only; there's no org-switcher yet.
  - **Settings** — organization rename, plan and billing shown read-only,
    per-site geofence editing, and the timezone plus late/absent cutoffs that
    every report is computed against. Billing is read-only because the database
    enforces it: migration 0010's `BEFORE UPDATE` trigger lets an org_admin
    change nothing on that row but its name, so an editable control here would
    be a form that always fails.
- **`src/middleware.ts`** — refreshes the Supabase session and guards
  `/admin`, `/dashboard`, `/checkin`, `/onboarding`, `/super` and `/api`
  server-side, per Section 06. In production it **throws** when the Supabase
  env vars are missing rather than passing requests through unauthenticated;
  it falls through only in development.

  It must sit at `src/middleware.ts`, beside the `app` directory. At the
  repository root Next does not compile it at all — no warning, no error, and
  two sessions of green builds while route protection and server-side session
  refresh silently never happened. See doc 12.

## Setting up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Copy `.env.example` to `.env.local` and fill it in from your project's
   API settings. `SUPABASE_SERVICE_ROLE_KEY` is required for the staff
   invite and the demo seeder, and bypasses RLS — server-side only.
3. Run the migrations, in order — either `supabase db push` (CLI) or paste
   each file into the SQL editor:
   - `supabase/migrations/0001_init_schema.sql` — schema + RLS
   - `supabase/migrations/0002_self_serve_signup.sql` — the onboarding RPC
   - `supabase/migrations/0003_fix_super_admin_scope.sql` — RLS fix: an
     earlier bug scoped `super_admin` to their own org on most tables
     (should see *all* orgs, per Section 06), and `org_admin`'s "manage"
     policies on shifts/attendance_summary/devices/payroll had no org_id
     check at all (real cross-tenant write bug). Fixed here.
   - `supabase/migrations/0004_manager_shift_access.sql` — RLS fix: 0003
     only gave org_admin/super_admin write access to shifts, leaving out
     managers entirely, despite Section 06 explicitly giving managers
     "build/edit shifts for their site." Added, scoped to their own site.
   - `supabase/migrations/0005_super_admin_site_read.sql` — RLS fix: 0003
     gave `super_admin` cross-org *write* access to sites but left the
     *select* policy org-scoped, so the platform overview could write rows
     it couldn't read. Brought in line.
   - `supabase/migrations/0006_notifications.sql` — the `notifications`
     table (org- or site-scoped notices with an info/warning/critical
     level) plus its RLS.
   - `supabase/migrations/0007_geofence_enforcement.sql` — moves the
     geofence out of the server action and into a `BEFORE INSERT` trigger,
     so every write path is covered (PowerSync's upload path never calls
     the action). **Not sufficient alone — apply 0008 with it.**
   - `supabase/migrations/0008_attendance_insert_integrity.sql` — the
     policies 0007 depends on. 0001's insert policy constrained only
     `employee_id`, so a client could pick the trigger's exempt branches
     itself and skip the geofence. Also stops staff self-approving leave,
     stops plain staff reading device webhook secrets, and adds the
     idempotency key the offline queue needs. Security-relevant: do not
     run 0007 without it.
   - `supabase/migrations/0009_contact_requests.sql` — where the landing
     page's pilot enquiries land. The only anon-writable table in the
     schema; read the header before copying its policy anywhere.
   - `supabase/migrations/0010_platform_administration.sql` — constrains
     `billing_status` to a closed set, adds organization suspension, and
     stops an `org_admin` changing their own plan, billing or suspension.
     Rewrites existing `billing_status` values before adding the
     constraint — read it before running it.
   - `supabase/migrations/0011_employee_role_integrity.sql` — stops an
     `org_admin` promoting themselves to `super_admin`. 0003's roster policy
     constrains *who* may write and *which org's rows*, but not the `role`
     column, so `PATCH /employees?id=eq.<self> {"role":"super_admin"}`
     worked. Security-relevant; apply it before anyone but you has an
     `org_admin` account.
4. Run `supabase/seed.sql` — creates one demo org ("Alpha Pride Security"),
   one demo site ("Two Rivers Mall", Nairobi CBD coordinates), and two demo
   notices. Run it after *all* the migrations, not just 0001 — it inserts
   into `notifications`.
5. Sign up via `/login` → "Sign up" with whichever email you want as your
   admin account, then run `supabase/setup-admin.sql` in the SQL editor —
   it links that account as `org_admin` of the demo org directly (skipping
   the auto-created empty org `/onboarding` would otherwise give you), so
   signing in immediately shows the fully populated dashboard.

### Becoming a super admin

`super_admin` is PAC's own role, not a tenant's. It sees every organization
and it is the only role that can reach `/super` — the platform console where
plan tier, billing status and suspension are set.

There is no UI for granting it, deliberately: after migration 0011 the only
way to mint one is a connection with no JWT, which means the Supabase SQL
editor, a migration, or the service role. A signed-in `org_admin` cannot do
it, including to themselves.

**Bootstrap the first one:**

1. Sign up normally at `/login?mode=sign-up`. This creates the `auth.users`
   row and nothing else.
2. Get an `employees` row. Either complete `/onboarding` (creates your own
   org and makes you its `org_admin`), or run `supabase/setup-admin.sql`
   after editing `v_admin_email` and `v_admin_name` at the top — that
   attaches you to the seeded demo org instead.
3. Promote yourself, in the **Supabase SQL editor**:

   ```sql
   update employees
   set role = 'super_admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```

4. Reload the app. No sign-out needed — the role is read from `employees` on
   each request, not baked into the JWT. A "Platform" group appears at the
   bottom of the admin sidebar with a link to `/super`.

**Granting it to someone else afterwards:** as an existing `super_admin` you
can run the same `update` through the app's own client, because the 0011
trigger exempts callers who are already `super_admin`. In practice, use the
SQL editor — it is auditable and there is no button for it.

**Checking who has it:**

```sql
select e.full_name, u.email, o.name as org
from employees e
join auth.users u on u.id = e.id
join organizations o on o.id = e.org_id
where e.role = 'super_admin';
```

Keep that list short. A `super_admin` reads every tenant's attendance data
and can suspend any of them.

### Populating a realistic demo

Once the schema and your account are set up, seed a full demo dataset —
more sites, one biometric device per site, ~14 fake staff accounts, a week
of realistic present/late/absent/on-leave attendance history, and the next
7 days of scheduled shifts:

```bash
node --env-file=.env.local scripts/seed-demo-data.mjs
```

This needs `SUPABASE_SERVICE_ROLE_KEY` (already in your `.env.local`) since
it creates real `auth.users` via the Admin API — that's also why it has to
run on your machine rather than in a sandboxed build environment. It's
safe to re-run — it skips anything that already exists by name/email, but
will add another week of attendance history and another 7 days of shifts
each time (harmless for a demo).

If you've already run an earlier version of this script, just re-run it —
it'll fill in the devices and shifts it didn't create before.

After seeding, sign in as your own (org_admin) account and open `/admin` —
Overview, Sites, Staff, Schedule, and Devices should all be fully
populated.

## Brand system

Colors, type, and the paper/ink duality come straight from `DS-01 — The
PAC Document Format`. Full palette and font stacks live in
`src/app/globals.css`:

| Token                | Hex       | Used as                               |
|----------------------|-----------|------------------------------------------|
| `--pac-ink`           | `#171210` | dark-mode background, light-mode text  |
| `--pac-graphite`      | `#2A211D` | dark-mode card/surface                 |
| `--pac-orange`        | `#E8532E` | primary — buttons, links, focus ring   |
| `--pac-orange-light`  | `#F4A98D` | light-mode accent / tint surfaces      |
| `--pac-ember`         | `#A63A1C` | destructive, dark-mode accent          |
| `--pac-paper`         | `#F7F3EC` | light-mode background, dark-mode text  |

`secondary`, `muted`, and `border` are **derived** shades needed for app UI
surface hierarchy that DS-01 (a print-document spec) didn't need to define.

Typography: **Source Serif 4** (display/headings), **IBM Plex Sans**
(body/UI), **IBM Plex Mono** (labels, metadata, status chips).

The doc's three-tier callout system (§04 — rule+chip / label-bar-on-tint /
ink panel) is implemented as `src/components/callout.tsx`.

## A note on the shadcn CLI

`npx shadcn add <component>` needs to reach `ui.shadcn.com`, which wasn't
reachable from the sandbox this was built in — so the components in
`src/components/ui/` were written by hand instead of CLI-generated.
`components.json` is configured correctly, so the CLI works normally for
you from here on.

## Running it

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` first. Without the two
`NEXT_PUBLIC_SUPABASE_*` values the app runs but nothing authenticates; in
production it refuses to serve at all, deliberately.

## Deploying

Railway, one container. `npm run build` then `npm start`; `next start` picks up
Railway's `PORT` on its own, so there is nothing to configure there.

```bash
railway up --service web --detach
railway deployment list --service web --json   # poll until SUCCESS
```

Two things about this deployment specifically:

- **Every `NEXT_PUBLIC_*` variable is inlined at build time.** Setting one after
  a deploy does nothing until the service rebuilds.
- **The rate limiter is per process.** `src/lib/rate-limit.ts` holds its buckets
  in a module-scope `Map`, which counts correctly on one long-lived container
  and becomes decorative at N replicas, where the real ceiling is N × the
  configured limit. `RateLimitStore` is an interface so it can be swapped for
  Redis when you scale out — do that before adding the second replica, not
  after.

## Next steps

1. **The "late" rule is a placeholder.** `src/lib/attendance.ts` currently
   flags anyone checking in after 7:15 AM org-wide. Once shift-aware
   scheduling logic is added, compare against each employee's actual
   `shifts.start_at` instead.
2. **Payroll API push.** Reports covers the CSV half of Section 03; a direct
   push to a payroll provider is still unbuilt. Settings itself is no longer a
   stub — geofence editing and the org profile landed 10 Aug.
3. **Nothing writes `notifications` automatically.** The intended writers
   are the exception detector and the biometric webhook bridge, both
   unbuilt — for now notices are posted by hand from `/admin`.
4. **Reports assumes today's roster applied to the whole period.** Someone
   hired last week reads as absent on days before they joined; fixing that
   needs employment start/end dates on `employees`.
5. **Realtime.** `/admin` re-queries on page load; wiring Supabase
   Realtime would make "Present today" genuinely live without a refresh.
6. **Mobile app.** React Native (Expo) — separate codebase — for the
   native GPS + selfie check-in flow, reusing the same geofence/offline
   approach as `/dashboard`. The biometric device webhook bridge (the other
   half of Section 04's capture layer — actually receiving pushes from a
   registered terminal) is also unbuilt; `/admin/devices` only manages
   device *records*, not the inbound webhook endpoint yet.
7. **Multi-org for super_admin.** `/admin/organizations` now lists every
   org, but the rest of the dashboard still scopes to the operator's own
   org — there's no switcher to view another org's sites or staff.
8. Resolve the resourcing conflict flagged in the proposal (Section 01/08)
   before committing to timing on any of the above.

## Merge note — where this code came from

An earlier prototype (Next 14 / Tailwind 3 / no component
library) was folded into this codebase rather than kept alongside it. This
repo is the base; nothing was carried over wholesale, because the two had
incompatible data models — `profiles` vs `employees`, and a flat
`clock_in`/`clock_out` row per day vs the event-sourced `attendance_events`
here, which is what makes the offline queue correct.

What was rebuilt from it, on this design system: the marketing page's
feature clusters, industry switcher, FAQs, client band and columned footer;
the Recharts trend/bar charts (previously wired to placeholder zeroes,
now to real queries); the super-admin cross-org view; the password-reset
flow; and the `notifications` table.

What was deliberately left behind: its schema and RLS (one policy let any
authenticated user insert attendance rows for a colleague in the same org),
its Supabase clients (they call `cookies()` synchronously, which Next 15 still
shims with a warning but hard-fails under `cacheComponents` — so they needed
migrating to `await cookies()` either way), its hand-written database types, and
its Tailwind 3 theme.

The full audit, the reasoning behind each call, and a file-by-file
breakdown live in **[`context-sessions/`](context-sessions/)** —
start with its README. Read `04-database-and-rls.md` before changing
anything under `supabase/`.
