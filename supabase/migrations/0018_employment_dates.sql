-- 0018 — Employment dates, so a seat can be counted honestly.
--
-- `employees.id references auth.users(id) on delete cascade`, so today the
-- only way to stop counting someone is to delete their row — which destroys
-- their attendance history. A Kenyan employer may be required to keep that
-- history; billing must not force a choice between over-charging and
-- destroying records.
--
-- Two nullable date columns, not one "is_active" boolean: a boolean cannot
-- express "left three months ago" for a report that looks at a past period,
-- and it cannot express "starts next Monday" for someone already invited.
--
-- No trigger, no new policy. `employees` has exactly one write policy —
-- "employees: admins manage roster" (0001, widened 0003) — and nobody who
-- could not already write `role` or `site_id` gains anything here. Adding a
-- guard trigger for these two columns the way 0010 and 0011 did for
-- `plan_tier` and `role` would be solving a problem that does not exist:
-- those columns needed guarding *from an org_admin who already has a write
-- grant on the row*. Employment dates are exactly the kind of HR fact an
-- org_admin is supposed to set for their own staff.

begin;

alter table employees
  add column if not exists employment_start_date date,
  add column if not exists employment_end_date date;

alter table employees drop constraint if exists employees_employment_dates_check;
alter table employees add constraint employees_employment_dates_check
  check (
    employment_end_date is null
    or employment_start_date is null
    or employment_end_date >= employment_start_date
  );

comment on column employees.employment_start_date is
  'Null means employed for the whole window any report or invoice looks at — preserves prior behaviour exactly. Set by an org_admin or super_admin; no code path exposes this to staff.';
comment on column employees.employment_end_date is
  'Null means still employed. Set this instead of removing the row — employees.id references auth.users(id) on delete cascade, and deleting destroys attendance history. Nothing currently sets this column; see the billing design spec for why it exists before an edit UI does.';

-- PostgREST serves a cached schema and 404s new columns until it refreshes,
-- which looks exactly like the migration not having run.
notify pgrst, 'reload schema';

commit;
