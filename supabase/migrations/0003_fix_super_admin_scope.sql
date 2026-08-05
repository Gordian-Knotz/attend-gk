-- Fixes two bugs in the 0001 RLS policies:
--
-- 1. super_admin was accidentally scoped to their own org_id on most
--    tables, same as org_admin — contradicting Section 06 ("Super Admin:
--    full platform access: all organizations"). This is the role meant for
--    PAC's own operator account, managing every client org.
--
-- 2. The org_admin "manage" (all-command) policies on shifts,
--    attendance_summary, biometric_devices, and payroll_exports had NO
--    org_id check whatsoever — any org_admin could write to another org's
--    rows on those four tables. Real cross-tenant bug, fixed here.

-- ── employees ────────────────────────────────────────────────────────────

drop policy "employees: select by org admin" on employees;
create policy "employees: select by org admin" on employees for select
  using (
    (select role from public.current_employee()) = 'super_admin'
    or (
      (select role from public.current_employee()) = 'org_admin'
      and org_id = (select org_id from public.current_employee())
    )
  );

drop policy "employees: admins manage roster" on employees;
create policy "employees: admins manage roster" on employees for all
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

-- ── sites ────────────────────────────────────────────────────────────────

drop policy "sites: admins manage" on sites;
create policy "sites: admins manage" on sites for all
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

-- ── attendance_events ────────────────────────────────────────────────────

drop policy "attendance: admins manage org" on attendance_events;
create policy "attendance: admins manage org" on attendance_events for all
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

-- ── shifts (was missing org_id check entirely) ──────────────────────────

drop policy "shifts: admins manage" on shifts;
create policy "shifts: admins manage" on shifts for all
  using (
    (select role from public.current_employee()) = 'super_admin'
    or (
      (select role from public.current_employee()) = 'org_admin'
      and exists (
        select 1 from employees e
        where e.id = shifts.employee_id
          and e.org_id = (select org_id from public.current_employee())
      )
    )
  )
  with check (
    (select role from public.current_employee()) = 'super_admin'
    or (
      (select role from public.current_employee()) = 'org_admin'
      and exists (
        select 1 from employees e
        where e.id = shifts.employee_id
          and e.org_id = (select org_id from public.current_employee())
      )
    )
  );

-- ── attendance_summary (was missing org_id check entirely) ──────────────

drop policy "summary: admins manage" on attendance_summary;
create policy "summary: admins manage" on attendance_summary for all
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

-- ── biometric_devices (was missing org_id check entirely) ───────────────

drop policy "devices: admins manage" on biometric_devices;
create policy "devices: admins manage" on biometric_devices for all
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

-- ── payroll_exports (was missing org_id check entirely) ─────────────────

drop policy "payroll: admins manage" on payroll_exports;
create policy "payroll: admins manage" on payroll_exports for all
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

-- ── leave_requests admin policy (add super_admin bypass) ────────────────

drop policy "leave: admins manage" on leave_requests;
create policy "leave: admins manage" on leave_requests for update
  using (
    (select role from public.current_employee()) = 'super_admin'
    or (
      (select role from public.current_employee()) in ('org_admin', 'manager')
      and org_id = (select org_id from public.current_employee())
    )
  );
