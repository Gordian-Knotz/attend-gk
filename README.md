# AttendPAC

Workforce attendance & time management platform — PAC Africa Technology Division.
Engineering delivery: Gordian Knotz Technovation.

## Stack

- **Next.js 15** (App Router, TypeScript) — pinned to 15, not latest, to stay
  consistent with pac.africa / jobs.pac.africa / cdp.pac.africa.
- **Tailwind CSS v4** (CSS-first config, no `tailwind.config.ts`).
- **shadcn/ui** components, hand-built rather than CLI-installed (see note
  below), style: `new-york`.
- **Supabase** (Postgres + Auth + RLS) — schema in `supabase/migrations/`.
- **next-themes** for the light/dark toggle.
- **@fontsource** packages for the brand typefaces — self-hosted, no Google
  Fonts CDN dependency.

## What's here

- **`/`** — marketing/landing page, with "Log in" / "Sign up" in the header
  (both go to `/login`) and a separate pilot-request contact form further
  down the page for prospective clients who aren't ready to self-serve.
- **`/login`** — Supabase email/password auth. Signing up creates a new
  account with no organization attached yet; signing in routes you to
  `/admin`, `/dashboard`, or `/onboarding` depending on your role.
- **`/onboarding`** — shown to any signed-in user with no `employees` row.
  Lets them name an organization and become its `org_admin`, via a
  dedicated Postgres RPC (`create_organization_for_self`) that bootstraps
  one org + one default site + their own employee row atomically.
- **`/dashboard`** — the staff-facing dashboard. Clock in/out (geofenced,
  browser Geolocation API, offline-queued via localStorage, server-side
  geofence re-validation on every submit) is one card among several — this
  week's shifts, recent attendance, and leave requests (submit + status)
  all live here too. The clock-in flow is the "Web Kiosk / QR" capture
  path from Section 04 — it shares the schema, geofence math, and
  offline-queue logic the React Native (Expo) app will use later.
- **`/admin`** — the admin dashboard. All of Overview, Sites, Staff,
  Schedule, and Devices now query and mutate real data:
  - **Overview** — today's present/late/absent/on-leave counts, an
    exceptions table, per-site check-in ratios.
  - **Sites** — list + add/delete, each showing staff and device counts.
  - **Staff** — roster with role/site, an "Invite staff" flow that sends a
    real Supabase Auth email invite and links the account, and remove.
  - **Schedule** — next 14 days of shifts grouped by day, add/delete.
    Managers can only write shifts at their own site (enforced by RLS, not
    just the UI).
  - **Devices** — registered biometric terminals per site, register/remove,
    each with an auto-generated webhook secret (partially masked).
  - **Reports** and **Settings** are still stubs.
- **`middleware.ts`** — refreshes the Supabase session and guards
  `/admin/*`, `/dashboard`, and `/onboarding` server-side, per Section 06.
  Passes requests through untouched if Supabase env vars aren't set, so
  the marketing site keeps working either way.

## Setting up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Copy `.env.example` to `.env.local` and fill in the three values from
   your project's API settings (you've already done this).
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
4. Run `supabase/seed.sql` — creates one demo org ("Alpha Pride Security")
   and one demo site ("Two Rivers Mall", Nairobi CBD coordinates).
5. Sign up via `/login` → "Sign up" with whichever email you want as your
   admin account, then run `supabase/setup-admin.sql` in the SQL editor —
   it links that account as `org_admin` of the demo org directly (skipping
   the auto-created empty org `/onboarding` would otherwise give you), so
   signing in immediately shows the fully populated dashboard.

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

## Next steps

1. **The "late" rule is a placeholder.** `src/lib/attendance.ts` currently
   flags anyone checking in after 7:15 AM org-wide. Once shift-aware
   scheduling logic is added, compare against each employee's actual
   `shifts.start_at` instead.
2. **Reports and Settings are still stubs.** Reports needs CSV/Excel
   export (Section 03); Settings needs site geofence editing (currently
   add/delete only, no edit) and org profile/billing.
3. **Realtime.** `/admin` re-queries on page load; wiring Supabase
   Realtime would make "Present today" genuinely live without a refresh.
4. **Mobile app.** React Native (Expo) — separate codebase — for the
   native GPS + selfie check-in flow, reusing the same geofence/offline
   approach as `/dashboard`. The biometric device webhook bridge (the other
   half of Section 04's capture layer — actually receiving pushes from a
   registered terminal) is also unbuilt; `/admin/devices` only manages
   device *records*, not the inbound webhook endpoint yet.
5. **Multi-org for super_admin.** The RLS now correctly lets `super_admin`
   see every org, but there's no UI yet to switch between them — only
   relevant once there's a second real client org on the platform.
6. Resolve the resourcing conflict flagged in the proposal (Section 01/08)
   before committing to timing on any of the above.
