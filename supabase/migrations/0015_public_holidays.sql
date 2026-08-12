-- 0015_public_holidays.sql
--
-- Public holidays, and the reversal of a decision.
--
-- The leave-entitlements spec decided that a leave day is a calendar day,
-- weekends AND public holidays included, because this product's tenants are
-- security firms, logistics and retail, where weekend and holiday work is
-- normal. On 12 Aug 2026 the product owner reversed the holiday half of that:
-- holidays no longer count against a balance. Weekends still do — only the
-- holiday rule changed, and the weekend reasoning stands untouched.
--
-- READ THIS BEFORE APPLYING. Balances are computed live from leave_requests and
-- are never stored, so there is no days_taken column to freeze. The moment rows
-- exist in this table, EVERY HISTORICAL BALANCE RECOMPUTES. A request for
-- 12-16 August previously charged as 5 days becomes 4 if one of those days is a
-- holiday. That is not a bug and there is no grandfather option to offer; it
-- follows from having exactly one implementation of the number, which is
-- deliberate.
--
-- The movement is always in the employee's favour: days come back, never get
-- taken away. Applying this migration is therefore safe, but it is the event
-- that shifts the numbers, so do it deliberately rather than let a tenant
-- discover it.

begin;

create table if not exists public_holidays (
  id         uuid primary key default gen_random_uuid(),
  -- null means a NATIONAL holiday, visible to every tenant. A non-null org_id
  -- is that tenant's own addition: a company day, or one of the ad-hoc days a
  -- Kenyan president may gazette at short notice.
  org_id     uuid references organizations(id) on delete cascade,
  holiday    date not null,
  name       text not null,
  created_at timestamptz not null default now(),

  -- `nulls not distinct` is load-bearing. By default Postgres treats every
  -- (null, date) pair as distinct, so the same national holiday could be
  -- inserted over and over and each row would deduct a day.
  unique nulls not distinct (org_id, holiday)
);

-- The lookup is always "this org's holidays plus the national ones", filtered
-- by date range. Leading with holiday suits that better than leading with a
-- column that is null for most rows.
create index if not exists public_holidays_date_idx
  on public_holidays (holiday);

alter table public_holidays enable row level security;

-- Read: anyone signed in sees national rows plus their own org's. Deliberately
-- not restricted further — a holiday calendar is not sensitive, and staff need
-- it to understand why a request costs what it does.
drop policy if exists "public holidays: read national and own org" on public_holidays;
create policy "public holidays: read national and own org"
  on public_holidays for select
  using (
    org_id is null
    or org_id = (select org_id from public.current_employee())
  );

-- Write, org rows: an org_admin manages their own organization's additions and
-- cannot touch another tenant's. `with check` as well as `using`, or an admin
-- could UPDATE a row's org_id and move it to someone else's tenant — the same
-- shape as the cross-tenant hole found in 0014 before it ran.
drop policy if exists "public holidays: admins manage their org" on public_holidays;
create policy "public holidays: admins manage their org"
  on public_holidays for all
  using (
    org_id is not null
    and org_id = (select org_id from public.current_employee())
    and (select role from public.current_employee()) in ('org_admin', 'super_admin')
  )
  with check (
    org_id is not null
    and org_id = (select org_id from public.current_employee())
    and (select role from public.current_employee()) in ('org_admin', 'super_admin')
  );

-- Write, national rows: vendor only. An org_admin must not be able to add a
-- national holiday, because it would deduct a day from every other tenant's
-- balances.
drop policy if exists "public holidays: super admin manages national" on public_holidays;
create policy "public holidays: super admin manages national"
  on public_holidays for all
  using (
    org_id is null
    and (select role from public.current_employee()) = 'super_admin'
  )
  with check (
    org_id is null
    and (select role from public.current_employee()) = 'super_admin'
  );

-- Kenyan public holidays for 2026, seeded as national rows.
--
-- Treat this as a best-known list an admin can correct, not as authoritative:
--
--  * The two Eids are declared by moon sighting and the dates below are
--    estimates. They will need correcting each year.
--  * Kenya observes the following Monday when a holiday falls on a Sunday.
--    That rule is NOT modelled here — it would mean generating rows rather than
--    listing them, and getting it silently wrong is worse than an admin adding
--    one row. None of the 2026 dates below fall on a Sunday.
--  * Boxing Day is Utamaduni Day and Moi Day is Huduma Day, both renamed in
--    2021. The old names are wrong on a Kenyan payslip.
insert into public_holidays (org_id, holiday, name) values
  (null, date '2026-01-01', 'New Year''s Day'),
  (null, date '2026-03-20', 'Eid al-Fitr (estimated — confirm by sighting)'),
  (null, date '2026-04-03', 'Good Friday'),
  (null, date '2026-04-06', 'Easter Monday'),
  (null, date '2026-05-01', 'Labour Day'),
  (null, date '2026-05-27', 'Eid al-Adha (estimated — confirm by sighting)'),
  (null, date '2026-06-01', 'Madaraka Day'),
  (null, date '2026-10-10', 'Huduma Day'),
  (null, date '2026-10-20', 'Mashujaa Day'),
  (null, date '2026-12-12', 'Jamhuri Day'),
  (null, date '2026-12-25', 'Christmas Day'),
  (null, date '2026-12-26', 'Utamaduni Day')
on conflict do nothing;

commit;

-- PostgREST caches the schema; without this the new table 404s until the API
-- restarts.
notify pgrst, 'reload schema';
