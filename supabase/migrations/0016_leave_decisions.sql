-- 0016_leave_decisions.sql
--
-- Leave approvals: who decided, when, and who is allowed to.
--
-- The gap this closes is larger than it sounds. Nothing in the application has
-- ever written leave_requests.status — there is no approve action, no UI, no
-- code path. Staff could submit requests and they sat 'pending' forever. Since
-- only 'approved' reduces a balance, `taken` was permanently zero and every
-- balance showed a full allowance no matter how much leave had been requested.
-- The feature could not perform its function.
--
-- Two real holes in the policy that has stood since 0001 (widened in 0003):
--
--   1. A MANAGER COULD DECIDE FOR THE WHOLE ORG. The policy checks
--      `role in ('org_admin','manager') and org_id = mine` with no site
--      narrowing, so a manager at one site could approve leave for staff at
--      another. Every other four-tier policy in this schema narrows managers to
--      their own site; this one never did.
--
--   2. A MANAGER OR ADMIN COULD APPROVE THEIR OWN LEAVE. 0008 closed this for
--      staff by forcing status='pending' on insert, and doc 11 records
--      self-approved leave as a fraud path that a full security review missed.
--      It was only ever closed one role deep: a manager could insert a pending
--      request and then update it to approved, unopposed.
--
-- Not a hole, checked and dismissed so nobody re-raises it: the UPDATE policy
-- omits `with check`. For UPDATE, Postgres applies the USING expression as the
-- check when WITH CHECK is absent, so the new row is constrained too. Both are
-- written explicitly below anyway, because relying on that default is how the
-- next reader talks themselves into removing one.

begin;

alter table leave_requests
  add column if not exists decided_by    uuid references employees(id) on delete set null,
  add column if not exists decided_at    timestamptz,
  add column if not exists decision_note text;

-- `on delete set null`, matching 0013's notifications.author_id: removing an
-- employee must not delete the leave history of everyone whose requests they
-- approved. The decision still happened.
comment on column leave_requests.decided_by is
  'Employee who approved or rejected. Null once that employee is deleted, or while still pending.';

create index if not exists leave_requests_pending_idx
  on leave_requests (org_id, status, start_date);

-- ── Who may decide ─────────────────────────────────────────────────────────

drop policy if exists "leave: admins manage" on leave_requests;

-- Managers are narrowed to their own site, admins keep the org, and the vendor
-- keeps its cross-org reach. employee_site_id() is the same helper 0012
-- narrowed for exactly this shape of check.
create policy "leave: admins manage"
  on leave_requests for update
  using (
    (select role from public.current_employee()) = 'super_admin'
    or (
      (select role from public.current_employee()) = 'org_admin'
      and org_id = (select org_id from public.current_employee())
    )
    or (
      (select role from public.current_employee()) = 'manager'
      and org_id = (select org_id from public.current_employee())
      and public.employee_site_id(employee_id) is not distinct from
          (select site_id from public.current_employee())
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
      and public.employee_site_id(employee_id) is not distinct from
          (select site_id from public.current_employee())
    )
  );

-- Staff may cancel their OWN request while it is still pending, and do nothing
-- else. Without this they must ask an admin to undo a request they made by
-- mistake, which is how a balance ends up wrong for a reason nobody records.
-- The status transition itself is enforced by the trigger below; RLS only
-- decides which rows are reachable.
drop policy if exists "leave: cancel own pending" on leave_requests;
create policy "leave: cancel own pending"
  on leave_requests for update
  using (
    employee_id = (select id from public.current_employee())
    and status = 'pending'
  )
  with check (
    employee_id = (select id from public.current_employee())
  );

-- ── What may change, and by whom ───────────────────────────────────────────
--
-- RLS grants access to ROWS, not COLUMNS. Everything below is per-column and so
-- needs a trigger. This is the fifth table in this schema to need one for the
-- same reason — attendance_events (0008), organizations (0010), employees
-- (0011) and leave_entitlements (0014) were the others.

create or replace function public.enforce_leave_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me   employees%rowtype;
  v_role employee_role;
begin
  select * into v_me from public.current_employee();

  -- The service role and any SECURITY DEFINER caller with no auth context (the
  -- seeder, for instance) bypass this. Consistent with 0011/0012, and the
  -- reason is that RLS is already off for those callers, so a trigger raising
  -- here would break the bootstrap path without adding protection.
  if auth.uid() is null then
    return new;
  end if;

  -- No employee row: nothing can be authorised. Raised explicitly rather than
  -- left to a null comparison, because `v_role not in (...)` evaluates to NULL
  -- and NULL is not true, so the guard would silently pass — the exact bug
  -- found in 0014's ensure_leave_entitlements before it ever ran.
  if v_me.id is null then
    raise exception 'No employee record for the signed-in user.'
      using errcode = '42501';
  end if;

  v_role := v_me.role;

  -- The request itself is immutable once submitted. A decider may not quietly
  -- move the dates or the type of what they are approving, and the requester
  -- may not extend a request after it has been approved.
  if new.employee_id is distinct from old.employee_id
     or new.org_id     is distinct from old.org_id
     or new.leave_type is distinct from old.leave_type
     or new.start_date is distinct from old.start_date
     or new.end_date   is distinct from old.end_date then
    raise exception 'A leave request cannot be edited after submission; cancel it and raise a new one.'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    -- The requester's only permitted transition is pending -> cancelled.
    if new.employee_id = v_me.id and v_role not in ('org_admin', 'super_admin') then
      if not (old.status = 'pending' and new.status = 'cancelled') then
        raise exception 'You can only cancel your own pending request.'
          using errcode = '42501';
      end if;

    -- NOBODY APPROVES THEIR OWN LEAVE, including an org_admin. This is the hole
    -- doc 11 records as a fraud path: it was closed for staff at insert time in
    -- 0008 and left open for every role above them, which is the half that
    -- matters, because those are the roles with something to gain.
    elsif new.employee_id = v_me.id then
      if new.status in ('approved', 'rejected') then
        raise exception 'You cannot decide your own leave request.'
          using errcode = '42501';
      end if;

    else
      if v_role not in ('manager', 'org_admin', 'super_admin') then
        raise exception 'Only managers and admins can decide a leave request.'
          using errcode = '42501';
      end if;
    end if;

    -- Attribution is set by the database, not supplied by the caller, so a
    -- decision cannot be recorded against someone else. Cancellation by the
    -- requester is not a decision and stays unattributed.
    if new.status in ('approved', 'rejected') then
      new.decided_by := v_me.id;
      new.decided_at := now();
    else
      new.decided_by := null;
      new.decided_at := null;
    end if;
  else
    -- Status unchanged: the attribution columns are not a free-text field for
    -- whoever holds an update policy.
    if new.decided_by is distinct from old.decided_by
       or new.decided_at is distinct from old.decided_at then
      raise exception 'Decision attribution is set by the database, not the caller.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_leave_decision on leave_requests;
create trigger enforce_leave_decision
  before update on leave_requests
  for each row execute function public.enforce_leave_decision();

commit;

notify pgrst, 'reload schema';
