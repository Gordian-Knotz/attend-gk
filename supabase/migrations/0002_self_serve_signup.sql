-- Self-serve signup support.
--
-- Problem: the RLS policies in 0001 require the caller to already be an
-- org_admin of an org to insert organizations/sites/employees rows — which
-- is correct for an *existing* org managing its roster, but leaves no way
-- for a brand new signup (no employees row yet) to create their own
-- organization. This RPC is the one deliberate exception: it lets an
-- authenticated user with NO existing employees row create exactly one
-- org, one default site, and one employees row for themselves as
-- org_admin — nothing else.

create or replace function public.create_organization_for_self(
  org_name text,
  site_name text default 'Head Office',
  site_lat double precision default -1.2833,
  site_lng double precision default 36.8167,
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

  v_slug := lower(regexp_replace(trim(org_name), '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || substr(md5(random()::text), 1, 6);

  insert into organizations (name, slug, plan_tier, billing_status)
  values (org_name, v_slug, 'starter', 'trialing')
  returning id into v_org_id;

  insert into sites (org_id, name, geofence_lat, geofence_lng, geofence_radius_m)
  values (v_org_id, site_name, site_lat, site_lng, site_radius_m)
  returning id into v_site_id;

  insert into employees (id, org_id, site_id, full_name, role)
  values (
    auth.uid(),
    v_org_id,
    v_site_id,
    coalesce((select email from auth.users where id = auth.uid()), 'Admin'),
    'org_admin'
  );

  return query select v_org_id, v_site_id;
end;
$$;

grant execute on function public.create_organization_for_self(text, text, double precision, double precision, integer)
  to authenticated;
