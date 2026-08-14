-- 0026 — Close the DELETE half of 0011.
--
-- 0011 stops an org_admin promoting themselves to super_admin, and stops them
-- demoting an existing one. Its trigger is BEFORE INSERT OR UPDATE.
--
-- Deleting was never covered. "employees: admins manage roster" (0001, widened
-- 0003) is a FOR ALL policy, so it grants DELETE on any row in the org_admin's
-- own organization — including a super_admin's row. Removing that row does not
-- delete the auth user, but it is what every role check in the product reads:
-- current_employee() returns nothing, so the platform administrator becomes a
-- user with no organization and /super closes to them.
--
-- WHY THIS IS NOT THEORETICAL
--
-- Checked on the live database while testing 0024: the super_admin rows are NOT
-- in the vendor's own organization. They sit inside tenant organizations, one of
-- which also has its own separate org_admin. So both halves of 0011's concern —
-- demotion via the invite form, and deletion via the roster — were reachable in
-- production, not merely permitted by the schema.
--
-- The app-layer half is fixed in src/app/admin/staff/actions.ts. This is the
-- database half, and it is the one that holds when somebody calls PostgREST
-- directly with their own JWT.
--
-- ON THE auth.uid() ESCAPE HATCH
--
-- Kept, deliberately, though it is the pattern 0022 had to clean up elsewhere.
-- The difference is that this is a TRIGGER: nothing reaches it that has not
-- already passed RLS, so `anon` cannot use it as an entry point the way a
-- directly-callable RPC could. Changing the philosophy of this function inside
-- a security fix would be a bigger change than the fix.
--
-- Safe to run twice.

begin;

create or replace function public.guard_employee_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role employee_role;
  -- DELETE has no NEW, INSERT has no OLD. One variable so every return path
  -- below hands back the right record without repeating the branch.
  outcome     employees;
begin
  outcome := case when tg_op = 'DELETE' then old else new end;

  -- No JWT means the SQL editor, a migration, or the service role. Trusted by
  -- definition, and it is how the first super_admin has to be created.
  if auth.uid() is null then
    return outcome;
  end if;

  select role into caller_role from public.current_employee();

  if caller_role = 'super_admin' then
    return outcome;
  end if;

  if tg_op = 'DELETE' then
    -- Deleting a super_admin's employees row strips their platform access just
    -- as effectively as demoting them, and 0011 only ever blocked the demote.
    if old.role = 'super_admin' then
      raise exception
        'Only platform administrators can remove a super_admin'
        using errcode = '42501';
    end if;

    return old;
  end if;

  -- ── INSERT and UPDATE: unchanged from 0011 ──────────────────────────────

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
  before insert or update or delete on employees
  for each row execute function public.guard_employee_role();

-- 0022 revoked EXECUTE on this function from public, anon and authenticated.
-- CREATE OR REPLACE preserves the existing ACL, so it stays revoked — but the
-- trigger still fires, because Postgres checks EXECUTE at CREATE TRIGGER time
-- and not when the trigger runs.

commit;

notify pgrst, 'reload schema';
