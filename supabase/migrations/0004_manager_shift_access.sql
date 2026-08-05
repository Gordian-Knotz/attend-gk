-- Section 06: "Manager: Build/edit shifts for their site." The 0003 fix
-- only added org_admin/super_admin to the shifts "admins manage" policy —
-- managers were left out entirely, so they couldn't create shifts at all.
-- Adding a manager clause, scoped to their own site.

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
    or (
      (select role from public.current_employee()) = 'manager'
      and site_id = (select site_id from public.current_employee())
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
    or (
      (select role from public.current_employee()) = 'manager'
      and site_id = (select site_id from public.current_employee())
    )
  );
