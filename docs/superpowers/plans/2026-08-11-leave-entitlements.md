# Leave Entitlements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give staff a leave balance they can plan around, and admins a view of how much of the organization's leave is being used.

**Architecture:** Migration 0014 adds an org-level `leave_policies` table and a per-employee, per-year `leave_entitlements` table. One pure, tested TypeScript module computes every balance, and both the staff page and the admin report consume it — so there is exactly one implementation of the number.

**Tech Stack:** Postgres + RLS, Next 15 App Router (server components), `node --test` for the pure logic.

## Global Constraints

- **Days are calendar days, inclusive.** 12–16 August is 5 days; weekends and public holidays are deducted. **The rule must be printed on screen next to the balance.** A number someone plans a holiday around must not be ambiguous.
- **Only `status = 'approved'` reduces a balance.** `pending` is surfaced separately as "awaiting approval" so nobody books the same days twice and a manager sitting on a request does not silently consume an allowance.
- **Sick leave is tracked, not budgeted.** No `sick` policy row is seeded, so sick shows a running count and `remaining` is null. Reversible by inserting a policy row — do not special-case `sick` in code.
- **Migration 0014 must be idempotent and re-runnable**, like 0008–0013: `create table if not exists`, `drop policy if exists` before create, `create or replace function`. Wrap the body in `begin;`/`commit;` — the dashboard SQL editor does not wrap statements in a transaction. End with `notify pgrst, 'reload schema';`.
- **Do not modify migrations 0001–0013.** 0001–0012 are applied to the live database; 0013 is written and pending.
- **Every query captures its `error`** and renders a distinct failure state. A failed read must never render as an empty state — a balance that shows 21 days remaining because a query failed is worse than no balance.
- Reads follow the **four-tier model** established in 0008: staff see their own, managers their site, `org_admin` their org, `super_admin` everything.
- `pay_rate` and `employment_type` are never selected.
- Test files are `.mts` and run via `node --test "src/**/*.test.mts"`. `node --test <directory>` does not work on this setup.
- Route rows stay at **20** — this plan adds no routes.
- **No trigger is needed to stop an employee editing their own `days_granted`.** Staff get no write policy on `leave_entitlements` at all, so role-scoped RLS already covers it. The design spec called this "the fourth per-column rule" and that was wrong: a per-column trigger is only needed where someone *may* update the row but must not touch one column, which was the case in 0008, 0010 and 0011 and is not the case here. Do not add one.

---

### Task 1: Migration 0014 — policies and entitlements

**Files:**
- Create: `supabase/migrations/0014_leave_entitlements.sql`

**Interfaces:**
- Consumes: `employees`, `organizations`, `current_employee()`, `employee_site_id()` — all existing.
- Produces: tables `leave_policies` and `leave_entitlements`, and
  `public.ensure_leave_entitlements(p_year integer)`. Tasks 2–5 depend on the exact column names below.

- [ ] **Step 1: Read the patterns you are copying**

```bash
sed -n '/leave: select own or org/,/;$/p' supabase/migrations/0008_attendance_insert_integrity.sql
cat supabase/migrations/0013_notice_targeting.sql
```

0008 holds the four-tier read policy to mirror. 0013 is the closest house-style match: header comment explaining the problem, section dividers, `begin`/`commit`, trailing `notify`.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/0014_leave_entitlements.sql`:

```sql
-- 0014 — Leave entitlements, so a balance has a denominator.
--
-- `leave_requests` (0001) records requests and nothing else. There is no
-- allowance anywhere in the schema, so "18 of 21 days remaining" has had
-- nothing to compute against and neither has any notion of utilization.
--
-- Two tables rather than one column on `employees`, because a balance has to
-- survive the policy changing: if an org moves from 21 days to 25 in 2027,
-- every 2026 balance must stay what it was. Only a per-year record does that.
-- It is also the shape the HR suite wants — employment terms belong to a person
-- and a period, not to a column that gets overwritten.

begin;

-- ── 1. The org's rule ───────────────────────────────────────────────────
--
-- One row per org per leave type. A type with no row is TRACKED BUT NOT
-- BUDGETED: days taken are counted, and there is no allowance to spend down.
-- `sick` is deliberately not seeded for that reason — a hard sick allowance
-- encourages people to work ill. Insert a row for it if an org wants one; no
-- code special-cases the type.

create table if not exists leave_policies (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  leave_type     text not null
                 check (leave_type in ('annual', 'sick', 'compassionate', 'unpaid')),
  annual_days    numeric(5, 1) not null default 0
                 check (annual_days >= 0 and annual_days <= 365),
  carry_over_max numeric(5, 1) not null default 0
                 check (carry_over_max >= 0 and carry_over_max <= 365),
  created_at     timestamptz not null default now(),
  unique (org_id, leave_type)
);

