-- Org-scoped notice feed, carried over from the earlier prototype's
-- `notifications` table and brought in line with this schema (employees
-- rather than profiles, the current_employee() RLS helper, and a severity
-- level so the UI can rank notices instead of showing a flat list).
--
-- Nothing writes to this table automatically yet — the intended writers are
-- the exception detector and the biometric webhook bridge, both unbuilt.
-- Admins can post notices by hand in the meantime.

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  site_id    uuid references sites(id) on delete cascade,
  message    text not null,
  level      text not null default 'info'
             check (level in ('info', 'warning', 'critical')),
  created_at timestamptz not null default now()
);

create index idx_notifications_org on notifications(org_id, created_at desc);

alter table notifications enable row level security;

-- Everyone in the org reads their org's notices; super_admin reads all.
create policy "notifications: select in org" on notifications for select
  using (
    (select role from public.current_employee()) = 'super_admin'
    or org_id = (select org_id from public.current_employee())
  );

-- Managers can post for their own site; org_admin for the whole org;
-- super_admin anywhere. Mirrors the shift-write split from 0004.
create policy "notifications: admins manage" on notifications for all
  using (
    (select role from public.current_employee()) = 'super_admin'
    or (
      (select role from public.current_employee()) = 'org_admin'
      and org_id = (select org_id from public.current_employee())
    )
    or (
      (select role from public.current_employee()) = 'manager'
      and org_id = (select org_id from public.current_employee())
      and site_id = (select site_id from public.current_employee())
    )
  )
  with check (
    (select role from public.current_employee()) = 'super_admin'
    or (
      (select role from public.current_employee()) = 'org_admin'
      and org_id = (select org_id from public.current_employee())
    )
    or (
      (select role from public.current_employee()) = 'manager'
      and org_id = (select org_id from public.current_employee())
      and site_id = (select site_id from public.current_employee())
    )
  );
