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

-- ── 2.5. Helper: Cross-tenant enforcement ──────────────────────────────
--
-- employee_org_id returns the org of a given employee, but only when it
-- matches the calling user's own org. For any employee outside the caller's
-- org, it returns null. This prevents the cross-tenant write hole: a policy
-- that checks `org_id = public.employee_org_id(employee_id)` will refuse
-- writes for employees outside the caller's scope.
--
-- This mirrors the narrowing of employee_site_id in 0012, and mirrors the
-- pattern 0008 established when it added similar denormalisation checks.

create or replace function public.employee_org_id(p_employee uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select org_id
  from employees
  where id = p_employee
    and org_id = (select org_id from public.current_employee())
$$;

grant execute on function public.employee_org_id(uuid) to authenticated;

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
      and org_id = public.employee_org_id(employee_id)
    )
  )
  with check (
    (select role from public.current_employee()) = 'super_admin'
    or (
      (select role from public.current_employee()) = 'org_admin'
      and org_id = (select org_id from public.current_employee())
      and org_id = public.employee_org_id(employee_id)
    )
  );

-- ── 5. Materialising a year from the policy ─────────────────────────────
--
-- Without this the feature launches with every balance blank. SECURITY DEFINER
-- so it can insert for every employee in the org, but gated to the caller's own
-- organization and to admins.
--
-- Unlike 0011 and 0012, this RPC deliberately does NOT pass through null auth.
-- A seed script that wants to insert leave_entitlements can call the insert
-- directly, since the service role bypasses RLS entirely. Failing loudly on an
-- unauthenticated call prevents accidental misuse of this RPC.
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
  v_role   employee_role;
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

  -- `v_role not in (...)` is NULL, not true, when current_employee() returns
  -- no row — a signed-in auth user with no employee row (exactly the state
  -- /onboarding exists to resolve) would fall through the role check below
  -- and reach the insert, which then matches zero rows only because
  -- v_org_id is also null. That is an accident, not a guard: raise here
  -- explicitly rather than depending on the insert failing to match later.
  if v_org_id is null then
    raise exception
      'No employee record for the signed-in user; cannot grant leave entitlements.'
      using errcode = '42501';
  end if;

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
