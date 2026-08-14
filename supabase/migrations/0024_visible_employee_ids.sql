-- 0024 — visible_employee_ids(): how far one person can see.
--
-- The read half of the hierarchy. 0023 stored a visibility scope per level and
-- deliberately did not enforce it; this function computes the set of employees
-- a caller may see, and 0025 wires it into policies.
--
-- NO POLICY CHANGES HERE, ON PURPOSE. The function ships and is verified on its
-- own first, because the next migration makes it decide what every authenticated
-- user can read. A bug here that returned an empty set would not narrow
-- anybody's access — it would lock everybody out of everything.
--
-- WHY SECURITY DEFINER
--
-- A policy on `employees` that walks `employees` recursively raises "infinite
-- recursion detected in policy for relation employees". current_employee()
-- (0001) is SECURITY DEFINER for exactly this reason and says so in its own
-- comment; employee_site_id() (0008, narrowed 0012) is the same trick. This is
-- the third instance of the pattern.
--
-- WHY STABLE
--
-- Consumed as `employee_id in (select public.visible_employee_ids())`. A STABLE
-- function in a scalar subquery is hoisted out of the per-row check and
-- evaluated once per query, which is the same reason every policy in this
-- schema writes `(select role from public.current_employee())` rather than
-- calling it bare.
--
-- THE CONTRACT — 0025's tests pin every row of this
--
--   auth.uid() is null            → nothing
--   no employees row              → nothing
--   org_level_id is null          → every employee in my org (NO narrowing)
--   level row missing             → every employee in my org (fails OPEN)
--   scope 'org'                   → every employee in my org
--   scope 'site'                  → everyone at my site, plus me
--   scope 'team'                  → me plus everyone below me in the
--                                   reports_to chain
--   scope 'self'                  → me
--
-- "org_level_id is null → everything in my org" is the single most important
-- line. Every employee that exists today has a null level, so this is what
-- keeps 0025 from changing anybody's access. It is written as an explicit
-- `is null` branch rather than left to fall out of NULL comparison semantics,
-- because a guard that silently evaluates to NULL is exactly the defect found
-- in 0014's ensure_leave_entitlements before it ever ran — the same shape,
-- pointed the other way.
--
-- Note this function only ever WIDENS toward the org. It cannot grant anything:
-- 0025 uses it in RESTRICTIVE policies, which combine with AND, so the most
-- this can do is decline to narrow. The permissive policies from 0001–0023
-- remain the only thing that grants access at all.
--
-- ON CYCLES
--
-- reports_to_employee_id can hold a cycle: 0023's check blocks self-reference
-- only, so A → B → A is insertable. The recursive term below uses UNION rather
-- than UNION ALL over a single uuid column, so a cycle revisiting an id
-- produces no new row and the recursion terminates. That is why there is no
-- CYCLE clause: it would be redundant. Do not change UNION to UNION ALL.

begin;

create or replace function public.visible_employee_ids()
returns setof uuid
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  me  employees%rowtype;
  lvl org_levels%rowtype;
begin
  if auth.uid() is null then
    return;
  end if;

  select * into me from employees where id = auth.uid();

  -- No employee row: signed in but not part of any organization. Returning
  -- nothing is right — there is nobody they are entitled to see.
  if me.id is null then
    return;
  end if;

  -- Unconfigured. Every employee alive today lands here.
  if me.org_level_id is null then
    return query select e.id from employees e where e.org_id = me.org_id;
    return;
  end if;

  select * into lvl from org_levels where id = me.org_level_id;

  -- The level disappeared from under them. Fails OPEN to the org, matching the
  -- unconfigured branch: failing closed would hide a person's own attendance
  -- record from them because of a configuration accident, and the permissive
  -- policies still bound what they can actually reach.
  if lvl.id is null then
    return query select e.id from employees e where e.org_id = me.org_id;
    return;
  end if;

  if lvl.visibility_scope = 'org' then
    return query select e.id from employees e where e.org_id = me.org_id;

  elsif lvl.visibility_scope = 'site' then
    -- An unassigned site would make `is not distinct from` match every other
    -- unassigned employee, which is not "my site" in any meaningful sense.
    -- Narrow to self in that case rather than to an accidental cohort.
    if me.site_id is null then
      return query select me.id;
    else
      return query
        select e.id from employees e
        where e.org_id = me.org_id
          and (e.site_id = me.site_id or e.id = me.id);
    end if;

  elsif lvl.visibility_scope = 'team' then
    return query
      with recursive reports as (
        select me.id as id
        union
        select e.id
        from employees e
        join reports r on e.reports_to_employee_id = r.id
        where e.org_id = me.org_id
      )
      select id from reports;

  else
    -- 'self', and the default for any scope value added later without
    -- updating this function. Narrowest branch, so a future enum value fails
    -- safe rather than granting the org.
    return query select me.id;
  end if;
end;
$$;

comment on function public.visible_employee_ids() is
  'Employees the caller may see, per their org_levels.visibility_scope. Null level means the whole org, which is what keeps 0025 from changing existing access. Consumed only in RESTRICTIVE policies, so it can never grant anything.';

-- Granted to both roles, matching current_employee() (0001). `authenticated`
-- needs it because policies are evaluated as the querying user. `anon` needs it
-- for the same reason 0022 kept current_employee() granted to anon: a policy
-- that calls a function the role cannot execute raises a permission error
-- instead of returning no rows, and a 500 where an empty result belongs is a
-- regression.
grant execute on function public.visible_employee_ids() to anon, authenticated;

commit;

notify pgrst, 'reload schema';
