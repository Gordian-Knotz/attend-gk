-- Closes three gaps found by the 11 Aug 2026 SQL review of 0008–0010.
--
-- WHY THIS EXISTS
--
-- 1. `public.employee_site_id(uuid)` (0008) is SECURITY DEFINER and granted
--    to `authenticated` so it can read `employees` without recursing into
--    that table's own RLS. It takes an arbitrary employee id and returns
--    that employee's `site_id` with no scoping at all. Any signed-in user
--    can call it over RPC —
--
--      select employee_site_id('<a colleague's or another tenant's id>')
--
--    — and learn which site that person is assigned to, including people in
--    organizations the caller has no relationship with. It needs the same
--    org scoping every other cross-employee lookup in this schema has.
--
-- 2. `public.guard_organization_columns()` (0010) has no unauthenticated
--    escape hatch. 0011's equivalent trigger (`guard_employee_role`) opens
--    with `if auth.uid() is null then return new; end if;` — the SQL
--    editor, a migration, and the service role carry no JWT, so without
--    that branch `current_employee()` resolves to nothing and the trigger
--    is liable to reject their writes. That is the only way the first
--    `super_admin` can exist, and it is what lets
--    `scripts/seed-demo-data.mjs` write `organizations` rows at all. 0010
--    shipped without it; this adds it, matching 0011 exactly.
--
-- 3. `contact_requests` (0009) is the only anon-writable table in the
--    schema and stores `source_ip` alongside a name, email, phone and free
--    text — personal data belonging to people who filled in a marketing
--    form — with no delete policy and no retention. This adds a delete
--    policy for super_admin and a callable purge function, so the data has
--    both an API-based erasure path and a way to age out on its own.
--
-- ── SAFE TO RUN TWICE ───────────────────────────────────────────────────
--
--   functions   create or replace (identical signatures — grants persist
--               across a replace, but this file restates them anyway so
--               the file is self-describing)
--   triggers    drop … if exists, then create
--   policies    drop … if exists, then create
--
-- Running it a second time is a no-op.

-- ── 1. employee_site_id: scope the lookup to the caller's own org ──────
--
-- Same signature, return type, language, SECURITY DEFINER property and
-- search_path as 0008. The only change is the added `org_id` filter, which
-- uses the same `current_employee()` helper every other policy in this
-- schema already relies on to find "who is calling, and what org are they
-- in". An employee id outside the caller's org now matches no row and the
-- function returns null, exactly like an employee id that doesn't exist.
--
-- Callers: this function is used by two SELECT policies added in 0008 —
-- "summary: select in org" (attendance_summary) and "leave: select own or
-- org" (leave_requests) — both in the manager tier, both already gated by
-- `org_id = (select org_id from public.current_employee())` on the row
-- itself before employee_site_id() is ever reached. A manager can only
-- reach this branch for a row whose org_id already matches their own, and
-- a well-formed employee row's org_id matches the org of every row it
-- owns, so the added filter changes nothing for a legitimate manager: it
-- only removes the ability to resolve a site for an employee outside the
-- caller's org, which was never a case the policy needed to succeed on.
-- No INSERT policy in this schema calls employee_site_id() — "attendance:
-- self insert" (0008) checks the caller's own site via current_employee()
-- directly — so attendance write paths are unaffected by this change.

