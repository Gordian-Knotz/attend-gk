-- 0028 — Capture objects that exist in production but in no migration.
--
-- WHY THIS EXISTS
--
-- A full diff of the 27 migration files against the live schema (14 Aug 2026)
-- found the drift one-directional: everything the files declare is present in
-- production, but production carries objects no file creates. A fresh deploy
-- from this repository would therefore be missing them, silently:
--
--   recompute_attendance_summary_for()        attendance_summary never written
--   attendance_events_recompute_summary_trg() the trigger that calls it
--   normalize_leave_request_type()            leave types never normalised
--   rls_auto_enable()                         new tables ship without RLS
--
-- Plus one policy, "attendance: staff self insert", which is NOT recreated here
-- — see the note at the end.
--
-- Nothing below changes production. Every statement is CREATE OR REPLACE or
-- guarded, and the bodies are transcribed from the live definitions verbatim
-- apart from formatting. The point is that the repository can rebuild what is
-- running.
--
-- ─────────────────────────────────────────────────────────────────────────
-- TWO BUGS FOUND WHILE TRANSCRIBING. NEITHER IS FIXED HERE, DELIBERATELY.
-- ─────────────────────────────────────────────────────────────────────────
--
-- 1. DAY BUCKETING IS IN UTC, NOT THE ORGANIZATION'S TIMEZONE.
--
--    recompute_attendance_summary_for buckets on
--    `(occurred_at at time zone 'utc')::date`. The application buckets on
--    Africa/Nairobi via src/lib/timezone.ts — which exists precisely because
--    doc 11 found "everything time-related ran on the server's timezone".
--
--    Kenya is UTC+3, so a guard clocking in at 01:00 EAT is 22:00 UTC the
--    previous day and lands in attendance_summary against the WRONG DATE. This
--    product sells to security firms running 12-hour night shifts, so it is the
--    normal case for a whole shift pattern, not an edge case.
--
-- 2. THERE ARE TWO DIFFERENT DEFINITIONS OF "LATE".
--
--    This function calls it late when the first check-in is more than 10
--    minutes after `shifts.start_at`. src/lib/attendance.ts calls it late after
--    a fixed clock time (LATE_CUTOFF_HOUR 07:15). Both are live. So
--    attendance_summary.status and the dashboard computed from raw events can
--    disagree about the same person on the same day.
--
--    Doc 06 records per-shift comparison as the "real fix" that needs a
--    migration. It turns out somebody already wrote it, by hand, and the two
--    definitions have coexisted since.
--
-- Both are left alone because correcting either MOVES NUMBERS THAT PEOPLE HAVE
-- ALREADY READ, and possibly been paid against. That is a decision with a
-- backfill and a conversation attached, not a drive-by fix — the same reasoning
-- 0015 used for public holidays, where seeding rather than deploying was the
-- moment every historical balance recomputed.

begin;

-- ── Attendance summary maintenance ───────────────────────────────────────

