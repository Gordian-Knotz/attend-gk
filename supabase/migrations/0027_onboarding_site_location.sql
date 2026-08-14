-- 0027 — Repair signup, and stop inventing a location for every new tenant.
--
-- TWO BUGS, ONE FUNCTION.
--
-- 1. SIGNUP IS BROKEN IN PRODUCTION.
--
-- 0002 was edited on disk to take `admin_name`, because the RPC used to fall
-- back to auth.users.email for full_name and thereby published the founder's
-- private address to everyone they later invited. The edit was never applied.
-- The live function still has five arguments and no admin_name, while
-- src/app/onboarding/actions.ts calls it WITH admin_name, so every signup gets:
--
--   PGRST202: Could not find the function
--   public.create_organization_for_self(admin_name, org_name) in the schema cache
--
-- Nobody can create an organization. Confirmed against production by calling
-- the RPC exactly as the app does.
--
-- Editing a migration file that has already been applied is how this happened.
-- The fix is a new migration, which is also why this one DROPS the old function
-- rather than adding a sixth defaulted parameter: adding one would leave two
-- overloads resolvable by the same named arguments, and PostgREST would start
-- refusing the call as ambiguous. One signature, no overload.
--
-- 2. EVERY NEW TENANT GOT A GEOFENCE IN NAIROBI.
--
-- site_lat and site_lng defaulted to -1.2833, 36.8167 with a 150 m radius. A
-- new organization anywhere else therefore had a site its staff were never
-- inside, so the FIRST CLOCK-IN ALWAYS FAILED — and nothing on screen told
-- them why, because the geofence trigger's rejection is correct and the
-- configuration was the lie.
--
-- The defaults are removed rather than changed. There is no honest default for
-- "where is this business", and a plausible-but-wrong coordinate is worse than
-- a required field: it fails at the moment a real employee tries to clock in,
-- days later, instead of at the moment somebody could still fix it.
--
-- site_name keeps its default because 'Head Office' is a reasonable guess that
-- costs nothing when wrong. radius keeps 150 m for the same reason.

begin;

-- Dropped, not replaced: see the overload note above.
drop function if exists public.create_organization_for_self(
  text, text, double precision, double precision, integer
);

create function public.create_organization_for_self(
  org_name text,
  admin_name text,
  site_lat double precision,
  site_lng double precision,
  site_name text default 'Head Office',
  site_radius_m integer default 150
)
returns table (org_id uuid, site_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id  uuid;
  v_site_id uuid;
  v_slug    text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from employees where id = auth.uid()) then
    raise exception 'This account is already linked to an organization';
  end if;

  if coalesce(trim(org_name), '') = '' then
    raise exception 'Organization name is required';
  end if;

  if coalesce(trim(admin_name), '') = '' then
    raise exception 'Your name is required';
  end if;

  -- Validated here as well as in the server action, because this is a
  -- SECURITY DEFINER function reachable over PostgREST and the action is not
  -- the only possible caller. NaN survives a double precision cast and would
  -- make every distance comparison false, which is the 0007 trigger's
  -- fail-open shape.
  if site_lat is null or site_lng is null
     or site_lat <> site_lat or site_lng <> site_lng
     or abs(site_lat) > 90 or abs(site_lng) > 180 then
    raise exception 'A valid site location is required';
  end if;

  if site_radius_m is null or site_radius_m < 20 or site_radius_m > 10000 then
    raise exception 'Site radius must be between 20 and 10000 metres';
  end if;

  v_slug := trim(both '-' from
              lower(regexp_replace(trim(org_name), '[^a-zA-Z0-9]+', '-', 'g')))
            || '-' || replace(gen_random_uuid()::text, '-', '');

  insert into organizations (name, slug, plan_tier, billing_status)
  values (trim(org_name), v_slug, 'starter', 'trialing')
  returning id into v_org_id;

  insert into sites (org_id, name, geofence_lat, geofence_lng, geofence_radius_m)
  values (v_org_id, coalesce(nullif(trim(site_name), ''), 'Head Office'),
          site_lat, site_lng, site_radius_m)
  returning id into v_site_id;

  insert into employees (id, org_id, site_id, full_name, role)
  values (auth.uid(), v_org_id, v_site_id, trim(admin_name), 'org_admin');

  return query select v_org_id, v_site_id;
end;
$$;

-- A fresh CREATE gets EXECUTE granted to PUBLIC by default, which is what 0022
-- had to undo across nine functions. Only a signed-in user can create an
-- organization, so only `authenticated` needs it.
revoke execute on function public.create_organization_for_self(
  text, text, double precision, double precision, text, integer
) from public, anon;

grant execute on function public.create_organization_for_self(
  text, text, double precision, double precision, text, integer
) to authenticated;

comment on function public.create_organization_for_self(
  text, text, double precision, double precision, text, integer
) is
  'Self-serve signup: one org, one site, one org_admin, atomically. Location is REQUIRED — it used to default to Nairobi, which meant the first clock-in failed for every tenant based anywhere else. Do not add a defaulted parameter to this function; add a new migration that drops and recreates it, or PostgREST will see two resolvable overloads.';

commit;

notify pgrst, 'reload schema';
