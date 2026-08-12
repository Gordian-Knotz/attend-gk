# Leave extensions: holidays, accrual, approvals, calendar, absence

**Date:** 12 August 2026
**Status:** awaiting approval — three decisions already taken by the product
owner, recorded below.

The five items the leave-entitlements spec deferred, now requested together.
That spec said of them: *"Each is a feature; none is needed for a balance to be
correct and visible."* That was true then. The balance is now correct and
visible, so these are next.

They are **not** equal in risk, and it matters which is which:

| Feature | Touches the number? | Risk |
|---|---|---|
| Public holidays | **Yes — retroactively** | Highest |
| Accrual | **Yes — for opted-in orgs** | High |
| Approval workflow | No — changes who may approve | Medium |
| Leave calendar | No — a view | Low |
| Team absence | No — a view | Low |

## Decisions already taken

**Public holidays are excluded from the day count.** This **reverses the approved
decision** in `2026-08-11-leave-entitlements-design.md`, which was calendar days
inclusive of weekends *and* holidays, on the reasoning that guards and logistics
staff work them. The product owner was shown that reasoning and chose exclusion.

**Weekends still count.** Only holidays were reversed. The original weekend
argument stands untouched.

**Accrual is an optional per-policy mode**, not a replacement. Default stays the
current full-year grant, so no existing org's numbers move.

**Staff self-access confirmed** (this belongs to the HR spec, recorded there).

---

## The consequence nobody can opt out of

**Balances are computed live from `leave_requests`, never stored.** There is no
`days_taken` column to freeze. So the moment a holiday row exists, **every
historical balance recomputes**: a request for 12–16 August previously charged as
5 days becomes 4 if one of those days is a holiday.

There is no grandfather option to offer. It is a property of the architecture,
which was chosen deliberately (one implementation of the number, shared by the
staff page and the admin report) and is not worth reversing for this.

What follows from it:

- **Seeding holidays is the moment balances shift**, not the deploy. That is the
  event to communicate to tenants, and it should be done deliberately rather than
  discovered.
- Balances only ever move **in the employee's favour** — days come back, never
  get taken away. That is the safe direction, and worth saying explicitly because
  the reverse would be indefensible.
- **An approved request in the past can retroactively cost less.** Nobody is
  charged more.

## The question exclusion forces: who works the holiday?

The original spec's whole argument for counting holidays was that the tenant base
works them. A guard rostered on Boxing Day is working; excluding it from *their*
leave charge is correct if they took leave that day and wrong if they worked.

**Decision, made here and reversible:** exclusion is unconditional. A leave
request spanning a public holiday is not charged for that day, regardless of
whether the person would otherwise have been rostered.

The reasoning: leave and attendance are separate records. If someone actually
worked, that is an `attendance_event` and they were not on leave — the request
would not cover that day. Making the charge depend on the roster would reintroduce
exactly the defect the original spec rejected roster-matched counting for:
`shifts` is only populated ~14 days ahead, so the same request would count
differently depending on when you looked. **A balance that moves on its own is
worse than a simple rule stated plainly** — that sentence is from the original
spec and it still governs.

---

## Feature 1 — Public holidays

```sql
create table public_holidays (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid references organizations(id) on delete cascade,  -- null = national
  holiday  date not null,
  name     text not null,
  unique nulls not distinct (org_id, holiday)
);
```

`org_id IS NULL` means a national holiday visible to every tenant. A row with an
`org_id` is that tenant's own addition — a company day, or one of the ad-hoc days
a Kenyan president may gazette at short notice. Read: everyone in the org, plus
all national rows. Write: `org_admin` for their own org; national rows are
seeded by migration and writable only by `super_admin`.

`unique nulls not distinct` matters: without it Postgres treats every
`(null, date)` pair as distinct and the same national holiday can be inserted
repeatedly.

**Seed the 2026 Kenyan public holidays** in the migration, as national rows.
They are not derivable from a formula — the original spec says so — and the
Islamic dates in particular are declared by sighting, so treat the seed as a
best-known list an admin can correct rather than as authoritative.

`countLeaveDays` gains a holidays parameter. **It must stay pure** — the
holidays are passed in, never fetched inside the module. That is what keeps it
testable under `node --test` with no database, which is the property the whole
module exists for.

## Feature 2 — Accrual as a policy mode

```sql
alter table leave_policies
  add column accrual_mode text not null default 'annual'
    check (accrual_mode in ('annual', 'monthly'));
```

