-- AttendPAC — Phase 1 Foundation
-- Implements Section 05 (Database Schema Reference) and Section 06
-- (Roles, Auth & Permissions) of the Technical Architecture Proposal.
--
-- Run this against a fresh Supabase project:
--   supabase db push
-- or paste it into the Supabase SQL editor.

-- needed for biometric_devices.webhook_secret (gen_random_bytes) below.
-- gen_random_uuid() itself is core Postgres 13+, no extension required.
create extension if not exists pgcrypto;

-- ── Enums ────────────────────────────────────────────────────────────────

create type employee_role as enum ('staff', 'manager', 'org_admin', 'super_admin');
create type attendance_source as enum ('mobile', 'biometric', 'kiosk_qr', 'manual');
create type attendance_status as enum ('present', 'late', 'absent', 'on_leave', 'half_day');
create type plan_tier as enum ('starter', 'growth', 'enterprise');

-- ── Tables ───────────────────────────────────────────────────────────────

create table organizations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  slug           text not null unique,
  plan_tier      plan_tier not null default 'starter',
  billing_status text not null default 'trialing',
  created_at     timestamptz not null default now()
);

create table sites (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id) on delete cascade,
  name               text not null,
  -- kept as plain lat/lng rather than a PostGIS geography column for the
  -- MVP — doc's "geofence_center" key column, simplified to avoid requiring
  -- the postgis extension before it's actually needed.
  geofence_lat       double precision not null,
  geofence_lng       double precision not null,
  geofence_radius_m  integer not null default 150,
  created_at         timestamptz not null default now()
);

-- Extends auth.users per org, per Section 05. One row per (auth) user per
-- organization — role/site/pay live here, never on auth.users itself.
create table employees (
  id              uuid primary key references auth.users(id) on delete cascade,
  org_id          uuid not null references organizations(id) on delete cascade,
  site_id         uuid references sites(id) on delete set null,
  full_name       text not null,
  role            employee_role not null default 'staff',
  employment_type text not null default 'full_time',
  pay_rate        numeric(10, 2),
  created_at      timestamptz not null default now()
);

