-- 0019 — Per-seat billing: price, invoices, a payment placeholder.
--
-- $3/employee/month. `seat_price_usd` lives on `organizations` rather than
-- being a constant, so a negotiated rate is a row update, not a deploy.
-- Defaulted to 3.00 so nothing needs backfilling.
--
-- Two tables. `billing_invoices` is what an org owed for one period —
-- issued by us, at most once per org per period. `billing_payments` is an
-- attempt to settle one, shaped for M-Pesa (a phone number and a
-- transaction code) but general enough that a card payment slots in
-- alongside without reshaping data.
--
-- Access is the one place staff and managers get nothing at all: what an
-- org pays is not workforce information. org_admin reads their own org's
-- rows and may record a payment attempt; only super_admin issues an invoice
-- or confirms a payment.

begin;

-- ── 1. Price becomes a per-org column ───────────────────────────────────

alter table organizations
  add column if not exists seat_price_usd numeric(10, 2) not null default 3.00;

alter table organizations drop constraint if exists organizations_seat_price_check;
alter table organizations add constraint organizations_seat_price_check
  check (seat_price_usd >= 0);

-- Widen 0010's column guard to cover this new commercial field. This is a
-- redefinition of an existing function, not an edit to 0010's file — the
-- same thing 0016 does to leave_requests, a table 0001 created.
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

  if new.plan_tier        is distinct from old.plan_tier
     or new.billing_status  is distinct from old.billing_status
     or new.suspended_at    is distinct from old.suspended_at
     or new.suspended_reason is distinct from old.suspended_reason
     or new.seat_price_usd  is distinct from old.seat_price_usd
     or new.slug            is distinct from old.slug
  then
    raise exception
      'Only platform administrators can change plan, billing or pricing'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ── 2. What an org owed for one period ──────────────────────────────────
--
-- unique(org_id, period_start, period_end) stops the same period being
-- issued twice by mistake — a super_admin double-clicking "Issue" should not
-- double-bill anyone.

create table if not exists billing_invoices (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  period_start   date not null,
  period_end     date not null check (period_end >= period_start),
  seat_count     integer not null check (seat_count >= 0),
  unit_price_usd numeric(10, 2) not null check (unit_price_usd >= 0),
  amount_usd     numeric(10, 2) not null check (amount_usd >= 0),
  status         text not null default 'issued'
                 check (status in ('draft', 'issued', 'paid', 'void')),
  issued_at      timestamptz not null default now(),
  paid_at        timestamptz,
  created_at     timestamptz not null default now(),
  unique (org_id, period_start, period_end)
);

create index if not exists idx_billing_invoices_org
  on billing_invoices (org_id, period_start desc);

alter table billing_invoices enable row level security;

drop policy if exists "billing invoice: select own or all" on billing_invoices;
create policy "billing invoice: select own or all" on billing_invoices for select
  using (
    (select role from public.current_employee()) = 'super_admin'
    or (
      (select role from public.current_employee()) = 'org_admin'
      and org_id = (select org_id from public.current_employee())
    )
  );

-- No trigger here, by the same reasoning 0014 gave for leave_entitlements:
-- org_admin has no write grant on this table at all, so there is no
-- per-column boundary for a trigger to enforce. Adding one would be cargo
-- cult on a table where RLS alone already says the whole thing.
drop policy if exists "billing invoice: super admin issues" on billing_invoices;
create policy "billing invoice: super admin issues" on billing_invoices for all
  using ((select role from public.current_employee()) = 'super_admin')
  with check ((select role from public.current_employee()) = 'super_admin');

-- ── 3. An attempt to settle one ─────────────────────────────────────────
--
-- `org_id` is denormalised from `billing_invoices.org_id`, the same shape
-- `leave_entitlements` uses alongside `employee_id`: it lets RLS scope a
-- payment to an org without a subquery join on every row check.