`annual` is today's behaviour: the full entitlement exists from 1 January.
`monthly` earns `annual_days / 12` per completed month.

**Earned-to-date is computed, not stored.** Storing it would need a scheduled job
and would drift the moment one run was missed. The entitlement row keeps holding
the full-year figure; the balance module decides how much of it is available
today. That also means switching an org between modes changes nothing
historically and needs no backfill.

Two edges to get right, both of which will otherwise be wrong:

- **A mid-year joiner** accrues from their start month, not January. This needs
  the employment start date — **which is HR suite piece 1 and does not exist
  yet**. Until it does, accrual starts in January for everyone. State this in the
  UI rather than let an admin infer a precision that is not there.
- **The current month is not yet earned.** Earning on the 1st for a month not
  worked lets someone take leave and leave the company owing it.

## Feature 3 — Approval workflow

Today `leave_requests.status` is `pending` / `approved` / `rejected`, and 0008
stops an employee approving their own. What is missing is **who else may**, and
**any record of who did**.

```sql
alter table leave_requests
  add column decided_by  uuid references employees(id) on delete set null,
  add column decided_at  timestamptz,
  add column decision_note text;
```

`on delete set null`, matching 0013's `author_id`: removing an employee must not
delete the leave history of the people whose requests they approved.

Rules: a `manager` decides for their own site; an `org_admin` for the org; nobody
decides their own request, including an admin — 0008 already enforces that shape
for insert and the same must hold for the decision. **A per-column trigger is
required**, because RLS grants access to rows and not columns, and this is the
fifth instance of that pattern in this schema (0008, 0010, 0011, 0014).

Deliberately **not** included: multi-step chains, delegation, escalation on
timeout. Each is a workflow engine and none is needed for an approval to be
attributable.

## Feature 4 — Leave calendar

A month grid on `/dashboard/leave` (own leave) and `/admin/reports` or its own
admin page (the team's), showing approved leave, pending leave in a distinct
style, and public holidays.

**Read-only.** No drag-to-request, no editing from the grid.

Scoping follows the existing four-tier read model with no new policy: staff see
their own, managers their site, admins the org. It renders from the same
`leave_requests` the balance already reads, so a calendar and a balance can never
disagree.

## Feature 5 — Team absence view

"Who is off today, and this week." Site-scoped for managers, org-wide for admins,
grouped by site. Its value is operational: a supervisor building tomorrow's roster
needs to know who is unavailable.

Staff **do not** get this. Which colleagues are absent, and by implication why, is
not something the roster already tells them, and this feature should not be the
thing that starts leaking it.

---

## Build order, and why

1. **Public holidays** — everything else displays or depends on them, and it is
   the only item that changes existing numbers. Ship it first and alone, so the
   balance shift is attributable to one deploy rather than tangled with four
   other features.
2. **Approval workflow** — schema plus a trigger; independent of the rest.
3. **Leave calendar** — needs holidays to render them.
4. **Team absence** — reuses the calendar's queries.
5. **Accrual** — last, because it is the only one that changes the balance
   formula, and because it is knowingly imprecise until HR piece 1 lands.

## Testing

Every day-counting change goes in `src/lib/leave-balance.test.mts` against the
pure module. This plan has already produced six assertions that could not fail,
so for each new test: **name the broken implementation it would catch.** A
holiday test that passes when holidays are ignored is worse than no test.

Specifically required:

- A request spanning a holiday charges one day fewer; the same request with the
  holiday removed charges the original count. (Catches holidays being ignored.)
- A holiday on a **weekend** does not double-discount. (Catches subtracting a day
  already excluded — though note weekends are *not* excluded here, so this test
  exists to prove the two rules stay independent.)
- A holiday **outside** the request range changes nothing. (Catches a filter that
  subtracts every holiday in the year.)
- Monthly accrual in month 1 yields one twelfth, not the annual figure, and
  `annual` mode is unaffected by the same input. (Catches the mode branch being
  ignored in either direction.)

## Migrations

`0015_public_holidays.sql`, `0016_leave_decisions.sql`, `0017_leave_accrual.sql`.

**0013 and 0014 are still unapplied.** These stack on top of them, so the
outstanding count becomes five. That is the real risk in this batch: the ordering
trap in this codebase has now fired in both directions (doc 04, doc 15), and five
pending migrations is the most it has ever carried at once.
