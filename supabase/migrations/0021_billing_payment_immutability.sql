-- 0021 — Close the second half of 0019's confirm trigger, not just the first.
--
-- Found in the same CodeRabbit pass that flagged 0020's amount_usd/org_id
-- gap. That fix (0020) closed the INSERT side: a payment can no longer
-- arrive with an amount or org the invoice disagrees with. This closes the
-- UPDATE side, which had the shape of the same mistake.
--
-- The trigger's `else` branch — "status unchanged: nothing else on this row
-- is a free-text field" — only ran when `new.status is distinct from
-- old.status` was FALSE. A status-changing UPDATE (the only kind
-- super_admin's confirm/fail action ever sends) never reached it, so
-- `recorded_by`, `invoice_id`, `org_id` and `amount_usd` were never actually
-- checked on the one write path that matters: confirming a payment. RLS
-- already restricts UPDATE to super_admin, so the practical exposure here
-- was to that role's own tooling sending an unexpected payload, not a
-- cross-tenant attacker — but "immutable after recorded" was a claim the
-- code didn't keep, and a claim it makes about money is worth keeping
-- honestly rather than accidentally.
--
-- Also tightens the confirm branch's invoice update from `status <> 'paid'`
-- to `status = 'issued'`: nothing in this app ever produces a `draft` or
-- `void` invoice today, but a confirm landing on either of those states in
-- the future should not silently mark them paid.

begin;

create or replace function public.enforce_billing_payment_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      employees%rowtype;
  v_role    employee_role;
  v_invoice billing_invoices%rowtype;
begin
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
    select * into v_invoice from billing_invoices where id = new.invoice_id;
    if v_invoice.id is null then
      raise exception 'That invoice could not be found.'
        using errcode = '42501';
    end if;

    new.status       := 'pending';
    new.recorded_by  := v_me.id;
    new.confirmed_by := null;
    new.confirmed_at := null;
    new.amount_usd   := v_invoice.amount_usd;
    new.org_id       := v_invoice.org_id;
    return new;
  end if;

  if v_role <> 'super_admin' then
    raise exception 'Only the vendor can confirm or fail a payment.'
      using errcode = '42501';
  end if;

  -- Checked unconditionally now, before the status branch — not only when
  -- status happens to stay the same. These four never move after insert,
  -- full stop.
  if new.recorded_by is distinct from old.recorded_by
     or new.invoice_id is distinct from old.invoice_id
     or new.org_id     is distinct from old.org_id
     or new.amount_usd is distinct from old.amount_usd
  then
    raise exception 'That field cannot be changed after the payment is recorded.'
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
      -- tables can never disagree about whether an invoice is paid. Tightened
      -- to `status = 'issued'` rather than `status <> 'paid'`: a draft or
      -- void invoice is not owed either, and neither should ever exist in
      -- practice, but "confirm can only settle something that was actually
      -- issued" is the honest predicate to state.
      update billing_invoices
      set status = 'paid', paid_at = now()
      where id = new.invoice_id and status = 'issued';
    end if;
  else
    -- Status unchanged: attribution still cannot move on its own.
    if new.confirmed_by is distinct from old.confirmed_by
       or new.confirmed_at is distinct from old.confirmed_at
    then
      raise exception 'That field cannot be changed after the payment is recorded.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';

commit;
