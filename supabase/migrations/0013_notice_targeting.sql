-- 0013 — Notices that reach the people they are for.
--
-- Three things were wrong with notices as shipped in 0006.
--
-- 1. Staff could not see them at all. Nothing under src/app/dashboard read the
--    table, so since 0006 admins have been posting announcements that only
--    other admins could read. The feature never performed its function.
--
-- 2. "Dismiss" ran a DELETE. One manager clearing their own view removed the
--    notice from the entire organization, while the button said "Dismiss".
--    There was no per-person state to record, so there was nothing else it
--    could have done.
--
-- 3. Nobody knew who posted a notice, and a notice could only be addressed to
--    an organization or one site — not to a role.
--
-- Re-runnable throughout, like 0008-0012.
--
-- Wrapped in a transaction: the Supabase CLI already runs migrations inside
-- one, but the dashboard SQL editor does not. Without begin/commit, a
-- hand-run interrupted between the `drop policy` and the `create policy`
-- that replaces it would leave notices admin-only until someone re-ran the
-- file.

begin;

-- ── 1. Author and role targeting ────────────────────────────────────────
--
-- author_id is `on delete set null`, deliberately: removing an employee must
-- not delete the announcements they wrote. The org keeps the notice and loses
-- the attribution, which is the right way round.
--
-- target_role null means "every role". site_id (from 0006) null already means
-- "every site". The two combine, so "all staff at Two Rivers Mall" is
-- expressible without a join table.

alter table notifications
  add column if not exists author_id uuid references employees(id) on delete set null;

alter table notifications
  add column if not exists target_role employee_role;

-- ── 2. Per-employee dismissals ──────────────────────────────────────────
--
-- This is what makes a dismiss that is not a delete possible. Cascades on both
-- sides: a dismissal has no meaning without either end.

create table if not exists notification_dismissals (
  notification_id uuid not null references notifications(id) on delete cascade,
  employee_id     uuid not null references employees(id)     on delete cascade,
  dismissed_at    timestamptz not null default now(),
  primary key (notification_id, employee_id)
);

alter table notification_dismissals enable row level security;

-- The primary key is (notification_id, employee_id), with employee_id as the
-- *second* column — a lookup that filters on employee_id alone (the rail's
-- dismissals read, and the self-read/self-update policies below) cannot use
-- that index and falls back to a sequential scan of the whole table on every
-- dashboard render.
create index if not exists idx_notification_dismissals_employee
  on notification_dismissals (employee_id);

-- Self only, for both read and write. An employee's dismissals are nobody
-- else's business, and letting one person write another's dismissal would let a
-- manager silence a notice on staff's behalf.
drop policy if exists "dismissals: self read" on notification_dismissals;
create policy "dismissals: self read" on notification_dismissals for select
  using (employee_id = auth.uid());

drop policy if exists "dismissals: self insert" on notification_dismissals;
create policy "dismissals: self insert" on notification_dismissals for insert
  with check (employee_id = auth.uid());

-- dismissNoticeForSelf() upserts (onConflict: notification_id,employee_id) so
-- that re-dismissing an already-dismissed notice is a no-op instead of a
-- unique-violation. PostgREST turns that upsert into
-- `insert ... on conflict do update`, and Postgres checks the ON CONFLICT DO
-- UPDATE branch against the table's UPDATE policies, not its INSERT policies.
-- Without this policy, a second dismissal of the same notice by the same
-- person 42501s.
drop policy if exists "dismissals: self update" on notification_dismissals;
create policy "dismissals: self update" on notification_dismissals for update
  using (employee_id = auth.uid())
  with check (employee_id = auth.uid());

drop policy if exists "dismissals: self delete" on notification_dismissals;
create policy "dismissals: self delete" on notification_dismissals for delete
  using (employee_id = auth.uid());

-- ── 3. Narrow the read policy to the notice's audience ──────────────────
--
-- 0006's policy was "same org, or super_admin" — every notice to everybody in
-- the organization. Now a notice is visible when the org matches AND the site
-- is unset or matches yours AND the target role is unset or matches yours.
--
-- Note this does NOT blind admins: "notifications: admins manage" from 0006 is
-- `for all`, which includes select, and RLS policies are OR'd — so org_admin
-- keeps seeing every notice in their org through that policy. It does correctly
-- narrow managers, who only reach the manage policy for their own site.
--
-- That manage policy is also unconditioned on target_role, though, which cuts
-- the other way: a manager reads any notice pinned to their own site through
-- it regardless of target_role — including one addressed to org_admin only.
-- This policy (select in org) never gets a chance to narrow that case, because
-- policies are OR'd and the manage policy already grants it. That is intended
-- here, not an oversight: a manager can delete any notice pinned to their own
-- site (see "admins manage" in 0006), so letting them read those same notices
-- is no wider than what they can already do to them.

drop policy if exists "notifications: select in org" on notifications;
create policy "notifications: select in org" on notifications for select
  using (
    (select role from public.current_employee()) = 'super_admin'
    or (
      org_id = (select org_id from public.current_employee())
      and (
        site_id is null
        or site_id = (select site_id from public.current_employee())
      )
      and (
        target_role is null
        or target_role = (select role from public.current_employee())
      )
    )
  );

-- PostgREST serves a cached schema and 404s new columns and tables until it
-- refreshes, which looks exactly like the migration not having run.
notify pgrst, 'reload schema';

commit;
