# 15 — Staff routes, and notices that finally reach staff

Session of **11 August 2026**, continuing on `harden-security-audit` after
[14](14-tenant-detail-and-first-authed-pass.md). Two changes built together
because they touch the same files: the staff dashboard became four real routes,
and notices became a feature staff can see and admins can target.

Design: `docs/superpowers/specs/2026-08-11-staff-routes-and-notices-design.md`
Plan: `docs/superpowers/plans/2026-08-11-staff-routes-and-notices.md`

Two more specs were written this session and deliberately **not** built:
`2026-08-11-leave-entitlements-design.md` and
`2026-08-11-hr-onboarding-suite-design.md`.

---

## Notices had never worked

Worth stating plainly, because it went unnoticed for five days across three
sessions. `notifications` shipped in migration 0006 with a posting UI on
`/admin`. Three things were wrong:

- **Staff could not see notices at all.** Nothing under `src/app/dashboard` or
  `src/app/checkin` read the table, and `/admin` redirects staff away. So admins
  had been posting announcements that only other admins could read. The feature
  never once performed its function.
- **"Dismiss" ran a `DELETE`.** One manager clearing their own view removed the
  notice from the entire organization, while the button said "Dismiss". There
  was no per-person state to record, so there was nothing else it could have
  done.
- **No author, and no way to address a role.** A notice could go org-wide or to
  one site, and nobody could tell who wrote it.

## What shipped

**Four staff routes** — `/dashboard` (overview and clock in),
`/dashboard/shifts`, `/dashboard/attendance`, `/dashboard/leave` — under a
layout that owns the sidebar, the greeting, the notices rail and all three guard
branches. The sidebar navigates by URL; the `IntersectionObserver` scroll-spy is
gone.

This **reverses a decision made the day before**, when the sections were anchors
in one page on the argument that one page means one set of queries and one set
of failure states. That argument was right and the reversal is still correct: the
staff surface is growing, and four honest failure states beat one page that grows
without bound. The cost was paid explicitly — each page owns one query and its
own error branch, and the final review checked all four.