-- ── 2. The per-person, per-year materialisation ─────────────────────────
--
-- numeric(5,1) rather than integer: half-day entitlements and half-day
-- carry-over are ordinary, and widening the column later would be a migration
-- for nothing. Half-day *requests* are still out of scope — see the plan.

create table if not exists leave_entitlements (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete cascade,
  org_id       uuid not null references organizations(id) on delete cascade,
  leave_type   text not null
               check (leave_type in ('annual', 'sick', 'compassionate', 'unpaid')),
  year         integer not null check (year between 2020 and 2100),
  days_granted numeric(5, 1) not null default 0 check (days_granted >= 0),
  days_carried numeric(5, 1) not null default 0 check (days_carried >= 0),
  created_at   timestamptz not null default now(),
  unique (employee_id, leave_type, year)
);

-- The staff page reads its own rows for one year; the admin report reads a
-- whole org for one year. Both filter on year.
create index if not exists idx_leave_entitlements_employee
  on leave_entitlements (employee_id, year);
create index if not exists idx_leave_entitlements_org
  on leave_entitlements (org_id, year);

alter table leave_policies enable row level security;
alter table leave_entitlements enable row level security;

-- ── 3. Reads ────────────────────────────────────────────────────────────
--
-- The policy is the org's published rule, so everyone in the org may read it —
-- staff need to see "annual: 21 days" to make sense of their own balance.

drop policy if exists "leave policy: select in org" on leave_policies;
create policy "leave policy: select in org" on leave_policies for select
  using (
    (select role from public.current_employee()) = 'super_admin'
    or org_id = (select org_id from public.current_employee())
  );

-- Entitlements are per person, so they follow the four-tier model 0008
-- established: your own, your site's if you manage it, your org's if you
-- administer it, everything if you are the vendor.
drop policy if exists "leave entitlement: select tiered" on leave_entitlements;
create policy "leave entitlement: select tiered" on leave_entitlements for select
  using (
    employee_id = auth.uid()
    or (select role from public.current_employee()) = 'super_admin'
    or (
      (select role from public.current_employee()) = 'org_admin'
      and org_id = (select org_id from public.current_employee())
    )
    or (
      (select role from public.current_employee()) = 'manager'
      and org_id = (select org_id from public.current_employee())
      and public.employee_site_id(employee_id)
          = (select site_id from public.current_employee())
    )
  );

-- ── 4. Writes — admins only ─────────────────────────────────────────────
--
-- Note what this does NOT need: a per-column trigger stopping an employee
-- raising their own `days_granted`. Staff have no write policy here at all, so
-- role-scoped RLS covers it. The per-column triggers in 0008, 0010 and 0011
-- exist because those tables grant a write and must then restrict a column;
-- that is not the situation here, and adding one would be cargo cult.

drop policy if exists "leave policy: admins manage" on leave_policies;
create policy "leave policy: admins manage" on leave_policies for all
  using (
    (select role from public.current_employee()) = 'super_admin'
    or (
      (select role from public.current_employee()) = 'org_admin'
      and org_id = (select org_id from public.current_employee())
    )
  )
  with check (
    (select role from public.current_employee()) = 'super_admin'
    or (
      (select role from public.current_employee()) = 'org_admin'
      and org_id = (select org_id from public.current_employee())
    )
  );

drop policy if exists "leave entitlement: admins manage" on leave_entitlements;
create policy "leave entitlement: admins manage" on leave_entitlements for all
  using (
    (select role from public.current_employee()) = 'super_admin'
    or (
      (select role from public.current_employee()) = 'org_admin'
      and org_id = (select org_id from public.current_employee())
    )
  )
  with check (
    (select role from public.current_employee()) = 'super_admin'
    or (
      (select role from public.current_employee()) = 'org_admin'
      and org_id = (select org_id from public.current_employee())
    )
  );

-- ── 5. Materialising a year from the policy ─────────────────────────────
--
-- Without this the feature launches with every balance blank. SECURITY DEFINER
-- so it can insert for every employee in the org, but gated to the caller's own
-- organization and to admins — plus the `auth.uid() is null` escape hatch 0011
-- and 0012 use, which is what lets the service role and the SQL editor seed.
--
-- `on conflict do nothing` is load-bearing: re-running must not overwrite an
-- entitlement an admin has adjusted by hand. That is the difference between
-- idempotent and destructive.