create or replace function public.employee_site_id(p_employee uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select site_id
  from employees
  where id = p_employee
    and org_id = (select org_id from public.current_employee())
$$;

grant execute on function public.employee_site_id(uuid) to authenticated;

-- ── 2. guard_organization_columns: add the unauthenticated escape hatch ─
--
-- Identical to 0010's version except for the new early return, placed
-- before current_employee() is consulted at all — matching 0011's
-- `guard_employee_role` word for word in reasoning. The super_admin bypass
-- and the per-column restrictions for authenticated non-admins are
-- unchanged.

create or replace function public.guard_organization_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No JWT means this is the SQL editor, a migration, or the service role.
  -- Those are trusted by definition, and it is how the first organization
  -- and its first super_admin ever get written — see README, "Becoming a
  -- super admin", and scripts/seed-demo-data.mjs.
  if auth.uid() is null then
    return new;
  end if;

  if (select role from public.current_employee()) = 'super_admin' then
    return new;
  end if;

  -- Anyone else may rename their organization and nothing more.
  if new.plan_tier      is distinct from old.plan_tier
     or new.billing_status  is distinct from old.billing_status
     or new.suspended_at    is distinct from old.suspended_at
     or new.suspended_reason is distinct from old.suspended_reason
     or new.slug            is distinct from old.slug
  then
    raise exception
      'Only platform administrators can change plan, billing or suspension'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists organizations_guard_columns on organizations;
create trigger organizations_guard_columns
  before update on organizations
  for each row execute function public.guard_organization_columns();

-- ── 3. contact_requests: a delete path and a retention purge ───────────
--
-- 0009 gave super_admin select and update on this table but no delete, so
-- there was no way — via the API or otherwise — to honour an erasure
-- request or to age the data out. Two additions: a delete policy that
-- follows the table's existing "super admin reads / manages" convention,
-- and a purge function for bulk retention cleanup.
--
-- Retention: 12 months. These are sales enquiries, not account data — once
-- a lead has gone cold for a year it no longer has operational value to
-- PAC, and 12 months is long enough to cover any plausible sales cycle for
-- a workforce-attendance contract (procurement, pilot, renewal-of-interest
-- follow-up) while still giving `source_ip` and contact details a bounded
-- lifetime. Rows the sales team is actively working stay under a year old
-- by definition of being active; anything older is stale by the same
-- measure. Expressed below as the function's default argument so it is
-- visible at the call site and overridable without a new migration.

-- ── Delete: super_admin only, same convention as select/update above ────

drop policy if exists "contact: super admin deletes" on contact_requests;
create policy "contact: super admin deletes" on contact_requests for delete
  using ((select role from public.current_employee()) = 'super_admin');

-- ── Purge: callable, restricted to super_admin, retention explicit ──────
--
-- SECURITY DEFINER so it can delete regardless of who calls it — the
-- restriction to super_admin is enforced in the function body instead of
-- by RLS, the same shift 0010 and 0011 made for per-column and per-value
-- rules RLS cannot express. The auth.uid() is null branch mirrors
-- guard_employee_role (0011) and the fix above: a service-role or
-- SQL-editor caller — which is what a pg_cron job or a manual cleanup run
-- would be — carries no JWT and is trusted by definition. A caller who
-- *does* carry a JWT must be super_admin, so an ordinary authenticated
-- user calling this over RPC gets rejected rather than silently no-op'd.
--
-- Returns the row count so a caller (human or scheduled) has something to
-- log.

create or replace function public.purge_contact_requests(
  p_retention interval default interval '12 months'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  if auth.uid() is not null
     and (select role from public.current_employee()) is distinct from 'super_admin'
  then
    raise exception
      'Only platform administrators can purge contact requests'
      using errcode = '42501';
  end if;

  delete from contact_requests
  where created_at < now() - p_retention;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

grant execute on function public.purge_contact_requests(interval) to authenticated;

-- Not scheduled here — turning on a recurring job is the owner's call, not
-- a migration's. To run it monthly once someone decides to:
--
--   1. Enable the pg_cron extension (Database → Extensions on Supabase).
--   2. From the SQL editor, as the postgres role:
--
--        select cron.schedule(
--          'purge-contact-requests',
--          '0 3 1 * *',                          -- 03:00 on the 1st, monthly
--          $$select public.purge_contact_requests()$$
--        );
--
--   pg_cron runs scheduled jobs with no JWT, so the auth.uid() is null
--   branch above is what lets the schedule succeed.

-- ── Tell PostgREST about the new function and policy ────────────────────
--
-- PostgREST serves from a cached schema and does not notice DDL on its
-- own. Without this, purge_contact_requests() exists in the database but
-- returns 404 through the API until the cache happens to refresh — which
-- looks exactly like the migration not having run.
notify pgrst, 'reload schema';
