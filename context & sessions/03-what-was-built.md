# 03 — What was built

File-by-file. 16 files added, 10 modified. Build and lint both clean at the
end of the session (`next build` → 18 routes, `next lint` → no warnings).

---

## Marketing page

### `src/components/site/trust-bar.tsx` — new

Client band: five named organizations under a "Trusted by growing teams
across East Africa" label.

v1 rendered these as `rounded-pill` chips. DS-01 sets `--radius: 0.2rem` —
near-square — so pill chips fight the rest of the app. Rebuilt as a
masthead: mono label, serif names, hairline top and bottom borders, tinted
band.

### `src/components/site/feature-clusters.tsx` — new, replaces v2's flat grid

All 16 v1 features in their 4 original clusters, plus a one-line lead per
cluster explaining what the group is *for* (capture → planning → oversight →
output).

Rendered as four `<dl>`s with `border-t-2 border-foreground` heads and
hairline row dividers — a document table-of-contents, not cards. Grid is
`[minmax(0,10rem)_1fr]` so feature names align in a column against their
descriptions.

Owns the `#features` anchor, which v2's old flat grid previously held.

### `src/components/site/industry-tabs.tsx` — new

Five industries on v2's existing Radix `Tabs` primitive (already styled with
a primary underline on the active trigger, so no new styling needed).

Two things v1 didn't have:

- **Hash deep-linking.** Each `TabsTrigger` gets `id={industry.id}`, so
  `/#logistics` scrolls to it natively; a `hashchange` listener plus a mount
  read syncs the active tab. Makes the footer's Industries column real
  navigation.
- **A spec sheet per industry** — primary capture method, typical site,
  common exception — in the space where v1 reserved a grey box for a
  screenshot that was never produced.

### `src/components/site/faq.tsx` — new

Seven Q&As on native `<details>`/`<summary>` — no accordion dependency, works
without JS, keyboard-accessible for free. The `+` marker rotates 45° to `×`
on open, with `motion-reduce:transition-none`.

Two answers were expanded slightly beyond v1's: the offline question now
says the timestamp kept is when the person *actually* clocked in rather than
when the phone reconnected (which is what `attendance_events.occurred_at`
vs `received_at` actually does), and the isolation answer names row-level
security.

### `src/components/site/site-footer.tsx` — new

Three columns — Product, Industries, Company — on an ink field with a
`border-t-2 border-primary` rule.

Every href resolves. v1's Resources column (Help Center, blog, API docs) and
its non-functional newsletter form were dropped rather than shipped dead.
See [02](02-merge-decisions.md) for that reasoning.

### `src/app/page.tsx` — modified

New section order:

```
SiteHeader → Hero + StatTiles → TrustBar → FeatureClusters →
How it works → IndustryTabs → Access table → FAQ → CTA band →
Contact → SiteFooter
```

Also: the hero's primary CTA changed from "Request a pilot" to **"Start
free"** → `/login?mode=sign-up`, with the pilot request demoted to
secondary. v2 has working self-serve onboarding, so sending everyone to a
contact form was underselling it. The CTA band carries both, and its
outline button gets explicit `border-pac-paper/30` overrides since the
default outline variant is invisible on ink.

### `src/components/site/site-header.tsx` — modified

Nav gained Industries and FAQ (5 items, up from 4). Dropped "Access" from
the nav to keep it from crowding — the section still exists and the footer
links to it. Breakpoint moved `md:flex` → `lg:flex` and gap `8` → `6` so
five items don't collide on tablets.

---

## Charts

### `src/components/charts/chart-tooltip.tsx` — new

Recharts' default tooltip is a white box with a grey border — unreadable on
the ink palette in dark mode. This one uses `bg-popover`, a mono label, and
a small square swatch per series.

Also exports `AXIS_TICK`, the shared axis tick style (mono, 11px, muted),
so both charts stay consistent.

### `src/components/charts/attendance-trend-chart.tsx` — new