create or replace function public.ensure_leave_entitlements(p_year integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_role   text;
  v_count  integer;
begin
  if p_year is null or p_year < 2020 or p_year > 2100 then
    raise exception 'Year must be between 2020 and 2100.';
  end if;

  if auth.uid() is null then
    raise exception
      'ensure_leave_entitlements needs a signed-in admin; call it with an org context.';
  end if;

  select org_id, role into v_org_id, v_role from public.current_employee();

  if v_role not in ('org_admin', 'super_admin') then
    raise exception 'Only organization admins can grant leave entitlements.';
  end if;

  insert into leave_entitlements (employee_id, org_id, leave_type, year, days_granted)
  select e.id, e.org_id, p.leave_type, p_year, p.annual_days
  from employees e
  join leave_policies p on p.org_id = e.org_id
  where e.org_id = v_org_id
  on conflict (employee_id, leave_type, year) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.ensure_leave_entitlements(integer) to authenticated;

-- PostgREST serves a cached schema and 404s new tables and functions until it
-- refreshes, which looks exactly like the migration not having run.
notify pgrst, 'reload schema';

commit;
```

- [ ] **Step 3: Confirm no existing migration was touched**

```bash
git status --short supabase/migrations/
```

Expected: only `0014_leave_entitlements.sql` as new (`??`). If any of 0001–0013 shows modified, revert it.

- [ ] **Step 4: Audit re-runnability**

Read the file back. Every statement must be `create table if not exists`, `create index if not exists`, `alter table … enable row level security`, `drop policy if exists` + `create policy`, `create or replace function`, `grant`, or `notify`. Report the count of each form. Name any statement that would fail on a second run.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0014_leave_entitlements.sql
git commit -m "Give leave a denominator: policies and per-year entitlements

leave_requests has recorded requests since 0001 with no allowance anywhere in
the schema, so a balance had nothing to compute against and utilization had no
denominator.

Two tables rather than a column on employees, because a balance must survive
the policy changing — move from 21 days to 25 next year and every prior year's
balance has to stay what it was.

A leave type with no policy row is tracked but not budgeted, which is why sick
is not seeded: a hard sick allowance encourages people to work ill. No code
special-cases the type.

ensure_leave_entitlements uses on conflict do nothing, deliberately: re-running
must not overwrite an entitlement an admin adjusted by hand.

No per-column trigger here. Staff have no write policy on entitlements at all,
so role-scoped RLS covers what 0008/0010/0011 needed triggers for.

Unexecuted."
```

**This migration is not run by this task.** Later tasks must tolerate the tables being absent — see Task 3.

---

### Task 2: The pure balance module

**Files:**
- Create: `src/lib/leave-balance.ts`
- Create: `src/lib/leave-balance.test.mts`

**Interfaces:**
- Consumes: nothing. Imports nothing — same constraint as `src/lib/tenant-summary.ts`, which documents why (`@/` does not resolve under `node --test`).
- Produces:
  - `countLeaveDays(startDate: string, endDate: string): number`
  - `buildLeaveBalances(input: { year: number; entitlements: EntitlementRow[]; requests: LeaveRequestRow[] }): LeaveBalance[]`
  - types `EntitlementRow`, `LeaveRequestRow`, `LeaveBalance`
  Tasks 3 and 5 both import these. **One implementation, two consumers** — the point of extracting it.

- [ ] **Step 1: Write the failing test**

Create `src/lib/leave-balance.test.mts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { countLeaveDays, buildLeaveBalances } from "./leave-balance.ts";

test("a single day is one day", () => {
  assert.equal(countLeaveDays("2026-08-12", "2026-08-12"), 1);
});

test("counts calendar days inclusive, weekends included", () => {
  // Wed 12 Aug to Sun 16 Aug 2026 — five calendar days, weekend deducted.
  assert.equal(countLeaveDays("2026-08-12", "2026-08-16"), 5);
});

test("spans a month boundary", () => {
  assert.equal(countLeaveDays("2026-08-30", "2026-09-02"), 4);
});

test("spans a leap day", () => {
  assert.equal(countLeaveDays("2028-02-27", "2028-03-01"), 4);
});

test("an end before the start counts as zero rather than negative", () => {
  assert.equal(countLeaveDays("2026-08-16", "2026-08-12"), 0);
});

test("an unparseable date counts as zero rather than NaN", () => {
  // NaN would propagate silently through a balance and render as "NaN days".
  assert.equal(countLeaveDays("not-a-date", "2026-08-12"), 0);
});

const ENTITLEMENTS = [
  { leave_type: "annual", days_granted: 21, days_carried: 3 },
];

test("remaining is granted plus carried minus approved", () => {
  const [annual] = buildLeaveBalances({
    year: 2026,
    entitlements: ENTITLEMENTS,
    requests: [
      { leave_type: "annual", start_date: "2026-08-12", end_date: "2026-08-16", status: "approved" },
    ],
  });

  assert.equal(annual.granted, 21);
  assert.equal(annual.carried, 3);
  assert.equal(annual.taken, 5);
  assert.equal(annual.remaining, 19);
});

test("pending is reported separately and does not reduce remaining", () => {
  const [annual] = buildLeaveBalances({
    year: 2026,
    entitlements: ENTITLEMENTS,
    requests: [
      { leave_type: "annual", start_date: "2026-08-12", end_date: "2026-08-16", status: "pending" },
    ],
  });

  assert.equal(annual.taken, 0);
  assert.equal(annual.pending, 5);
  assert.equal(annual.remaining, 24);
});

test("rejected and cancelled requests count for nothing", () => {
  const [annual] = buildLeaveBalances({
    year: 2026,
    entitlements: ENTITLEMENTS,
    requests: [
      { leave_type: "annual", start_date: "2026-08-12", end_date: "2026-08-16", status: "rejected" },
      { leave_type: "annual", start_date: "2026-09-01", end_date: "2026-09-02", status: "cancelled" },
    ],
  });

  assert.equal(annual.taken, 0);
  assert.equal(annual.pending, 0);
  assert.equal(annual.remaining, 24);
});

test("a type with no entitlement is tracked but not budgeted", () => {
  // This is how sick leave behaves by default: days counted, no allowance.
  const balances = buildLeaveBalances({
    year: 2026,
    entitlements: ENTITLEMENTS,
    requests: [
      { leave_type: "sick", start_date: "2026-03-02", end_date: "2026-03-03", status: "approved" },
    ],
  });

  const sick = balances.find((b) => b.leaveType === "sick");
  assert.equal(sick?.taken, 2);
  assert.equal(sick?.granted, 0);
  assert.equal(sick?.remaining, null);
});

test("requests are attributed to the year their start date falls in", () => {
  const [annual] = buildLeaveBalances({
    year: 2026,
    entitlements: ENTITLEMENTS,
    requests: [
      { leave_type: "annual", start_date: "2025-12-30", end_date: "2026-01-02", status: "approved" },
    ],
  });

  // Starts in 2025, so it belongs to 2025's balance, not 2026's.
  assert.equal(annual.taken, 0);
});

test("an entitlement with no requests still appears, so a balance is visible from day one", () => {
  const balances = buildLeaveBalances({ year: 2026, entitlements: ENTITLEMENTS, requests: [] });
  assert.equal(balances.length, 1);
  assert.equal(balances[0].remaining, 24);
});

test("a request with an unparseable date is ignored, not counted as a year zero", () => {
  // The first draft of this module guarded with `utcMidnight(x) !== NaN`, which
  // is always true because NaN is not equal to itself — so a malformed date fell
  // through to the year check and could be silently attributed or dropped
  // depending on the string. This test is the one that catches that.
  const [annual] = buildLeaveBalances({
    year: 2026,
    entitlements: ENTITLEMENTS,
    requests: [
      { leave_type: "annual", start_date: "garbage", end_date: "2026-08-16", status: "approved" },
    ],
  });

  assert.equal(annual.taken, 0);
  assert.equal(annual.remaining, 24);
});

test("balances are ordered with annual first", () => {
  const balances = buildLeaveBalances({
    year: 2026,
    entitlements: [
      { leave_type: "unpaid", days_granted: 0, days_carried: 0 },
      { leave_type: "annual", days_granted: 21, days_carried: 0 },
    ],
    requests: [],
  });
  assert.equal(balances[0].leaveType, "annual");
});
```

- [ ] **Step 2: Run it and verify it fails**

```bash
node --test "src/**/*.test.mts"
```

Expected: FAIL — cannot find module `./leave-balance.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/leave-balance.ts`:

```ts
/**
 * Leave balances, computed in one place.
 *
 * Imports nothing, for the same reason `tenant-summary.ts` imports nothing: the
 * `@/` alias does not resolve under `node --test`, and these figures are what
 * somebody plans a holiday around, so they are worth testing without a
 * database.
 *
 * Two rules are deliberate and stated on screen next to the numbers:
 *
 *  - **Calendar days, inclusive.** 12–16 August is five days. Weekends and
 *    public holidays are deducted, because this product's tenants are security
 *    firms, logistics and retail where weekend work is normal — a weekend
 *    inside a leave period genuinely is leave. Working-days counting would let
 *    a guard rostered on Saturdays take leave on a working day for free.
 *  - **Only `approved` reduces a balance.** `pending` is reported separately so
 *    nobody books the same days twice, and so a manager sitting on a request
 *    does not silently consume someone's allowance.
 *
 * Half-day requests are out of scope: `leave_requests` has no such column.
 */

export type EntitlementRow = {
  leave_type: string;
  days_granted: number;
  days_carried: number;
};

export type LeaveRequestRow = {
  leave_type: string;
  /** `YYYY-MM-DD` — a Postgres `date`, no time component. */
  start_date: string;
  end_date: string;
  status: string;
};

export type LeaveBalance = {
  leaveType: string;
  granted: number;
  carried: number;
  taken: number;
  pending: number;
  /** null means tracked but not budgeted — no entitlement exists for this type. */
  remaining: number | null;
};

/** Annual first, then the rest alphabetically. Annual is the one people plan around. */
const TYPE_ORDER = ["annual", "sick", "compassionate", "unpaid"];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Parses `YYYY-MM-DD` to a UTC midnight timestamp.
 *
 * Deliberately not `new Date(str)` with a local-time fallback: differencing two
 * UTC midnights is immune to DST and to the server's timezone, which is exactly
 * the class of bug `src/lib/timezone.ts` exists to prevent. Returns NaN on
 * anything that is not three integers.
 */
function utcMidnight(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return Number.NaN;
  const [, y, m, d] = match;
  return Date.UTC(Number(y), Number(m) - 1, Number(d));
}

export function countLeaveDays(startDate: string, endDate: string): number {
  const start = utcMidnight(startDate);
  const end = utcMidnight(endDate);

  // Zero rather than NaN or a negative: a NaN would propagate through the whole
  // balance and render as "NaN days remaining", which is worse than a request
  // that appears to cost nothing and can be spotted.
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;

  return Math.round((end - start) / DAY_MS) + 1;
}

export function buildLeaveBalances(input: {
  year: number;
  entitlements: EntitlementRow[];
  requests: LeaveRequestRow[];
}): LeaveBalance[] {
  const { year, entitlements, requests } = input;

  const byType = new Map<string, LeaveBalance>();

  const ensure = (leaveType: string): LeaveBalance => {
    let balance = byType.get(leaveType);
    if (!balance) {
      balance = {
        leaveType,
        granted: 0,
        carried: 0,
        taken: 0,
        pending: 0,
        remaining: null,
      };
      byType.set(leaveType, balance);
    }
    return balance;
  };

  for (const entitlement of entitlements) {
    const balance = ensure(entitlement.leave_type);
    balance.granted = Number(entitlement.days_granted) || 0;
    balance.carried = Number(entitlement.days_carried) || 0;
  }

  for (const request of requests) {
    // `countLeaveDays` already returns 0 for an unparseable or reversed range,
    // so this one check screens out both bad data and empty ranges before the
    // year is read. Do NOT guard with `utcMidnight(x) !== Number.NaN` — that
    // comparison is always true, because NaN is not equal to itself.
    const days = countLeaveDays(request.start_date, request.end_date);
    if (days === 0) continue;

    // Attributed to the year its start date falls in. A request spanning New
    // Year therefore belongs wholly to the year it began — simple, and stated
    // rather than split silently.
    if (Number(request.start_date.slice(0, 4)) !== year) continue;

    const balance = ensure(request.leave_type);
    if (request.status === "approved") balance.taken += days;
    else if (request.status === "pending") balance.pending += days;
    // rejected and cancelled count for nothing, deliberately.
  }

  // `remaining` stays null for a type with no entitlement — tracked, not
  // budgeted. That is how sick leave behaves unless an org adds a policy row.
  for (const balance of byType.values()) {
    const hasEntitlement = entitlements.some(
      (e) => e.leave_type === balance.leaveType
    );
    balance.remaining = hasEntitlement
      ? balance.granted + balance.carried - balance.taken
      : null;
  }

  return [...byType.values()].sort((a, b) => {
    const rank =
      (TYPE_ORDER.indexOf(a.leaveType) + 1 || 99) -
      (TYPE_ORDER.indexOf(b.leaveType) + 1 || 99);
    return rank !== 0 ? rank : a.leaveType.localeCompare(b.leaveType);
  });
}
```

- [ ] **Step 4: Run the tests and verify they pass**

```bash
node --test "src/**/*.test.mts"
```

Expected: PASS — 14 new tests, plus the 15 existing (9 `tenant-summary`, 6 `notice-audience`) = **29**.

- [ ] **Step 5: Verify types and lint**

```bash
npx tsc --noEmit && npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/leave-balance.ts src/lib/leave-balance.test.mts
git commit -m "Add a tested leave-balance module

One implementation of the number, consumed by both the staff page and the admin
report — two implementations of a balance would disagree eventually, and this is
a figure people plan holidays around.

Calendar days inclusive, only approved requests reducing the balance, pending
reported separately, and a type with no entitlement tracked rather than
budgeted. Dates are differenced as UTC midnights so the result is immune to DST
and to the server's timezone.

An unparseable or reversed date range counts as zero rather than NaN or a
negative: NaN would propagate into 'NaN days remaining'."
```

---

### Task 3: The staff balance on `/dashboard/leave`

**Files:**
- Modify: `src/app/dashboard/leave/page.tsx`

**Interfaces:**
- Consumes: `buildLeaveBalances` and its types from `@/lib/leave-balance` (Task 2); tables from Task 1.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Read the page as it stands**

```bash
cat src/app/dashboard/leave/page.tsx
```

Note the existing leave-requests query, its `leaveFailed` error branch, the empty branch, the `LEAVE_STATUS_VARIANT` badge map, `LeaveRequestDialog` in the card header, and the "balances aren't tracked yet" note — **that note must be removed**, since this task is what makes it false.

- [ ] **Step 2: Add the two reads**

Extend the existing `Promise.all` to fetch, for the current year:

```ts
supabase
  .from("leave_entitlements")
  .select("leave_type, days_granted, days_carried")
  .eq("employee_id", employee.id)
  .eq("year", year),
```

and keep the existing requests query, widening it to select all of the current year's requests rather than `limit(20)`, so the balance is computed from the whole year:

```ts
supabase
  .from("leave_requests")
  .select("id, leave_type, start_date, end_date, status")
  .eq("employee_id", employee.id)
  .gte("start_date", `${year}-01-01`)
  .lte("start_date", `${year}-12-31`)
  .order("start_date", { ascending: false }),
```

`year` comes from the org timezone, not the server's: derive it from `localDateKey(new Date())` — `Number(localDateKey(new Date()).slice(0, 4))` — importing `localDateKey` from `@/lib/attendance-series`. Using `new Date().getFullYear()` would put a Nairobi user into the wrong year for the first three hours of 1 January.

- [ ] **Step 3: Tolerate the migration being unapplied**

Migration 0014 is unexecuted, so `leave_entitlements` 404s. Capture that query's error **separately** from the requests query, and treat it as "no balances to show" rather than failing the page — the request list must keep working exactly as it does today.

Render, when the entitlements read fails:

```tsx
<Callout variant="note" label="Balances unavailable">
  Leave balances aren&apos;t set up on this organization yet. Your requests are
  listed below and are unaffected.
</Callout>
```

This is the one place in this plan where a failed read is *not* rendered as an error state, and the reason is specific: an absent table means the feature is not provisioned, which is different from a read that broke. Do not extend that reasoning to the requests query, whose failure must still show its own error copy.

- [ ] **Step 4: Render the balances**

Above the requests card, one row per balance from `buildLeaveBalances`. For each: the type (capitalised), `remaining` as the headline figure, and `granted + carried`, `taken` and `pending` as supporting detail. When `remaining` is null, show the taken count and the words "tracked, no allowance" instead of a remaining figure — do not render "0 remaining", which would read as "you have none left".

Beneath the balances, print the counting rule verbatim, because the Global Constraints require it to be on screen:

```tsx
<p className="text-xs text-muted-foreground">
  Leave is counted in calendar days, including weekends and public holidays.
  Only approved requests reduce your balance; pending ones are shown separately.
</p>
```

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit && npm run lint && npm run build   # 20 route rows
node --test "src/**/*.test.mts"                      # 29
```

Then start a server on port **3350** and confirm `/dashboard/leave` still redirects an unauthenticated visitor to `/login?next=…`:

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3350/dashboard/leave
```

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/leave/page.tsx
git commit -m "Show staff their leave balance

Granted plus carried minus approved, with pending listed separately so nobody
books the same days twice. The counting rule is printed underneath, because a
number someone plans a holiday around must not be ambiguous.

A type with no entitlement reads 'tracked, no allowance' rather than '0
remaining' — the second would tell someone they have none left when the truth
is that nobody set an allowance.

The year comes from the org timezone rather than the server's, or a Nairobi user
lands in the wrong year for the first three hours of 1 January.

Removes the 'balances aren't tracked yet' note, which this makes false."
```

---

### Task 4: Policy editing and granting on `/admin/settings`

**Files:**
- Create: `src/app/admin/settings/leave-policy-form.tsx`
- Create: `src/app/admin/settings/grant-entitlements-button.tsx`
- Modify: `src/app/admin/settings/actions.ts`
- Modify: `src/app/admin/settings/page.tsx`

**Interfaces:**
- Consumes: Task 1's tables and `ensure_leave_entitlements(p_year)`.
- Produces: `upsertLeavePolicy({ leaveType, annualDays, carryOverMax })` and `grantEntitlements(year)` in `settings/actions.ts`.

- [ ] **Step 1: Read the conventions to follow**

```bash
cat src/app/admin/settings/actions.ts
cat src/app/admin/settings/org-name-form.tsx
```

`updateOrganizationName` is the shape to copy: role check via `getEmployeeContext`, allow-list validation, `{ count: "exact" }`, fresh object literals returned, `revalidatePath`.

- [ ] **Step 2: Add the two actions**

In `src/app/admin/settings/actions.ts`:

```ts
const LEAVE_TYPES = ["annual", "sick", "compassionate", "unpaid"] as const;

/** Max any sane policy would set; also stops a fat-fingered 2100 from sticking. */
const MAX_POLICY_DAYS = 365;

export async function upsertLeavePolicy(input: {
  leaveType: string;
  annualDays: number;
  carryOverMax: number;
}) {
  const employee = await getEmployeeContext();
  if (!employee || !["org_admin", "super_admin"].includes(employee.role)) {
    return { error: "Only org admins can change leave policy." };
  }

  if (!(LEAVE_TYPES as readonly string[]).includes(input.leaveType)) {
    return { error: "Unknown leave type." };
  }

  const finite = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);

  if (!finite(input.annualDays) || input.annualDays < 0 || input.annualDays > MAX_POLICY_DAYS) {
    return { error: `Annual days must be between 0 and ${MAX_POLICY_DAYS}.` };
  }
  if (!finite(input.carryOverMax) || input.carryOverMax < 0 || input.carryOverMax > MAX_POLICY_DAYS) {
    return { error: `Carry-over must be between 0 and ${MAX_POLICY_DAYS}.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("leave_policies").upsert(
    {
      org_id: employee.orgId,
      leave_type: input.leaveType,
      annual_days: input.annualDays,
      carry_over_max: input.carryOverMax,
    },
    { onConflict: "org_id,leave_type" }
  );

  if (error) return { error: error.message };

  revalidatePath("/admin/settings");
  revalidatePath("/dashboard/leave");
  return { success: true as const };
}

/**
 * Materialises this year's entitlements from the policy.
 *
 * The function is `on conflict do nothing`, so pressing this twice does not
 * overwrite an entitlement somebody adjusted by hand. It returns the number of
 * rows actually created, which is what the button reports back.
 */
export async function grantEntitlements(year: number) {
  const employee = await getEmployeeContext();
  if (!employee || !["org_admin", "super_admin"].includes(employee.role)) {
    return { error: "Only org admins can grant entitlements." };
  }

  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return { error: "Pick a year between 2020 and 2100." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ensure_leave_entitlements", {
    p_year: year,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/settings");
  revalidatePath("/dashboard/leave");
  return { success: true as const, created: (data as number) ?? 0 };
}
```

Note `upsert` here **does** need the table's UPDATE policy to exist — it does, via `"leave policy: admins manage"` which is `for all`. That is the trap 0013 hit with dismissals; it does not apply here, and the reason is worth knowing rather than rediscovering.

- [ ] **Step 3: Build the two client components**

`leave-policy-form.tsx`: one row per leave type with number inputs for annual days and carry-over, calling `upsertLeavePolicy`. Follow `org-name-form.tsx` exactly — `loading`, `error`, `saved` state, a `try/catch/finally` around the action so a rejected promise cannot leave the button spinning, and `router.refresh()` on success.

`grant-entitlements-button.tsx`: a button reading "Grant {year} entitlements", calling `grantEntitlements(year)`, and reporting the returned `created` count — "Created 14 entitlements" or "Nothing to create — everyone already has this year's". Include a short line of explanatory copy stating that existing adjusted entitlements are never overwritten, because an admin pressing a button that says "grant" needs to know it is safe to press twice.

- [ ] **Step 4: Add a Leave card to the settings page**

In `src/app/admin/settings/page.tsx`, add a card after "Plan & billing": the policy form, the grant button, and a count of how many employees already have an entitlement for the current year. Query `leave_policies` for the org and `leave_entitlements` filtered to the current year, capture both errors, and on failure render the card's own error state — not the page's.

Render the same counting-rule sentence used on the staff page, so an admin setting a policy sees the rule the number will be computed under.

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit && npm run lint && npm run build   # 20 route rows
node --test "src/**/*.test.mts"                      # 29
grep -rn "pay_rate\|employment_type" src/app/admin/settings/ || echo "clean"
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Let admins set leave policy and grant a year's entitlements

Policy lives on /admin/settings, which already owns org-level configuration.
The grant button materialises the year from the policy and reports how many rows
it created; the underlying function is on-conflict-do-nothing, so pressing it
twice cannot overwrite an entitlement someone adjusted by hand, and the button
says so.

Note the policy upsert is safe where 0013's dismissal upsert was not: this table
has a FOR ALL admin policy, so the ON CONFLICT DO UPDATE path has an UPDATE
policy to satisfy."
```

---

### Task 5: Utilization on `/admin/reports`, and verification

**Files:**
- Modify: `src/app/admin/reports/page.tsx`
- Modify: `scripts/smoke-authed.mjs`

**Interfaces:**
- Consumes: `buildLeaveBalances` (Task 2), Task 1's tables.
- Produces: nothing.

- [ ] **Step 1: Add the org-level reads**

In `src/app/admin/reports/page.tsx`, add to the existing `Promise.all`, for the current year (derived through `localDateKey`, as in Task 3):

```ts
supabase
  .from("leave_entitlements")
  .select("employee_id, leave_type, days_granted, days_carried")
  .eq("org_id", employee.orgId)
  .eq("year", year),
supabase
  .from("leave_requests")
  .select("employee_id, leave_type, start_date, end_date, status")
  .eq("org_id", employee.orgId)
  .gte("start_date", `${year}-01-01`)
  .lte("start_date", `${year}-12-31`),
```

- [ ] **Step 2: Aggregate with the shared module, not a second implementation**

Group both result sets by `employee_id`, call `buildLeaveBalances` per employee, then sum across employees per leave type. **Do not compute days or balances inline** — the whole reason Task 2 exists is that two implementations of this number would eventually disagree.

Render a card showing, per leave type: total granted, total taken, utilization as a percentage, and the count of employees with an entitlement. Show percentages only where total granted is greater than zero; a percentage of zero granted is a division by zero rendered as `NaN%` or `Infinity%`.

- [ ] **Step 3: Tolerate the migration being unapplied**

As in Task 3: capture the two new queries' errors separately and render the card's own "not set up yet" note rather than breaking the report, which works today.

- [ ] **Step 4: Extend the authenticated pass**

In `scripts/smoke-authed.mjs`, inside the existing `ROUTES` loop's `/dashboard/leave` branch, add assertions that are capable of failing:

```js
if (r.path === "/dashboard/leave") {
  const t2 = await page.evaluate(() => document.body.innerText);
  // Falsifiable: this sentence exists only on this page and only because the
  // Global Constraints require the counting rule to be on screen.
  report(/calendar days, including weekends/i.test(t2), "leave page states the counting rule");
  // Either a real balance or the not-provisioned note — but not silence.
  report(
    /remaining|tracked, no allowance|balances aren't set up/i.test(t2),
    "leave page shows a balance or says why it cannot"
  );
}
```

The second assertion deliberately accepts either state, because migration 0014 is unapplied and the honest outcome right now is the note. It still fails if the page shows neither.

- [ ] **Step 5: Verify everything**

```bash
node --test "src/**/*.test.mts"          # 29
npx tsc --noEmit && npm run lint
npm run build                             # 20 route rows
PORT=3360 npm start &
sleep 10
npm run smoke http://localhost:3360       # 107/107
```

Report the new authed check count and its arithmetic. Do **not** run `smoke:authed` — no credentials; the controller runs it.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add leave utilization to reports, and cover the balance in the authed pass

Utilization is computed by grouping the org's entitlements and requests per
employee and calling the same buildLeaveBalances the staff page uses. A second
implementation of a leave balance would disagree with the first eventually, and
an admin and an employee seeing different numbers for the same person is the
worst version of that.

Percentages are only rendered where granted days are greater than zero, so a
type nobody has an allowance for cannot show NaN%."
```

---

## Verification summary

Done when:

- [ ] `node --test "src/**/*.test.mts"` — **29** passing (9 tenant-summary, 6 notice-audience, 14 leave-balance)
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build` all exit 0 with **20 route rows**
- [ ] `npm run smoke` — 107/107
- [ ] `npm run smoke:authed` — passes, with the two new leave assertions
- [ ] `git status --short supabase/migrations/` shows only 0014 as new; 0001–0013 untouched
- [ ] `grep -rn "countLeaveDays\|buildLeaveBalances" src/app/` shows both the staff page and the reports page importing from `@/lib/leave-balance`, and **no inline day arithmetic anywhere**

**Explicitly not done, and not to be claimed:** migration 0014 is unexecuted at the end of this plan. Until an operator applies it, both the staff balance card and the utilization card render their not-provisioned notes, and no balance has ever been seen with real data. The admin policy form and grant button cannot be exercised at all without an admin session, which the staff demo account is not.
