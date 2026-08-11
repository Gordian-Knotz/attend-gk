# Leave entitlements, balances and utilization

**Date:** 11 August 2026
**Status:** **approved for build, 11 Aug.** Both open decisions resolved — see
"Decisions taken" below. The rest of this document stands as written.

## Decisions taken

**Entitlement lives in two tables: an org policy plus a per-employee, per-year
entitlement.** Option A below. A balance has to survive the policy changing —
move from 21 days to 25 next year and every 2026 balance must stay what it was —
and only a per-year record does that.

**Days are counted as calendar days, inclusive.** 12–16 August is five days,
weekends and public holidays included. The reasoning is the tenant base: security
firms, logistics and retail, where weekend work is normal, so a weekend inside a
leave period genuinely is leave. The cost is accepted and stated: an office
worker taking Friday to Monday is charged four days, not two. **The rule is
printed next to the balance**, because a number someone plans a holiday around
must not be ambiguous.

Rejected: working days Mon–Fri (wrong for a guard rostered on Saturdays, who
would take leave on their actual working day and not be charged), and
roster-matched days (the most correct in principle, but `shifts` is only
populated ~14 days ahead, so the same request would count differently depending
on when you looked — a balance that moves on its own is worse than a simple rule
stated plainly).

### Calls made without asking, stated so they can be reversed

- **Only `approved` requests reduce the balance.** `pending` is shown separately
  as "awaiting approval" so nobody books the same days twice, and so a manager
  sitting on a request does not silently consume someone's allowance.
- **Sick leave is tracked, not budgeted.** A policy row for `sick` is possible
  but not seeded, so by default sick days show a running count with no allowance
  to spend down. A hard sick allowance encourages people to work ill. Reversible
  by inserting a policy row.
- **The balance is computed in one pure, tested TypeScript module**, not a
  database view or `SECURITY DEFINER` function. That matches
  `src/lib/tenant-summary.ts` and `src/lib/notice-audience.ts`, keeps it testable
  under `node --test` with no database, and still gives exactly one
  implementation for both the staff page and the admin report to share.
- **Utilization lives on `/admin/reports`**, where org-level numbers already
  live, rather than a new page.
- **The leave policy is edited on `/admin/settings`**, which already owns
  org-level configuration.
- **Per-person entitlement overrides are deferred.** The schema supports them —
  `days_granted` is per employee — but v1 materialises everyone from the policy
  and offers no per-person editing UI. Adding it later needs no migration.

Staff should see how much leave they have left. Admins should see how much of the
organization's leave has been used. Neither is possible today, and the reason is
not UI.

---

## Problem

`leave_requests` records requests: employee, type (`annual` / `sick` /
`compassionate` / `unpaid`), start and end date, status. That is all.

**There is no allowance anywhere in the schema.** No column, no table, no
default. So "18 of 21 days remaining" has nothing to compute against, and
"utilization" has no denominator. Every part of this feature is blocked on one
decision: where does an entitlement live, and who sets it.

A second, quieter problem: **nothing computes days.** A request from 12 to 16
August is one row. Whether that is five days, three working days, or four
depends on rules nobody has written down.

---

## The decision this feature turns on

An entitlement can live in three places, and the choice has consequences well
beyond this feature because the **HR onboarding suite will also want to own
employment terms**. Deciding it here, badly, means two homes for the same fact.

### Option A — a policy per organization, overridable per employee (recommended)

```
leave_policies      org_id, leave_type, annual_days, accrues, carry_over_max
leave_entitlements  employee_id, leave_type, year, days_granted, days_carried
```

The policy is the org's rule ("annual: 21 days"). The entitlement is the
per-person, per-year materialisation of it, which is what a balance is actually
computed from, and what an admin adjusts when someone negotiates something
different or carries days over.

Why this and not the simpler options: a balance has to survive the policy
changing. If the org moves from 21 to 25 days in 2027, everyone's 2026 balance
must stay what it was. Only a per-year record does that. This is also the shape
the HR suite wants — employment terms belong to a person and a period, not to a
column that gets overwritten.

