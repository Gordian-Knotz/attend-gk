-- Closes the write-integrity holes found by the 10 Aug 2026 security review.
--
-- WHY THIS EXISTS
--
-- 0007 moved the geofence into a BEFORE INSERT trigger so that every write
-- path — the server action, PowerSync, the future Expo app, the biometric
-- webhook bridge — is covered by one rule. The trigger itself is correct.
-- The RLS policy underneath it was not.
--
-- From 0001, unchanged until now:
--
--   create policy "attendance: self insert" on attendance_events for insert
--     with check (employee_id = auth.uid());
--
-- `source`, `site_id` and `org_id` were all client-supplied and
-- unconstrained, and two of them are exactly what the trigger branches on:
--
--   source = 'biometric' | 'manual'  → trigger's exempt branch, geofence skipped
--   site_id = null                   → "nothing to measure against", skipped
--   org_id  = someone else's         → never examined; punch lands in their org
--
-- So any signed-in user who can reach PostgREST could write an out-of-fence
-- punch by setting one field. This is the same class of bug as v1's
-- ("the check is on org_id only, nothing constrains staff_id"), mirrored:
-- the check was on employee_id only, and nothing constrained the three
-- fields the enforcement path depends on.
--
-- The review found the same shape on three more policies, all fixed here.
--
-- ── SAFE TO RUN TWICE ───────────────────────────────────────────────────
--
-- Every statement in this file is idempotent, and that is a requirement,
-- not a nicety — an earlier sketch of this migration was applied by hand
-- before the file existed, so the first "real" run is already a re-run.
--
--   policies      drop … if exists, then create
--   functions     create or replace
--   trigger       drop … if exists, then create
--   column        add column if not exists
--   index         create … if not exists
--   constraints   drop … if exists, then add — with the existing rows
--                 normalised first, because `add constraint` validates
--                 what is already in the table and would otherwise abort
--                 the whole migration on legacy data
--
-- Running it a second time is a no-op. Running it against a database that
-- has only 0001–0007 brings it fully up to date.

-- ── Helper: an employee's site, without tripping RLS recursion ───────────
--
-- The manager-scoped policies below need "is this row's employee at my
-- site?". Reading `employees` directly from inside a policy would recurse
-- into that table's own RLS, so this follows the SECURITY DEFINER pattern
-- 0001 already established with current_employee().