**Notices, properly.** Migration 0013 adds `author_id` (`on delete set null`, so
removing an employee doesn't delete their announcements), `target_role`, and a
`notification_dismissals` table. Targeting is org / site / role, combinable.
Dismiss and delete became **different actions with different labels**: dismiss
hides a notice for one person, delete retracts it for everyone and is restricted
to managers and admins. The rail sits on every staff route, and below `lg` it
moves *below* the content rather than disappearing — a notice nobody sees on a
phone is the bug the feature exists to fix.

Individual addressing, expiry dates and pinning were all deliberately excluded.
Naming people turns a notice board into a messaging channel that invites replies
and read receipts the table isn't built for.

---

## The one that matters: the rail would have over-shared

The final review found a Critical that **reversed a conclusion stated twice in
this session**, and it is the most instructive thing in this document.

The claim made was that without 0013 the rail would be "degraded" and "could
never show a notice". Backwards, and in the unsafe direction.

The rail selected only pre-0013 columns — `id, message, level, created_at` — so
its query **succeeded** against a database without the migration. And 0006's read
policy is `super_admin OR org_id = mine`: org-wide, with **no site or role
narrowing**. Site scoping had existed since 0006 and the post dialog had always
offered it. So deploying the branch before applying the migration would have
shown every staff member every notice in the organization, **including notices
pinned to other sites** — silently, with no error and nothing to notice. Staff
had never seen notices before, so it would have been the first time that data
reached them, and it would have reached the wrong people.

The fix keeps the design intact rather than papering over it: **the rail selects
`target_role` purely as a schema guard**, though it never reads the value. On a
database without 0013 that select fails, and the rail renders its honest
"Couldn't load notices — don't assume there are none" branch. It fails closed
instead of over-sharing, and audience filtering stays entirely in RLS where it
belongs. One column name, and the ordering constraint stops being something a
human has to remember.

**Why the earlier reasoning went wrong:** it assumed a missing table would fail
the whole read. It did fail the *dismissals* read — but the notices read was
against a 0006-era table and was fine. Two queries, two schemas, two different
answers. And the live check that seemed to confirm "degraded" only looked clean
because the demo organization has no notices in it. An empty result set is not
evidence about what a populated one would do.

---

## Deployment order — not optional

Apply **0013 first**, then deploy. Without it:

- the rail over-shares (fixed above, but only because it now fails closed);
- `/admin`'s notices card errors, because it selects `author_id` and
  `target_role`;
- **`postNotice` fails outright.** Admins can post notices on the currently
  deployed build; on this branch without the migration they cannot post at all.
  That is a working write path breaking, not a card degrading.

In the other direction — migration applied, code not deployed — nothing breaks.
0013 only adds two nullable columns and a table, and narrows a SELECT policy in
ways the deployed queries tolerate: existing rows have `target_role IS NULL`, so
nothing disappears for anyone, and `org_admin` keeps full visibility through
0006's `FOR ALL` manage policy.

This codebase has now produced the ordering trap in **both** directions: doc 04
records 0007 applied without the code that needed it, leaving the geofence
bypassable; here the code would have shipped without its migration.

0013 is wrapped in `begin`/`commit`. The Supabase CLI wraps migrations in a
transaction but the dashboard SQL editor does not, and an interrupted hand-run
between the `drop policy` and the `create policy` that replaces it would leave
notices admin-only until someone re-ran the file.

---

## Three things fixed in 0013 before it ever ran

Because the migration was still unapplied, these cost nothing now and a whole
extra migration later.

- **The dismiss action upserts, but there was no UPDATE policy.**
  `.upsert(..., { onConflict })` compiles to `INSERT … ON CONFLICT DO UPDATE`,
  and Postgres checks the table's UPDATE policies for that branch.
  `notification_dismissals` had select, insert and delete only — so a *second*
  dismissal of the same notice would have raised `42501` straight into a
  `window.alert`. Reachable from a second tab, a back-navigation, or the branch
  that deliberately re-renders already-dismissed notices. The whole point of
  reaching for `upsert` was idempotency, and RLS defeated it.
- **No index the dismissals query could use.** The primary key is
  `(notification_id, employee_id)`; the rail and the self-read policy both filter
  on `employee_id`, which is not the leading column — a sequential scan on every
  render of every staff page.
- **The read-policy comment understated manager visibility.** 0006's
  `notifications: admins manage` is `FOR ALL`, which includes SELECT, and policies
  are OR'd — so a manager reads any notice pinned to their own site *regardless
  of `target_role`*, including one addressed to `org_admin`. That is intended,
  since they can delete those notices too, but the file that documents the
  security model has to say it.

---

## Copy that lied, twice

Two separate places told the operator something untrue, and both were in code
this session wrote:

- The post-notice dialog still said notices "show on the admin overview for
  everyone in your organization" — which this entire feature makes false.
- The dialog's **audience preview lied to managers.** The site selector is hidden
  for them, so `siteId` stayed `"all"` and the preview read "All staff" while the
  server pinned the notice to their own site. Fixed by adding `siteId`/`siteName`
  to `AdminIdentity` — data the admin layout already had — so the preview names
  the real site.

That is the same class as doc 14's stale `Callout`. Three instances now across
two sessions, all of them copy describing behaviour that had moved.

---

## Process, honestly

Six tasks, each implemented by a fresh agent and independently reviewed. **Every
task surfaced a defect in the planning rather than the implementation** — the
same ratio as the tenant-detail plan in doc 14. Cumulatively:

- Task 3's verification expected `smoke:authed` 41/41, which cannot hold once
  `/dashboard` is reduced to the clock-in widget. The implementer predicted the
  exact number (38/41) before running anything, and a reviewer independently
  re-derived it.
- Task 2's brief said to resolve notice authors from `/admin`'s existing employee
  list — which is filtered to staff and managers, so an **org_admin's own
  notices**, the common case, rendered "no longer on the roster". The obvious fix
  (widen that list) would have been far worse: `workforce` is the denominator in
  `absent = workforce − checkedIn − onLeave`, so it would have silently changed
  every KPI on the page.
- Task 6's brief contained **two assertions that could not fail**: `/leave/i`
  matched against a page whose sidebar prints "Leave" on every route, and a rail
  position check using `>=` when the regression it existed to catch produces
  *equal* tops. Assertions that cannot fail are worse than missing ones — they
  report verification that never happened.
- A route count of 20 was misreported as 21 by dropping a `sed` range and
  counting the "First Load JS" tree's box-drawing characters. Checked rather than
  reported.

Two agents died mid-task — one on a network error after passing its checks but
before committing, one stalled by a watchdog. Both were recovered by verifying
the on-disk state and resuming or re-dispatching, rather than trusting a dead
run.

---

## Verification

```
node --test         ✓ 15/15 (9 tenant-summary, 6 notice-audience)
npx tsc --noEmit    ✓ exit 0
npm run lint        ✓ exit 0
npm run build       ✓ 20 route rows + ƒ Middleware
npm run smoke       ✓ 107/107 (public)
npm run smoke:authed  96/99 — see below
```

The three failures are all `"a targeted notice reaches the staff rail"`, one per
matrix entry. That assertion **cannot pass until 0013 is applied and a notice
seeded**, and it was deliberately left failing rather than softened into
something that always passes. The seed attempt failed with
`PGRST204 — could not find the 'target_role' column`, which is direct evidence
the migration is outstanding.

`npm run smoke:authed` now covers all four staff routes: each renders its own
content, the sidebar's current item follows the URL, there is no horizontal
overflow at any width, and the rail is present on every route and sits below the
content under `lg`. 99 checks, verified against a real run rather than traced.

### Not verified

- **The rail's happy path has never been seen.** Nobody has watched it render an
  actual notice, because 0013 is unapplied. The error path is proven; the success
  path is read-only-reviewed.
- **The post-notice dialog's role selector and the manager site restriction** need
  an admin session. The demo account is staff.
- `/super` and `/admin/settings` remain unrendered, unchanged from doc 14.

---

## Where to pick up

1. **Apply migration 0013**, then seed a notice for the demo org, then deploy,
   then re-run `smoke:authed` and expect 99/99. Confirm
   `staff.demo@pac.africa` is role `staff` first — a notice targeted at `staff`
   is invisible to a manager, and that would look exactly like the migration
   having failed.
2. **Leave entitlements** — spec written, not built. It turns on one decision:
   there is no allowance anywhere in the schema, so a balance has no denominator.
3. **The HR onboarding suite** — spec written, decomposed into six pieces. Its
   load-bearing decision is that `employee_profiles` must **exclude**
   `super_admin`, the opposite of every other policy here.
4. **The help chatbot** — asked for, not yet designed. Independent of everything
   above.
5. **There is no `error.tsx` anywhere under `src/app`.** A throw from
   `getEmployeeContext` lands on Next's default error page. Pre-existing, but this
   session widened its blast radius by moving that call into a layout wrapping
   four routes.
6. Deferred minors, all recorded and triaged in the final review: the vestigial
   `id` attributes on the three new pages, the rail's `limit(20)` applied before
   the dismissal filter, and two duplicated day-label formatters that want a
   `formatDayLabel` in `@/lib/timezone`.
