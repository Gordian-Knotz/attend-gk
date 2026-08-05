-- Demo seed — run after all migrations in supabase/migrations/ (it touches
-- `notifications`, which arrives in 0006).
-- Creates one organization and one site so there's something to check into
-- during development. Doesn't create an employee row — see README for how
-- to attach your own Supabase Auth user to this org after signing up.

insert into organizations (id, name, slug, plan_tier, billing_status)
values (
  '11111111-1111-1111-1111-111111111111',
  'Alpha Pride Security',
  'alpha-pride-security',
  'growth',
  'trialing'
);

-- Nairobi CBD coordinates, 150m default radius — replace with your real
-- site coordinates once you're testing from an actual location.
insert into sites (id, org_id, name, geofence_lat, geofence_lng, geofence_radius_m)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Two Rivers Mall',
  -1.21730,
  36.87840,
  150
);

-- A couple of notices so the Overview panel isn't empty on a fresh demo.
-- Nothing writes to this table automatically yet; admins post by hand from
-- /admin → "Post notice".
insert into notifications (org_id, site_id, message, level)
values
  (
    '11111111-1111-1111-1111-111111111111',
    null,
    'Payroll cut-off moves to the 25th from this month. Get timesheets approved before then.',
    'warning'
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'Gate 2 fingerprint terminal is back online after Tuesday''s power cut.',
    'info'
  );
