-- 0022 — Stop the internet calling our SECURITY DEFINER functions.
--
-- WHY THIS EXISTS
--
-- Every function in `public` is executable by PUBLIC in Postgres by default,
-- and Supabase exposes `public` over PostgREST at /rest/v1/rpc/<name>. So
-- fourteen SECURITY DEFINER functions — which run as their owner and bypass
-- RLS entirely — were callable by `anon`, using the anon key that is inlined
-- in the client bundle. Supabase's own advisor flags all fourteen.
--
-- One of them was straightforwardly exploitable:
--
--   purge_contact_requests(p_retention interval)
--
-- Its guard reads:
--
--   if auth.uid() is not null
--      and (select role from current_employee()) is distinct from 'super_admin'
--   then raise exception ...
--
-- The guard only fires when auth.uid() is NOT NULL. For an anonymous caller
-- auth.uid() IS null, so the conjunction is false, no exception is raised, and
-- execution falls through to the DELETE. Anyone on the internet could POST
-- {"p_retention": "0 seconds"} and empty contact_requests — and the function
-- returns the row count, so they would know it worked.
--
-- THE PATTERN, because this is its third appearance
--
-- "auth.uid() is null means a trusted internal caller" is used in
-- guard_employee_role (0011), enforce_leave_decision (0016) and here. It is
-- sound for the service role and the SQL editor. It is wrong for `anon`,
-- which also has no auth.uid() and is everybody. In 0011 and 0016 the
-- functions are triggers, so only a write that already passed RLS reaches
-- them. purge_contact_requests is a directly-callable RPC with nothing in
-- front of it. The lesson is not "fix the guard" — it is that an RPC nobody
-- should call should not be callable.
--
-- recompute_attendance_summary_for has no authorization check at all, and
-- takes org_id as a parameter. attendance_summary is unique (employee_id,
-- date), so a valid employee id with another org's id overwrites that row's
-- org_id — and since RLS on that table scopes by org_id, the row moves to the
-- wrong tenant. Gated only by UUID unguessability, which is not a control.
--
-- WHAT IS DELIBERATELY *NOT* REVOKED, AND WHY
--
-- Five functions keep their grants, and revoking them would break the
-- application. This is the important half of this migration:
--
--   current_employee()            referenced by 40 RLS policies
--   employee_org_id(uuid)         referenced by 31
--   employee_site_id(uuid)        referenced by 11
--
-- RLS policies are evaluated AS THE QUERYING USER, so the querying user needs
-- EXECUTE on any function a policy calls. 0001 grants current_employee() to
-- authenticated for exactly this reason. Revoking it would deny every
-- authenticated read in the product — a total outage, not a hardening.
--
-- They stay granted to `anon` too, and that is also deliberate: policies on
-- contact_requests reference current_employee(), and an anon SELECT there
-- would raise a permission error instead of returning no rows. A 500 where a
-- clean empty result belongs is a regression, and anon gains nothing from the
-- function — it has no employee row, so it gets NULL.
--
--   create_organization_for_self(...)   called by /onboarding
--   ensure_leave_entitlements(integer)  called by /admin/settings
--
-- These two are the only RPCs the application actually invokes (verified:
-- exactly two `.rpc(` call sites in src/). Both already fail closed without a
-- session — ensure_leave_entitlements raises when auth.uid() is null, which is
-- what purge_contact_requests should have done.
--
-- REVOKE MUST NAME `public`, OR IT DOES NOTHING
--
-- Postgres grants EXECUTE on every function to the PUBLIC pseudo-role by
-- default. `revoke execute ... from anon, authenticated` removes only DIRECT
-- grants, and both roles keep inheriting EXECUTE through PUBLIC — so the
-- first version of this migration ran without error and changed nothing.
-- has_function_privilege('anon', ...) still returned true afterwards. If you
-- edit this file, keep `public` in every revoke list.
--
-- TRIGGER FUNCTIONS ARE SAFE TO REVOKE — TESTED, NOT ASSUMED
--
-- Postgres checks EXECUTE on a trigger function at CREATE TRIGGER time, not
-- when the trigger fires; at fire time the executor invokes it internally.
-- Verified on this database with a throwaway table and trigger, inside a
-- rolled-back transaction: with EXECUTE revoked from `authenticated`,
-- has_function_privilege returned false and the trigger still fired. Worth
-- having tested, because being wrong here would stop every clock-in,
-- role change and leave decision in the product.
--
-- Safe to run twice.

begin;

-- ── Trigger functions: never called directly, by anyone ──────────────────

revoke execute on function public.attendance_events_recompute_summary_trg() from public, anon, authenticated;
revoke execute on function public.enforce_attendance_geofence()            from public, anon, authenticated;
revoke execute on function public.enforce_billing_payment_decision()       from public, anon, authenticated;
revoke execute on function public.enforce_leave_decision()                 from public, anon, authenticated;
revoke execute on function public.guard_employee_role()                    from public, anon, authenticated;
revoke execute on function public.guard_organization_columns()             from public, anon, authenticated;

-- ── Maintenance routines: operator-only, never client-callable ───────────

revoke execute on function public.purge_contact_requests(interval)                      from public, anon, authenticated;
revoke execute on function public.recompute_attendance_summary_for(uuid, uuid, date)     from public, anon, authenticated;
revoke execute on function public.rls_auto_enable()                                     from public, anon, authenticated;

comment on function public.purge_contact_requests(interval) is
  'Operator-only retention purge. EXECUTE revoked from anon and authenticated in 0022: its auth.uid()-is-null escape hatch let anonymous callers delete rows. Run as postgres, or schedule with pg_cron. Do not re-grant.';

comment on function public.recompute_attendance_summary_for(uuid, uuid, date) is
  'Called by attendance_events_recompute_summary_trg. EXECUTE revoked from anon and authenticated in 0022: it has no authorization check and takes org_id as a parameter, so a direct call could move a summary row to another tenant.';

commit;

-- PostgREST caches the schema, including which RPCs it will expose.
notify pgrst, 'reload schema';
