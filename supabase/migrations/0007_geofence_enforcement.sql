-- Moves geofence enforcement from the application into the database.
--
-- WHY THIS EXISTS
--
-- Until now the only server-side geofence check lived in the
-- `recordAttendance` server action (src/app/dashboard/actions.ts), which
-- re-validated the client's coordinates against the site radius before
-- inserting. Section 09 requires that: client-side validation alone is
-- exactly what GPS spoofing and buddy punching defeat.
--
-- PowerSync writes don't go through that server action. Its upload path is
-- local SQLite → uploadData() → PostgREST, so the check would simply be
-- absent for any offline-queued punch — which is most of them. Putting the
-- rule in a trigger closes that hole and, usefully, makes it apply to every
-- write path at once: the server action, PowerSync, the future React
-- Native app, and the biometric webhook bridge when it's built.
--
-- The server action's own check is kept. It's now a fast-feedback
-- duplicate rather than the enforcement point — it can return a friendly
-- "you're 240m away" message instead of surfacing a raised exception.

-- ── Distance helper ──────────────────────────────────────────────────────
--
-- Haversine in plain SQL. Matches src/lib/geo.ts so the client pre-check
-- and the server enforcement agree on the number; deliberately avoids
-- PostGIS/earthdistance, consistent with 0001 keeping sites as plain
-- lat/lng columns.

create or replace function public.geo_distance_m(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
returns double precision
language sql
immutable
parallel safe
as $$
  select 2 * 6371000 * asin(
    sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lng2 - lng1) / 2), 2)
    )
  );
$$;

-- ── Enforcement trigger ──────────────────────────────────────────────────

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
  -- site. Neither carries GPS, so neither is geofenced.
  if new.source in ('manual', 'biometric') then
    return new;
  end if;

  if new.site_id is null then
    return new;  -- unassigned staff: nothing to measure against
  end if;

  select * into site_row from sites where id = new.site_id;

  if not found then
    return new;
  end if;

  if new.gps_lat is null or new.gps_lng is null then
    raise exception
      'Location required for a % check-in at %', new.source, site_row.name
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

-- errcode 23514 (check_violation) is deliberate: SupabaseConnector treats
-- it as permanently rejected and drops the queued write instead of
-- retrying forever. A punch from outside the fence will never become
-- valid, and retrying it would wedge every later punch behind it.

drop trigger if exists attendance_geofence on attendance_events;
create trigger attendance_geofence
  before insert on attendance_events
  for each row execute function public.enforce_attendance_geofence();