### Option B — a column on `employees`

`employees.annual_leave_days`. One migration, trivially simple, and wrong the
first time a policy changes or somebody asks "how many days did she have in
2025". No history, no carry-over, no per-year truth. Cheap now, expensive later,
and it puts employment terms in the table the HR suite is about to restructure.

### Option C — org policy only, no per-employee record

One rule for everyone, no overrides. Simplest defensible model, and it fails the
first real negotiation, which in a workforce business happens immediately.

**Recommendation: A.** It is one extra table for a property that is genuinely
per-person and per-year.

---

## Counting days — the part that will be got wrong

A balance is `days_granted + days_carried − days_taken`, and `days_taken` is
where the bodies are buried. Decisions needed, none of them defaults:

- **Are weekends deducted?** For guards on rotating shifts, calendar days are
  arguably right; for office staff, working days are. This app serves both.
- **Are public holidays deducted?** There is no holidays table. Kenyan public
  holidays are not derivable from a formula.
- **Do half days exist?** `attendance_status` already has `half_day`, so the
  concept is in the schema for attendance but not for leave.
- **Which statuses count?** `approved` obviously. `pending` should reduce an
  *available* balance without reducing a *taken* balance, or someone books twice.

**Recommendation:** count calendar days between the dates inclusive, deduct only
`approved`, and show pending separately as "awaiting approval". State the rule on
screen next to the number. Every richer rule (working days, holidays, half days)
needs data the app does not have, and inventing it silently is worse than a
simple rule stated plainly. The existing timesheet already takes this position on
hours — it undercounts rather than guessing — and this is the same instinct.

---

## What gets built

**Staff, on `/dashboard/leave`:** a balance per leave type — granted, carried,
taken, remaining — with pending shown separately, and the counting rule in plain
words beneath it. This is the number someone plans a holiday around; it must not
be ambiguous.

**Admin, on `/admin/reports` or its own page:** utilization — used versus granted
across the organization, by type and by site, so an admin can see both "we are
carrying a lot of untaken leave" (a liability) and "this site never takes leave"
(a different problem).

**Sick days are counted but not budgeted.** Sick leave with a hard allowance
encourages people to work ill. Track and show it; do not present it as a balance
to spend. This is a product opinion and belongs in the spec so it is not
accidentally reversed.

---

## Migration sketch

`0014_leave_entitlements.sql`, after 0013:

- `leave_policies` — org-scoped, `org_admin` writes, everyone in the org reads.
- `leave_entitlements` — per employee, per type, per year. Staff read their own;
  managers read their site's; admins read the org's. The **four-tier read model
  from 0008**, which is the established pattern and already tested.
- A `SECURITY DEFINER` balance function, or a view, so a balance is computed in
  one place rather than in both the staff page and the admin report. Two
  implementations of one number will disagree eventually.
- Seeding: an entitlement row per active employee for the current year, derived
  from the policy, or the feature launches with every balance blank.

**A per-column rule to get right in the migration, not after:** an employee must
not be able to edit their own `days_granted`. That is the same shape as the three
holes 0008, 0010 and 0011 exist to close — `attendance_events`, `organizations`,
`employees`. This will be the fourth. RLS grants access to rows, not columns, so
it needs a trigger.

---

## Dependencies

- **Migration 0013** (notices) is written and must be applied before 0014 is
  written, purely to keep numbering honest.
- ~~The HR suite spec should be agreed first~~ — **resolved 11 Aug.** The concern
  was that `leave_policies` might belong inside an HR-owned table. It does not:
  the HR spec's recommendation is an `employee_profiles` table for *personal*
  data, and a leave policy is org-level configuration, not personal data.
  Per-employee entitlements are already exactly the shape the HR spec argues for
  — a fact belonging to a person and a period. So there is no second home for
  the same fact, and this can be built without waiting.

## Explicitly not in this feature

Approval workflows beyond the existing approve/reject, accrual over time
(monthly earning), leave calendars, team-absence views, and public holidays.
Each is a feature; none is needed for a balance to be correct and visible.