create or replace function public.recompute_attendance_summary_for(
  p_employee_id uuid,
  p_org_id uuid,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_in    timestamptz;
  v_last_out    timestamptz;
  v_hours       numeric(6, 2);
  v_shift_start timestamptz;
  v_status      attendance_status;
begin
  -- SEE BUG 1 IN THE HEADER: 'utc' here, Africa/Nairobi in the application.
  select min(occurred_at) filter (where event_type = 'check_in'),
         max(occurred_at) filter (where event_type = 'check_out')
  into v_first_in, v_last_out
  from attendance_events
  where employee_id = p_employee_id
    and (occurred_at at time zone 'utc')::date = p_date;

  if v_first_in is null then
    -- Nothing to summarize yet (e.g. a stray check_out with no check_in).
    return;
  end if;

  v_hours := case
    when v_last_out is not null
    then round(extract(epoch from (v_last_out - v_first_in)) / 3600.0, 2)
    else 0
  end;

  -- SEE BUG 2 IN THE HEADER: shift-relative here, fixed clock time in
  -- src/lib/attendance.ts.
  select start_at into v_shift_start
  from shifts
  where employee_id = p_employee_id
    and (start_at at time zone 'utc')::date = p_date
  order by start_at asc
  limit 1;

  v_status := case
    when v_shift_start is not null and v_first_in > v_shift_start + interval '10 minutes'
      then 'late'
    else 'present'
  end;

  -- `org_id = excluded.org_id` is why 0022 revoked EXECUTE on this function
  -- from anon and authenticated: attendance_summary is unique (employee_id,
  -- date), so a direct call with another org's id would move the row to that
  -- tenant. It is safe as a trigger callee, and must stay un-callable.
  insert into attendance_summary (employee_id, org_id, date, hours_worked, overtime_hours, status)
  values (p_employee_id, p_org_id, p_date, coalesce(v_hours, 0), 0, v_status)
  on conflict (employee_id, date)
  do update set
    hours_worked = excluded.hours_worked,
    status = excluded.status,
    org_id = excluded.org_id;
end;
$$;

create or replace function public.attendance_events_recompute_summary_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_attendance_summary_for(
    new.employee_id,
    new.org_id,
    (new.occurred_at at time zone 'utc')::date
  );
  return new;
end;
$$;

drop trigger if exists attendance_events_recompute_summary on attendance_events;
create trigger attendance_events_recompute_summary
  after insert on attendance_events
  for each row execute function public.attendance_events_recompute_summary_trg();

-- ── Leave type normalisation ─────────────────────────────────────────────
--
-- Maps "Annual Leave" and friends onto the four values 0008's check constraint
-- permits. `set search_path` added: the live copy has a mutable search_path,
-- which Supabase's own advisor flags, and this is the one change here that
-- alters the object rather than just recording it. Safe — the body references
-- no schema-qualified object at all.

create or replace function public.normalize_leave_request_type()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.leave_type := case lower(trim(new.leave_type))
    when 'annual leave'        then 'annual'
    when 'annual'              then 'annual'
    when 'sick leave'          then 'sick'
    when 'sick'                then 'sick'
    when 'unpaid leave'        then 'unpaid'
    when 'unpaid'              then 'unpaid'
    when 'compassionate leave' then 'compassionate'
    when 'compassionate'       then 'compassionate'
    else lower(trim(new.leave_type))
  end;

  return new;
end;
$$;

drop trigger if exists trg_normalize_leave_request_type on leave_requests;
create trigger trg_normalize_leave_request_type
  before insert or update on leave_requests
  for each row execute function public.normalize_leave_request_type();

-- ── RLS on every new table, automatically ────────────────────────────────
--
-- An event trigger that enables RLS on any table created in `public`. Genuinely
-- good, and it caught a probe table during the 0022 work — which is how it was
-- discovered, because nothing in the repository mentioned it.
--
-- Without this in a migration, a fresh deploy would let the next table ship
-- with RLS off, which is the one mistake this schema cannot afford.

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name is not null and cmd.schema_name in ('public') then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
    else
      raise log 'rls_auto_enable: skip % (schema %)', cmd.object_identity, cmd.schema_name;
    end if;
  end loop;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    create event trigger ensure_rls
      on ddl_command_end
      execute function public.rls_auto_enable();
  end if;
end $$;

-- 0022's reasoning applies to all four: none of these should be callable over
-- PostgREST. Re-stated here because a fresh CREATE grants EXECUTE to PUBLIC.
revoke execute on function public.recompute_attendance_summary_for(uuid, uuid, date)
  from public, anon, authenticated;
revoke execute on function public.attendance_events_recompute_summary_trg()
  from public, anon, authenticated;
revoke execute on function public.normalize_leave_request_type()
  from public, anon, authenticated;
revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated;

commit;

-- ── NOT recreated: "attendance: staff self insert" ───────────────────────
--
-- Production also carries a hand-made INSERT policy on attendance_events by
-- that name, alongside 0008's "attendance: self insert". It is deliberately
-- absent from this file.
--
-- It is harmless: its check is
--   employee_id = auth.uid() AND org_id = mine AND site_id = mine
--     AND source in ('mobile','kiosk_qr')
-- which is a strict SUBSET of 0008's policy (0008 uses `is not distinct from`
-- on site_id, so it additionally permits an unassigned employee). Permissive
-- policies OR together, so the extra one grants nothing 0008 does not.
--
-- But two policies doing one job, one of them undocumented, is how somebody
-- later tightens one and believes they have tightened both. Drop it once you
-- have confirmed nothing depends on the name:
--
--   drop policy if exists "attendance: staff self insert" on attendance_events;

notify pgrst, 'reload schema';
