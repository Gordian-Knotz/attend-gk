-- Stops an org_admin promoting themselves to super_admin.
--
-- WHY THIS EXISTS
--
-- 0003's roster policy reads:
--
--   using (
--     (select role from current_employee()) = 'super_admin'
--     or ((select role from current_employee()) = 'org_admin'
--         and org_id = (select org_id from current_employee()))
--   )
--
-- It constrains *who* may write and *which organization's rows* they may
-- write. It does not constrain the `role` column. So any org_admin could
--
--   PATCH /rest/v1/employees?id=eq.<themselves>   {"role": "super_admin"}
--
-- and grant themselves the platform: every organization's data, and — since
-- /super shipped — the ability to change anyone's plan, mark them paid, or
-- suspend them.
--
-- Same shape as the hole 0010 closed on `organizations`: a per-column rule,
-- which row-level security cannot express. Same remedy: a trigger.
--
-- Safe to run twice.

create or replace function public.guard_employee_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role employee_role;
begin
  -- No JWT means this is the SQL editor, a migration, or the service role.
  -- Those are trusted by definition, and it is how the first super_admin
  -- has to be created — see README, "Becoming a super admin".
  if auth.uid() is null then
    return new;
  end if;

  select role into caller_role from public.current_employee();

  if caller_role = 'super_admin' then
    return new;
  end if;

  -- Nobody else may mint one.
  if new.role = 'super_admin' then
    raise exception
      'Only platform administrators can grant super_admin'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    -- ...or demote one. Without this, an org_admin could strip the only
    -- super_admin in their org and take the seat on the next pass.
    if old.role = 'super_admin' then
      raise exception
        'Only platform administrators can change a super_admin'
        using errcode = '42501';
    end if;

    -- ...or move somebody between tenants, which would carry their
    -- attendance history across with them.
    if new.org_id is distinct from old.org_id then
      raise exception
        'Only platform administrators can move an employee between organizations'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists employees_guard_role on employees;
create trigger employees_guard_role
  before insert or update on employees
  for each row execute function public.guard_employee_role();

notify pgrst, 'reload schema';
