-- Platform administration: the vendor's own view of its tenants.
--
-- WHY THIS EXISTS
--
-- `/super` is PAC's operator console — which organizations exist, which are
-- paying, and the ability to change that. Two things had to be true first
-- and weren't:
--
--   1. `billing_status` was free text with no constraint, so "past_due",
--      "pastdue", "PAST_DUE" and "overdue" could all coexist and any
--      filter over it would silently under-count. It is the column the
--      whole "who has paid" question rests on.
--   2. There was no way to stop an organization using the product. The
--      only lever was deleting it, which cascades to every employee,
--      attendance event and leave request they have — an irreversible
--      answer to a reversible problem.

-- ── Billing status becomes a closed set ─────────────────────────────────
--
-- Existing rows are normalised first, so the constraint can't fail on data
-- written before it existed.

update organizations
set billing_status = lower(trim(billing_status))
where billing_status <> lower(trim(billing_status));

update organizations
set billing_status = 'trialing'
where billing_status not in ('trialing', 'active', 'past_due', 'canceled');

alter table organizations drop constraint if exists organizations_billing_status_check;
alter table organizations add constraint organizations_billing_status_check
  check (billing_status in ('trialing', 'active', 'past_due', 'canceled'));

-- ── Suspension ──────────────────────────────────────────────────────────
--
-- Reversible, and keeps the data. Non-payment is usually a conversation,
-- not a deletion.

alter table organizations add column if not exists suspended_at timestamptz;
alter table organizations add column if not exists suspended_reason text;

comment on column organizations.suspended_at is
  'Set by a super_admin from /super. The app blocks /admin and /dashboard '
  'for members of a suspended org; their data is retained.';

-- ── Who may change any of this ──────────────────────────────────────────
--
-- 0001's "org: admins update own" already lets a super_admin update any
-- organization and an org_admin update their own. That is too broad now
-- that these columns exist: an org_admin could set their own plan_tier to
-- 'enterprise', mark themselves 'active', or clear a suspension somebody
-- just applied to them.
--
-- Split in two: org_admins keep the name, super_admins own the commercial
-- columns. Enforced with a trigger rather than a policy, because RLS
-- operates on rows and this is a per-column rule.

drop policy if exists "org: admins update own" on organizations;
create policy "org: admins update own" on organizations for update
  using (
    (select role from public.current_employee()) = 'super_admin'
    or (
      id = (select org_id from public.current_employee())
      and (select role from public.current_employee()) = 'org_admin'
    )
  );

create or replace function public.guard_organization_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select role from public.current_employee()) = 'super_admin' then
    return new;
  end if;

  -- Anyone else may rename their organization and nothing more.
  if new.plan_tier      is distinct from old.plan_tier
     or new.billing_status  is distinct from old.billing_status
     or new.suspended_at    is distinct from old.suspended_at
     or new.suspended_reason is distinct from old.suspended_reason
     or new.slug            is distinct from old.slug
  then
    raise exception
      'Only platform administrators can change plan, billing or suspension'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists organizations_guard_columns on organizations;
create trigger organizations_guard_columns
  before update on organizations
  for each row execute function public.guard_organization_columns();

-- PostgREST caches the schema and does not notice DDL on its own.
notify pgrst, 'reload schema';