Three-series line chart: present (solid primary), late (`--pac-orange-light`),
absent (dashed, muted). CSS custom properties are passed straight to SVG
`stroke`, so the chart re-themes with light/dark automatically — no JS theme
detection.

Renders an explicit empty state when every point is zero, rather than an
axis frame around nothing. This is what v1's charts always showed, since
they were fed placeholder zeros.

### `src/components/charts/site-attendance-chart.tsx` — new

Bar chart, per-site attendance rate, y-axis pinned `[0, 100]` because a
percentage axis that auto-scales to the data misleads.

---

## Attendance maths

### `src/lib/attendance-series.ts` — new

- `localDateKey(date)` — `YYYY-MM-DD` at **local** midnight. Using
  `toISOString().slice(0,10)` would bucket by UTC and shift day boundaries
  for a Nairobi admin. The pre-existing `/admin` code used the ISO form;
  it now uses this.
- `recentDays(count, now)` — the last N local midnights, oldest first.
- `buildDailySeries({...})` — rolls raw check-in events into per-day
  present/late/absent.

Details that matter:

- Only the **earliest** check-in per employee per day counts, so a
  check-out-then-back-in doesn't double-count.
- Events for employees not on the current roster are ignored.
- `absent = workforce − checkedIn − onLeave`, floored at zero.
- **Today is exempt from absent-counting before 9 AM** (the `settled`
  check), matching the rule `/admin` already applied to its KPI tiles.

Documented caveat, in the file: the roster is applied as it stands *now*
across the whole window, so a recent hire reads as absent on days before
they joined. Fixing it needs employment start/end dates on `employees`.

### `src/lib/timesheet.ts` — new

- `buildTimesheet({...})` — pairs `check_in`/`check_out` events per employee
  per day into worked hours, and counts present/late/leave/absent days.

  **Unmatched events are skipped, not guessed.** A check-in with no
  check-out gives a present day and zero hours. That undercounts rather than
  inventing a shift length — the safer direction for anything feeding
  payroll.

- `timesheetToCsv(rows, periodLabel)` — RFC-4180-ish escaping: fields
  containing `"`, `,` or newline get quoted, embedded quotes doubled. CRLF
  line endings for Excel.

---

## Reports

### `src/app/admin/reports/page.tsx` — replaced (stub → 250 lines)

Server component. Period comes from `?days=7|14|30` via `searchParams`
(awaited — Next 15), validated against an allowlist and defaulted to 14, so
a hand-typed `?days=9999` can't widen the query.

Renders: period tabs (plain `Link`s, no client state), four stat tiles
(hours, attendance rate, late arrivals, absences), the trend chart, the
per-site bar chart, and a per-employee timesheet table.

The table, the CSV and the site chart all derive from **one** `rows` array,
so the exported file can't disagree with what's on screen.

### `src/app/admin/reports/export-button.tsx` — new

Client component. Builds a Blob and triggers a download — no endpoint, no
round trip. Prepends a UTF-8 BOM so Excel doesn't mangle accented names.
Disabled when there are no rows; flips to "Downloaded" for 2.5s.

---

## Super-admin

### `src/app/admin/organizations/page.tsx` — new

Every organization on the platform: name, slug, plan tier, billing status,
staff count, site count, join date. Four platform-wide stat tiles above.

Gated twice — `redirect("/admin")` for anyone who isn't `super_admin`, and
RLS underneath, which would return only their own org anyway. Failing closed
in the UI keeps the page honest about who it's for.

Counts are done in memory from three queries rather than 2N count queries,
since the platform has a handful of orgs.

Carries a `Callout` stating plainly that it's read-only and the rest of the
dashboard still scopes to the operator's own org.

### `src/components/admin/sidebar.tsx` — modified

A "Platform" group appears below the main nav for `super_admin` only, read
from `useAdminIdentity()` (the context the admin layout already provides).

---

## Password reset

