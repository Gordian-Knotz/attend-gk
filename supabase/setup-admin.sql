-- Promotes one existing account to org_admin of the demo org
-- ("Alpha Pride Security" — the one scripts/seed-demo-data.mjs populates),
-- so signing in immediately shows the fully populated dashboard. Safe to
-- re-run.
--
-- ── EDIT THESE TWO LINES BEFORE RUNNING ─────────────────────────────────
-- They are the only things you need to change. They are intentionally
-- placeholders: this file is committed, and a real address in version
-- control is personal data that leaks into every clone and fork.
--
--   v_admin_email → the address you signed up with
--   v_admin_name  → how the name should read in the roster
--
-- Prerequisite: sign up with that email first via /login → "Sign up".
-- Signing up alone will route you to /onboarding to create your own
-- (empty) organization — ignore that for now, or create one and delete it
-- later. This script overrides your org/site/role to point at the demo
-- org instead, regardless of what /onboarding set.
--
-- Run in the Supabase SQL editor, after every migration in
-- supabase/migrations/ has been applied and after supabase/seed.sql has
-- run at least once.

do $$
declare
  v_admin_email constant text := 'you@example.com';
  v_admin_name  constant text := 'Your Name';

  v_org_id  uuid;
  v_site_id uuid;
  v_user_id uuid;
begin
  if v_admin_email = 'you@example.com'
     or v_admin_name = 'Your Name' then
    raise exception
      'Edit v_admin_email and v_admin_name at the top of this script first.';
  end if;

  select id into v_user_id from auth.users where email = v_admin_email;

  if v_user_id is null then
    raise exception
      'No auth user found for % yet — sign up via /login first, then re-run this script.',
      v_admin_email;
  end if;

  select id into v_org_id from organizations where slug = 'alpha-pride-security';

  if v_org_id is null then
    raise exception
      'Demo org not found — run supabase/seed.sql first.';
  end if;

  -- default to the first seeded site; change if you'd rather this account
  -- sit at a different one.
  select id into v_site_id from sites where org_id = v_org_id order by created_at asc limit 1;

  if v_site_id is null then
    raise exception
      'Demo org has no sites — run supabase/seed.sql first.';
  end if;

  if exists (select 1 from employees where id = v_user_id) then
    update employees
    set role = 'org_admin', org_id = v_org_id, site_id = v_site_id, full_name = v_admin_name
    where id = v_user_id;
    raise notice 'Updated existing employee row to org_admin on Alpha Pride Security.';
  else
    insert into employees (id, org_id, site_id, full_name, role)
    values (v_user_id, v_org_id, v_site_id, v_admin_name, 'org_admin');
    raise notice 'Created org_admin employee row on Alpha Pride Security.';
  end if;
end $$;
