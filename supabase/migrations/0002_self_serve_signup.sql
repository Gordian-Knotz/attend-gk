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
  site_radius_m integer default 150,
  -- Trailing and defaulted so existing callers keep working unchanged.
  admin_name text default null
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

  -- A blank or punctuation-only name would produce an empty slug and an
  -- organization nobody can identify in the platform list.
  if coalesce(trim(org_name), '') = '' then
    raise exception 'Organization name is required';
  end if;

  -- gen_random_uuid() rather than 6 hex chars of md5(random()): the slug
  -- column is unique, and 24 bits collides often enough to fail a signup
  -- for a reason the user can do nothing about.
  v_slug := trim(both '-' from
              lower(regexp_replace(trim(org_name), '[^a-zA-Z0-9]+', '-', 'g')))
            || '-' || replace(gen_random_uuid()::text, '-', '');

  insert into organizations (name, slug, plan_tier, billing_status)
  values (trim(org_name), v_slug, 'starter', 'trialing')
  returning id into v_org_id;

  insert into sites (org_id, name, geofence_lat, geofence_lng, geofence_radius_m)
  values (v_org_id, site_name, site_lat, site_lng, site_radius_m)
  returning id into v_site_id;

  insert into employees (id, org_id, site_id, full_name, role)
  values (
    auth.uid(),
    v_org_id,
    v_site_id,
    -- Never the email address. `employees.full_name` is shown on the
    -- roster to managers and colleagues, so defaulting it to auth.users
    -- .email published the founder's private address to everyone they
    -- later invited. Onboarding collects a real name; 'Admin' is the
    -- fallback for callers that don't pass one.
    coalesce(nullif(trim(admin_name), ''), 'Admin'),
    'org_admin'
  );

  return query select v_org_id, v_site_id;
end;
$$;

grant execute on function public.create_organization_for_self(text, text, double precision, double precision, integer)
  to authenticated;
