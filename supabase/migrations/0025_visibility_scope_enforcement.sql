-- 0025 — Enforce org_levels.visibility_scope, without rewriting a single
--        existing policy.
--
-- WHY RESTRICTIVE
--
-- Postgres combines multiple PERMISSIVE policies with OR, so a new permissive
-- policy can only ever WIDEN access. Narrowing by adding one is impossible;
-- the only way is to rewrite the existing policies — and this schema has
-- produced RLS defects in 0007, 0008, 0011, 0014 AND 0016, so rewriting
-- twenty-plus policies is the single riskiest change available.
--
-- RESTRICTIVE policies combine with AND. So each table below gains exactly one
-- new policy meaning "and the row must also be inside your visibility scope",
-- and every permissive policy written between 0001 and 0023 is left
-- byte-identical. This is "layer on top, don't replace" applied to the hardest
-- piece rather than only the easy ones.
--
-- FOR SELECT ONLY
--
-- Deliberate. Narrowing writes as well would change who can clock in, approve
-- leave or build a roster, which is a different feature with a different blast
-- radius. Writes stay governed by the permissive policies and the six triggers.
--
-- WHY THIS CHANGES NOTHING TODAY
--
-- visible_employee_ids() (0024) returns every employee in the caller's org when
-- their org_level_id is null, and it is null for every employee that currently
-- exists. So each policy below evaluates to true for every row any user can
-- already reach. Verified after applying, per user role, by counting rows before
-- and after.
--
-- The narrowing only begins when an admin assigns somebody a level whose scope
-- is narrower than their tier — which is the entire point of the feature, and
-- is now a deliberate act rather than a side effect of this migration.
--
-- SUPER_ADMIN IS EXEMPT IN EVERY POLICY
--
-- Restrictive policies apply to everyone. Without the exemption the `/super`
-- console would go blank, because the vendor has no employees row in the tenant
-- being inspected. The service role bypasses RLS entirely and is unaffected.
--
-- ONE INTERACTION WORTH KNOWING ABOUT
--
-- Several existing policies contain `exists (select 1 from employees e ...)` —
-- 0003's and 0004's shifts policies, for instance. A subquery against employees
-- inside a policy is itself subject to the policies on employees, so those
-- checks are now also bounded by the caller's visibility scope. That is
-- consistent (a narrowed admin should not manage shifts for people they cannot
-- see) and it is not a no-op, so it is stated here rather than discovered later.

begin;

-- ── employees ────────────────────────────────────────────────────────────
--
-- `id`, not `employee_id`. visible_employee_ids() always includes the caller
-- themselves in every branch, so "employees: select self" (0001) keeps working
-- — a staff member can always read their own row.

drop policy if exists "employees: within visibility scope" on employees;
create policy "employees: within visibility scope"
  on employees as restrictive for select
  using (
    (select role from public.current_employee()) = 'super_admin'
    or id in (select public.visible_employee_ids())
  );

-- ── attendance_events ────────────────────────────────────────────────────

drop policy if exists "attendance: within visibility scope" on attendance_events;
create policy "attendance: within visibility scope"
  on attendance_events as restrictive for select
  using (
    (select role from public.current_employee()) = 'super_admin'
    or employee_id in (select public.visible_employee_ids())
  );

-- ── attendance_summary ───────────────────────────────────────────────────

drop policy if exists "summary: within visibility scope" on attendance_summary;
create policy "summary: within visibility scope"
  on attendance_summary as restrictive for select
  using (
    (select role from public.current_employee()) = 'super_admin'
    or employee_id in (select public.visible_employee_ids())
  );

-- ── leave_requests ───────────────────────────────────────────────────────

drop policy if exists "leave: within visibility scope" on leave_requests;
create policy "leave: within visibility scope"
  on leave_requests as restrictive for select
  using (
    (select role from public.current_employee()) = 'super_admin'
    or employee_id in (select public.visible_employee_ids())
  );

-- ── shifts ───────────────────────────────────────────────────────────────

drop policy if exists "shifts: within visibility scope" on shifts;
create policy "shifts: within visibility scope"
  on shifts as restrictive for select
  using (
    (select role from public.current_employee()) = 'super_admin'
    or employee_id in (select public.visible_employee_ids())
  );

-- ── leave_entitlements ───────────────────────────────────────────────────

drop policy if exists "entitlements: within visibility scope" on leave_entitlements;
create policy "entitlements: within visibility scope"
  on leave_entitlements as restrictive for select
  using (
    (select role from public.current_employee()) = 'super_admin'
    or employee_id in (select public.visible_employee_ids())
  );

commit;

notify pgrst, 'reload schema';