create table if not exists billing_payments (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references billing_invoices(id) on delete cascade,
  org_id       uuid not null references organizations(id) on delete cascade,
  method       text not null default 'mpesa' check (method in ('mpesa', 'card')),
  amount_usd   numeric(10, 2) not null check (amount_usd >= 0),
  reference    text,
  payer_phone  text,
  status       text not null default 'pending'
               check (status in ('pending', 'confirmed', 'failed')),
  recorded_by  uuid references employees(id) on delete set null,
  confirmed_by uuid references employees(id) on delete set null,
  confirmed_at timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_billing_payments_invoice
  on billing_payments (invoice_id);
create index if not exists idx_billing_payments_org
  on billing_payments (org_id);
-- The vendor's "awaiting confirmation" queue filters on status alone, across
-- every org — not org-scoped, so the org index above does not serve it.
create index if not exists idx_billing_payments_status
  on billing_payments (status);

comment on column billing_payments.recorded_by is
  'Who submitted the payment attempt. Set by the trigger below, never by the client — the same rule 0016 applies to leave_requests.decided_by.';
comment on column billing_payments.confirmed_by is
  'Who confirmed or failed the payment. Null while pending. Only super_admin can ever cause this to be set — see the trigger.';

alter table billing_payments enable row level security;

drop policy if exists "billing payment: select own or all" on billing_payments;
create policy "billing payment: select own or all" on billing_payments for select
  using (
    (select role from public.current_employee()) = 'super_admin'
    or (
      (select role from public.current_employee()) = 'org_admin'
      and org_id = (select org_id from public.current_employee())
    )
  );

-- org_admin may record an attempt for their own org. super_admin may record
-- one for any org (the vendor recording a payment taken over the phone,
-- say). Nobody in this policy is granted UPDATE — that is deliberate, see
-- the next policy and the trigger.
drop policy if exists "billing payment: record own or any" on billing_payments;
create policy "billing payment: record own or any" on billing_payments for insert
  with check (
    (select role from public.current_employee()) = 'super_admin'
    or (
      (select role from public.current_employee()) = 'org_admin'
      and org_id = (select org_id from public.current_employee())
    )
  );

-- Only the vendor may ever update a payment — which is how a payment gets
-- confirmed or failed. This policy grants the ROW; the trigger below is what
-- actually stops even a super_admin from re-deciding one, or setting
-- attribution by hand.
drop policy if exists "billing payment: super admin decides" on billing_payments;
create policy "billing payment: super admin decides" on billing_payments for update
  using ((select role from public.current_employee()) = 'super_admin')
  with check ((select role from public.current_employee()) = 'super_admin');

-- ── 4. What may change, and by whom ─────────────────────────────────────
--
-- Fifth per-column trigger in this schema, after 0008 (attendance_events),
-- 0010 (organizations), 0011 (employees) and 0016 (leave_requests). 0014
-- (leave_entitlements) deliberately has none — see 0018's own migration
-- comment. Do not describe this as the sixth in any commit message; the
-- design spec's count is wrong.
--
-- Two things a trigger does that a WITH CHECK cannot: overwrite a
-- client-supplied value rather than merely reject it (so an insert cannot
-- arrive already "confirmed" no matter what the payload says), and keep a
-- second table consistent in the same transaction (marking the invoice paid
-- the moment its payment is confirmed, so the two can never disagree).

create or replace function public.enforce_billing_payment_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me   employees%rowtype;
  v_role employee_role;
begin
  -- No JWT means the SQL editor, a migration, or the service role — trusted
  -- by definition, same escape hatch as 0011 and 0016.
  if auth.uid() is null then
    return new;
  end if;

  select * into v_me from public.current_employee();
  if v_me.id is null then
    raise exception 'No employee record for the signed-in user.'
      using errcode = '42501';
  end if;
  v_role := v_me.role;

  if tg_op = 'INSERT' then
    -- Force these regardless of what the client sent. A WITH CHECK could
    -- reject a bad value; only a trigger can coerce it to the right one.
    new.status       := 'pending';
    new.recorded_by  := v_me.id;
    new.confirmed_by := null;
    new.confirmed_at := null;
    return new;
  end if;

  -- tg_op = 'UPDATE' from here. RLS already restricts UPDATE to super_admin
  -- (see the policy above); this check is explicit anyway, for the same
  -- reason 0011 and 0016 do not rely solely on the policy that granted the
  -- row.
  if v_role <> 'super_admin' then
    raise exception 'Only the vendor can confirm or fail a payment.'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if old.status <> 'pending' then
      raise exception 'A decided payment cannot be redecided.'
        using errcode = '42501';
    end if;
    if new.status not in ('confirmed', 'failed') then
      raise exception 'A payment can only move from pending to confirmed or failed.'
        using errcode = '42501';
    end if;

    new.confirmed_by := v_me.id;
    new.confirmed_at := now();

    if new.status = 'confirmed' then
      -- Kept in the same transaction as the payment write, so the two
      -- tables can never disagree about whether an invoice is paid. This
      -- table's own RLS would otherwise stop even a super_admin's plain
      -- UPDATE here if the vendor's org differs from the invoice's org, so
      -- the function runs as SECURITY DEFINER for exactly this one write.
      update billing_invoices
      set status = 'paid', paid_at = now()
      where id = new.invoice_id and status <> 'paid';
    end if;
  else
    -- Status unchanged: nothing else on this row is a free-text field for
    -- whoever holds the update policy.
    if new.recorded_by  is distinct from old.recorded_by
       or new.confirmed_by is distinct from old.confirmed_by
       or new.confirmed_at is distinct from old.confirmed_at
       or new.invoice_id   is distinct from old.invoice_id
       or new.org_id       is distinct from old.org_id
       or new.amount_usd   is distinct from old.amount_usd
    then
      raise exception 'That field cannot be changed after the payment is recorded.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_billing_payment_decision on billing_payments;
create trigger enforce_billing_payment_decision
  before insert or update on billing_payments
  for each row execute function public.enforce_billing_payment_decision();

-- PostgREST caches the schema and does not notice DDL on its own.
notify pgrst, 'reload schema';

commit;
