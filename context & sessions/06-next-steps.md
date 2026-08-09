# 06 — Open items & next steps

Ordered roughly by "would bite you soonest".

## Not verified

Everything below builds, type-checks and lints clean. **None of it has run
against a live Supabase instance** — no query path has been executed end to
end.

[10](10-live-db-bringup.md) is the ordered plan for closing this, with the
fixtures and expected values for each check. The list below is the summary.

> **Corrected 10 Aug 2026.** This originally gave the reason as "there's no
> `.env.local` in the repo". There is one, with the Supabase URL and anon
> key, dated during the 6 Aug session. So the project it points at may
> already have schema in it — verify before running migrations
> ([10](10-live-db-bringup.md) §0.1). What *is* missing is
> `SUPABASE_SERVICE_ROLE_KEY`, without which the staff invite and the demo
> seeder can't work.

Before trusting any of it:

1. **Run migrations 0005 and 0006** on a scratch project. They follow the
   same idiom as 0003/0004 but have never been executed.
2. **Re-run `seed.sql`** — it now inserts notices and must run *after* 0006,
   not after 0001 as its old header said.
3. **Check `/admin` and `/admin/reports` against seeded data.** The
   day-bucketing, the check-in/check-out pairing, and the absent arithmetic
   are the parts most likely to be subtly wrong, and the parts a screenshot
   won't reveal.
4. **Test the password reset round trip.** It needs email sending configured
   on the Supabase project. The recovery-code exchange in
   `/reset-password` is the least-exercised path in the whole merge.
5. **Test `/admin/organizations` as an actual `super_admin`.** It's the only
   consumer of migration 0005.

## Caveats baked into what's on screen

Worth knowing before anyone quotes a number from these pages.

**Reports applies today's roster to the whole period.** `buildDailySeries`
and `buildTimesheet` both take the current employee list and apply it across
every day in the window. Someone hired last week shows as absent on days
before they joined; someone who left shows nothing at all. Fixing it needs
employment start/end dates on `employees` — a schema change.

**The "late" rule is still a fixed 7:15 AM, org-wide.** `src/lib/attendance.ts`
was already like this; the new chart and timesheet inherit it. The `shifts`
table exists and is populated, so the real fix is comparing against each
employee's `shifts.start_at`. This affects the trend chart, the reports
table and the CSV — everything that classifies present vs late.

**Unmatched check-ins contribute zero hours.** A check-in with no check-out
counts as a present day but adds nothing to hours worked. Deliberate —
undercounting beats inventing a shift length for something feeding payroll —
but it means hours will read low wherever staff forget to clock out. Worth
surfacing as its own exception type rather than leaving it silent.

**Nothing writes `notifications` automatically.** The intended writers — an
exception detector and the biometric webhook bridge — don't exist. For now
notices are posted by hand from `/admin`.

**`/admin/organizations` is read-only.** RLS lets `super_admin` see every
org, and the page lists them, but there's no switcher: every other admin
page still scopes to the operator's own org.

## Carried over from the original v2 roadmap

- **Settings is still a stub.** Needs site geofence *editing* (currently
  add/delete only) and org profile/billing.
- **Payroll API push.** Reports covers the CSV half of Section 03; a direct
  push to a payroll provider is unbuilt.
- **Realtime.** `/admin` re-queries on page load. Supabase Realtime would
  make "Present today" genuinely live.
- **The biometric webhook bridge.** `/admin/devices` manages device
  *records* and generates webhook secrets, but there's no inbound endpoint
  receiving pushes from a terminal.
- **Mobile app.** React Native (Expo), separate codebase, reusing the
  geofence and offline-queue approach from `/dashboard`.
- **The resourcing conflict** flagged in the proposal (Sections 01/08)
  should be resolved before committing to timing on any of the above.

## Housekeeping

**Generate database types.** `src/lib/supabase/server.ts` calls
`createServerClient` with no generic, so every query returns `any`-ish rows
and column typos surface at runtime. v1 had hand-written types; the right
fix here is:

```bash
supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
```

then `createServerClient<Database>(…)`. This would have caught schema drift
in the new report queries at compile time.

**A stray lockfile is confusing the build.** Both build and lint warn:

```
We detected multiple lockfiles and selected the directory of
C:\Users\PAC\package-lock.json as the root directory.
```

There's a `package-lock.json` in the Windows user home. Either delete it or
set `outputFileTracingRoot` in `next.config.ts`. Harmless now; it will
mis-trace files if this is ever deployed standalone.

**`next lint` is deprecated** and goes away in Next 16. Migration path:

```bash
npx @next/codemod@canary next-lint-to-eslint-cli .
```

**`attend-v1` still sits on the desktop.** Nothing depends on it. Keep it as
a reference copy until the merge has been validated against live data, then
archive it. Its two zero-byte junk files (`cd`, `npm`) can go whenever.

**This repo now has git history; v1 never did.** Baseline commit is
`Baseline: attend-v2 before v1 merge` — everything from the merge sits on
top of it, so any single piece can be reverted independently.

## If picking this up cold

Read [01](01-codebase-comparison.md) for what the two codebases were,
[02](02-merge-decisions.md) for why the merge ran the direction it did, and
[04](04-database-and-rls.md) before touching anything in `supabase/`. The
single most important fact is in 04: **v1's flat `clock_in`/`clock_out`
model cannot represent an offline-queued punch**, which is why v2's
event-sourced `attendance_events` won and why none of v1's data layer
survived.