create or replace function public.employee_site_id(p_employee uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select site_id from employees where id = p_employee
$$;

grant execute on function public.employee_site_id(uuid) to authenticated;

-- ── 1. attendance_events: staff may only punch as themselves, at their
--       own site, in their own org, from a GPS-bearing source ────────────
--
-- 'manual' and 'biometric' are deliberately excluded here. They remain
-- writable through "attendance: admins manage org" (0003) and by the
-- service role, which is where the webhook bridge will live. That is the
-- whole point: the trigger's exemptions are legitimate, but they must not
-- be selectable by the least trustworthy party.

drop policy if exists "attendance: self insert" on attendance_events;
create policy "attendance: self insert" on attendance_events for insert
  with check (
    employee_id = auth.uid()
    and org_id  = (select org_id from public.current_employee())
    -- must match the caller's assigned site exactly; `is not distinct
    -- from` so an unassigned employee can't smuggle in an arbitrary site
    and site_id is not distinct from (select site_id from public.current_employee())
    and source in ('mobile', 'kiosk_qr')
  );

-- ── 1b. Idempotency key for the offline queue ───────────────────────────
--
-- The offline queue replays punches when connectivity returns. If the
-- request succeeds but the response is lost — the common case on a flaky
-- link — the item stays queued and is sent again, and the ledger gains a
-- duplicate punch that nothing downstream can distinguish from a real one.
--
-- The client now stamps each queued punch with a UUID at the moment it is
-- taken, so a replay collides here instead of inserting twice. Partial
-- index because rows written by other paths (admin corrections, the future
-- webhook bridge) legitimately have no client id, and NULLs must not
-- collide with each other.

alter table attendance_events add column if not exists client_event_id uuid;

-- If a previous partial run left duplicates behind, the unique index would
-- fail and take the rest of the migration with it. Keep the earliest row's
-- id and null the rest: they are duplicates by definition, so the key is
-- the thing to discard, not the punch.
update attendance_events e
set client_event_id = null
where client_event_id is not null
  and exists (
    select 1 from attendance_events earlier
    where earlier.client_event_id = e.client_event_id
      and (earlier.created_at, earlier.id) < (e.created_at, e.id)
  );

create unique index if not exists attendance_events_client_event_id_key
  on attendance_events (client_event_id)
  where client_event_id is not null;

-- ── 2. leave_requests: no self-approval, no cross-org filing ────────────
--
-- Found by the same review, and independent of the geofence. 0001's insert
-- policy checked only employee_id, and `status` had no constraint at all,
-- so a staff user could POST a leave request with status = 'approved'
-- directly to PostgREST. /admin counts `status = 'approved'` rows as
-- on-leave rather than absent, so this was a second, complete
-- attendance-fraud path that never touches the geofence.

drop policy if exists "leave: self insert" on leave_requests;
create policy "leave: self insert" on leave_requests for insert
  with check (
    employee_id = auth.uid()
    and org_id  = (select org_id from public.current_employee())
    and status  = 'pending'
  );

-- Defence in depth: even a service-role or admin write can't invent a
-- status or a leave type the app doesn't understand.
--
-- Existing rows are normalised BEFORE the constraint is added. `status` and
-- `leave_type` were both unconstrained free text until now, so a live
-- database can legitimately contain values these lists don't cover — and
-- `add constraint` validates existing rows, so it would abort the whole
-- migration. Anything unrecognised is parked on a safe default rather than
-- deleted; a leave request is somebody's time off, not scratch data.

update leave_requests
set status = lower(trim(status))
where status is distinct from lower(trim(status));

update leave_requests
set status = 'pending'
where status not in ('pending', 'approved', 'rejected', 'cancelled');

update leave_requests
set leave_type = lower(trim(leave_type))
where leave_type is distinct from lower(trim(leave_type));

update leave_requests
set leave_type = 'annual'
where leave_type not in ('annual', 'sick', 'compassionate', 'unpaid');

alter table leave_requests drop constraint if exists leave_requests_status_check;
alter table leave_requests add constraint leave_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'cancelled'));

alter table leave_requests drop constraint if exists leave_requests_type_check;
alter table leave_requests add constraint leave_requests_type_check
  check (leave_type in ('annual', 'sick', 'compassionate', 'unpaid'));

-- ── 3. biometric_devices: webhook secrets are not roster-wide ───────────
--
-- 0001 scoped this policy by org only, with no role check, so every
-- employee in the org — including plain staff — could read
-- `webhook_secret` straight off PostgREST. Those secrets authenticate a
-- fixed terminal, and 'biometric' is precisely the geofence-exempt source
-- in 0007, so this chained directly into forged, unfenced attendance.
--
-- 08's note that the PowerSync publication deliberately excludes this
-- table was true of the publication and irrelevant to PostgREST.

drop policy if exists "devices: select in org" on biometric_devices;
create policy "devices: select in org" on biometric_devices for select
  using (
    (select role from public.current_employee()) = 'super_admin'
    or (
      org_id = (select org_id from public.current_employee())
      and (select role from public.current_employee()) = 'org_admin'
    )
  );

-- ── 4. attendance_summary / leave_requests: reads follow the four-tier
--       pattern 0001's own header describes ───────────────────────────────
--
-- Both said "your own row, or anything in your org", which let plain staff
-- read every colleague's leave history and hours. 0001's stated model is
-- staff → self, manager → their site, org_admin → their org,
-- super_admin → everything. These now implement it.

drop policy if exists "summary: select in org" on attendance_summary;
create policy "summary: select in org" on attendance_summary for select
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

drop policy if exists "leave: select own or org" on leave_requests;
create policy "leave: select own or org" on leave_requests for select
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

-- ── 5. The trigger's null-site branch becomes a rejection ───────────────
--
-- 0007 returned NEW unchanged when site_id was null ("unassigned staff:
-- nothing to measure against"). With policy 1 above a staff client can no
-- longer choose that branch, but the branch itself was still a silent
-- bypass for any other write path. An assigned employee always has a site;
-- a GPS-bearing punch without one is a misconfiguration, not an exemption.

create or replace function public.enforce_attendance_geofence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  site_row   sites%rowtype;
  distance   double precision;
begin
  -- 'manual' is an admin correction made from the dashboard, and
  -- 'biometric' comes from a fixed terminal that is by definition at the
  -- site. Neither carries GPS, so neither is geofenced. As of 0008 neither
  -- is reachable from a staff client either — see policy 1 above.
  if new.source in ('manual', 'biometric') then
    return new;
  end if;

  if new.site_id is null then
    raise exception
      'Check-in rejected: your account is not assigned to a site. Ask an administrator to assign one.'
      using errcode = '23514';
  end if;

  select * into site_row from sites where id = new.site_id;

  if not found then
    raise exception
      'Check-in rejected: site % no longer exists', new.site_id
      using errcode = '23514';
  end if;

  if new.gps_lat is null or new.gps_lng is null then
    raise exception
      'Location required for a % check-in at %', new.source, site_row.name
      using errcode = '23514';
  end if;

  if site_row.geofence_lat is null
     or site_row.geofence_lng is null
     or site_row.geofence_radius_m is null then
    raise exception
      'Check-in rejected: % has no geofence configured', site_row.name
      using errcode = '23514';
  end if;

  distance := public.geo_distance_m(
    site_row.geofence_lat, site_row.geofence_lng, new.gps_lat, new.gps_lng
  );

  -- Recomputed, never trusted from the client — distance_m is an audit
  -- field and a spoofed value would make the log lie about itself.
  new.distance_m := distance;

  if distance > site_row.geofence_radius_m then
    raise exception
      'Check-in rejected: % m from %, outside the % m geofence',
      round(distance)::int, site_row.name, site_row.geofence_radius_m
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- errcode 23514 (check_violation) throughout, deliberately: SupabaseConnector
-- treats it as permanently rejected and drops the queued write instead of
-- retrying forever. A punch that failed any of these checks will never
-- become valid, and retrying it would wedge every later punch behind it.

drop trigger if exists attendance_geofence on attendance_events;
create trigger attendance_geofence
  before insert on attendance_events
  for each row execute function public.enforce_attendance_geofence();

-- ── Tell PostgREST about the new column and function ────────────────────
--
-- PostgREST serves from a cached schema and does not notice DDL on its own.
-- Without this, `client_event_id` and `employee_site_id()` exist in the
-- database but return 404 through the API until the cache happens to
-- refresh — which looks exactly like the migration not having run, and
-- wasted time on 10 Aug for precisely that reason.
notify pgrst, 'reload schema';