### `src/app/login/page.tsx` — modified

Mode union widened from `"sign-in" | "sign-up"` to include `"forgot"`. Title,
description and submit label now come from a `COPY` record keyed by mode
rather than nested ternaries.

"Forgot password?" sits inline with the password label in sign-in mode. The
password field is hidden entirely in forgot mode. `autoComplete` is now set
correctly per mode (`current-password` vs `new-password`) — it was missing.

### `src/app/reset-password/page.tsx` — new

Where the emailed link lands. `createBrowserClient` detects the recovery
code in the URL and exchanges it for a session on mount; because that's
async, the page subscribes to `onAuthStateChange` *and* reads
`getSession()` rather than reading once and guessing.

Three states: checking, expired-link (with a route back), and the form.
Confirms the password against a second field, then `updateUser`, then
`signOut` and back to `/login` — so a stale recovery session isn't left
sitting in the browser.

Not in `PROTECTED_PATHS`, so middleware lets the unauthenticated arrival
through.

---

## Notifications

### `supabase/migrations/0006_notifications.sql` — new

See [04](04-database-and-rls.md).

### `src/app/admin/notifications-actions.ts` — new

`postNotice` and `dismissNotice`. Validates the level against an allowlist,
trims and length-caps the message at 500 chars, and **forces
`site_id = employee.siteId` for managers** regardless of what the client
sent — RLS enforces this too, but the action returns a readable error
instead of an opaque policy failure.

### `src/app/admin/notice-dialog.tsx` — new

Follows the existing `site-dialog` / `shift-dialog` pattern exactly. The
site selector is hidden for managers, since they can't target anything but
their own site.

### `src/app/admin/dismiss-notice-button.tsx` — new

Icon button, mirrors `delete-site-button`. No confirm dialog — dismissing a
notice is low-stakes and reversible by reposting.

### `src/app/admin/page.tsx` — modified

Four changes:

1. The events query widened from today to 14 days and now feeds both the
   KPI tiles and the trend chart; today's rows are filtered from the same
   result in memory.
2. The leave query widened to overlap the window and now selects
   `start_date, end_date` (it previously took only `employee_id`).
3. A full-width **Attendance trend** card sits under the stat tiles.
4. The right column became a stack: the existing Sites card, plus a new
   **Notices** card with post/dismiss and an empty state that names the
   action to take.

Day bucketing switched from `toISOString().slice(0,10)` to `localDateKey`.

---

## Seed data

### `supabase/seed.sql` — modified

Two demo notices, one org-wide warning and one site-scoped info, so the
Notices panel isn't empty on a fresh demo. The header comment now says to
run it after **all** migrations, not just 0001 — it touches `notifications`,
which arrives in 0006.

---

## Verification

```
next build   ✓  compiled in 13.6s, 18 routes generated, exit 0
next lint    ✓  no ESLint warnings or errors, exit 0
tsc --noEmit ✓  exit 0 (run after each workstream)
```

Route sizes for the new pages: `/admin/reports` 9.59 kB (238 kB first load,
recharts), `/admin/organizations` 124 B (102 kB), `/reset-password` 3.32 kB
(187 kB), `/` 5.39 kB (157 kB).

**Not verified:** nothing was run against a live Supabase instance. Every
query path, both new migrations, and the reset-password email round trip are
type-correct and build-clean but untested end to end. See
[06](06-next-steps.md), and [10](10-live-db-bringup.md) for the plan to
close it.

> **Corrected 10 Aug 2026.** This section originally read "There's no
> `.env.local` in the repo, so …". There is one, dated 6 Aug 01:58 — i.e. it
> existed while this was being written — carrying
> `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The
> conclusion still stands (nothing was run), but the stated reason was
> wrong, and the project it points at may already hold schema. Check before
> running migrations. `SUPABASE_SERVICE_ROLE_KEY` is still absent, which is
> what actually blocks the staff-invite path and `scripts/seed-demo-data.mjs`.