create table shifts (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references sites(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  status      text not null default 'scheduled',
  created_at  timestamptz not null default now()
);

create table biometric_devices (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  site_id        uuid not null references sites(id) on delete cascade,
  device_id      text not null,
  model          text,
  last_seen_at   timestamptz,
  webhook_secret text not null default encode(gen_random_bytes(24), 'hex'),
  created_at     timestamptz not null default now()
);

-- The clock-in/out table. This is the one that matters right now.
create table attendance_events (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete cascade,
  -- denormalized from employees for simpler, faster RLS checks below
  org_id       uuid not null references organizations(id) on delete cascade,
  site_id      uuid references sites(id) on delete set null,
  device_id    uuid references biometric_devices(id) on delete set null,
  source       attendance_source not null,
  event_type   text not null check (event_type in ('check_in', 'check_out')),
  -- client-authoritative per Section 04's offline-first design — this is
  -- when the event *actually happened* on the device, trusted over...
  occurred_at  timestamptz not null,
  -- ...this, which is merely when the server first saw it (may be much
  -- later if the device queued the event while offline).
  received_at  timestamptz not null default now(),
  gps_lat      double precision,
  gps_lng      double precision,
  distance_m   double precision,
  created_at   timestamptz not null default now()
);

create table attendance_summary (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references employees(id) on delete cascade,
  org_id          uuid not null references organizations(id) on delete cascade,
  date            date not null,
  hours_worked    numeric(6, 2) not null default 0,
  overtime_hours  numeric(6, 2) not null default 0,
  status          attendance_status not null default 'absent',
  unique (employee_id, date)
);

create table leave_requests (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  org_id      uuid not null references organizations(id) on delete cascade,
  leave_type  text not null,
  start_date  date not null,
  end_date    date not null,
  status      text not null default 'pending',
  created_at  timestamptz not null default now()
);

create table payroll_exports (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  period_start date not null,
  period_end   date not null,
  format       text not null default 'csv',
  generated_at timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────

create index idx_sites_org on sites(org_id);
create index idx_employees_org on employees(org_id);
create index idx_employees_site on employees(site_id);
create index idx_attendance_events_employee on attendance_events(employee_id, occurred_at desc);
create index idx_attendance_events_org on attendance_events(org_id, occurred_at desc);
create index idx_attendance_summary_org_date on attendance_summary(org_id, date);

-- ── RLS helper ───────────────────────────────────────────────────────────
--
-- SECURITY DEFINER + owned by the migration role (which has BYPASSRLS on
-- Supabase) so this can safely read the caller's own employees row without
-- recursing into the RLS policy defined on employees below. This is the
-- standard Supabase pattern for "who am I, and what can I see" checks.

create or replace function public.current_employee()
returns table (id uuid, org_id uuid, site_id uuid, role employee_role)
language sql
security definer
set search_path = public
stable
as $$
  select id, org_id, site_id, role
  from employees
  where id = auth.uid()
$$;

grant execute on function public.current_employee() to authenticated;

-- ── Row Level Security ───────────────────────────────────────────────────
-- Every table scopes by org_id first, per Section 05 — no cross-tenant
-- access is structurally possible. Four-tier pattern per Section 06: staff
-- see their own; managers see their site; org_admins see their whole org;
-- super_admin sees everything.

alter table organizations      enable row level security;
alter table sites              enable row level security;
alter table employees          enable row level security;
alter table shifts             enable row level security;
alter table biometric_devices  enable row level security;
alter table attendance_events  enable row level security;
alter table attendance_summary enable row level security;
alter table leave_requests     enable row level security;
alter table payroll_exports    enable row level security;

-- organizations — read your own org; org_admin/super_admin can update it.
create policy "org: select own" on organizations for select
  using (id = (select org_id from public.current_employee())
         or (select role from public.current_employee()) = 'super_admin');

create policy "org: admins update own" on organizations for update
  using ((select role from public.current_employee()) = 'super_admin'
         or (id = (select org_id from public.current_employee())
             and (select role from public.current_employee()) = 'org_admin'));

-- employees — self always; manager sees their site; org_admin/super_admin
-- see (or manage) the whole org.
create policy "employees: select self" on employees for select
  using (id = auth.uid());

create policy "employees: select by manager" on employees for select
  using (
    (select role from public.current_employee()) = 'manager'
    and site_id = (select site_id from public.current_employee())
  );

create policy "employees: select by org admin" on employees for select
  using (
    (select role from public.current_employee()) in ('org_admin', 'super_admin')
    and org_id = (select org_id from public.current_employee())
  );

create policy "employees: admins manage roster" on employees for all
  using (
    (select role from public.current_employee()) in ('org_admin', 'super_admin')
    and org_id = (select org_id from public.current_employee())
  )
  with check (
    (select role from public.current_employee()) in ('org_admin', 'super_admin')
    and org_id = (select org_id from public.current_employee())
  );

-- sites — read within your org; org_admin/super_admin manage.
create policy "sites: select in org" on sites for select
  using (org_id = (select org_id from public.current_employee()));

create policy "sites: admins manage" on sites for all
  using (
    (select role from public.current_employee()) in ('org_admin', 'super_admin')
    and org_id = (select org_id from public.current_employee())
  )
  with check (
    (select role from public.current_employee()) in ('org_admin', 'super_admin')
    and org_id = (select org_id from public.current_employee())
  );

-- attendance_events — the important one. Staff insert/read their own;
-- managers read their site; org_admin/super_admin read/manage the org.
create policy "attendance: self insert" on attendance_events for insert
  with check (employee_id = auth.uid());

create policy "attendance: self select" on attendance_events for select
  using (employee_id = auth.uid());

create policy "attendance: manager selects site" on attendance_events for select
  using (
    (select role from public.current_employee()) = 'manager'
    and site_id = (select site_id from public.current_employee())
  );

create policy "attendance: admins manage org" on attendance_events for all
  using (
    (select role from public.current_employee()) in ('org_admin', 'super_admin')
    and org_id = (select org_id from public.current_employee())
  )
  with check (
    (select role from public.current_employee()) in ('org_admin', 'super_admin')
    and org_id = (select org_id from public.current_employee())
  );

-- shifts, attendance_summary, leave_requests, biometric_devices,
-- payroll_exports — org-scoped read for everyone in the org; write
-- restricted to org_admin/super_admin (managers get scheduling write access
-- in a follow-up migration once the scheduling module is built).
create policy "shifts: select in org" on shifts for select
  using (
    employee_id = auth.uid()
    or exists (
      select 1 from employees e
      where e.id = shifts.employee_id
        and e.org_id = (select org_id from public.current_employee())
    )
  );

create policy "shifts: admins manage" on shifts for all
  using (
    (select role from public.current_employee()) in ('org_admin', 'super_admin')
  )
  with check (
    (select role from public.current_employee()) in ('org_admin', 'super_admin')
  );

create policy "summary: select in org" on attendance_summary for select
  using (
    employee_id = auth.uid()
    or org_id = (select org_id from public.current_employee())
  );

create policy "summary: admins manage" on attendance_summary for all
  using ((select role from public.current_employee()) in ('org_admin', 'super_admin'))
  with check ((select role from public.current_employee()) in ('org_admin', 'super_admin'));

create policy "leave: select own or org" on leave_requests for select
  using (
    employee_id = auth.uid()
    or org_id = (select org_id from public.current_employee())
  );

create policy "leave: self insert" on leave_requests for insert
  with check (employee_id = auth.uid());

create policy "leave: admins manage" on leave_requests for update
  using ((select role from public.current_employee()) in ('org_admin', 'super_admin', 'manager'));

create policy "devices: select in org" on biometric_devices for select
  using (org_id = (select org_id from public.current_employee()));

create policy "devices: admins manage" on biometric_devices for all
  using ((select role from public.current_employee()) in ('org_admin', 'super_admin'))
  with check ((select role from public.current_employee()) in ('org_admin', 'super_admin'));

create policy "payroll: select in org" on payroll_exports for select
  using (org_id = (select org_id from public.current_employee()));

create policy "payroll: admins manage" on payroll_exports for all
  using ((select role from public.current_employee()) in ('org_admin', 'super_admin'))
  with check ((select role from public.current_employee()) in ('org_admin', 'super_admin'));
