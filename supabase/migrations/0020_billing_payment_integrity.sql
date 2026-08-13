-- 0020 — A payment cannot claim an amount, or an org, the invoice disagrees with.
--
-- Found in a security review of 0019, same day it shipped.
--
-- `enforce_billing_payment_decision`'s INSERT branch force-overwrites
-- `status`, `recorded_by`, `confirmed_by` and `confirmed_at` — the comment
-- there says "a WITH CHECK could reject a bad value; only a trigger can
-- coerce it to the right one." That reasoning was applied to four columns
-- and not the two that matter most financially: `amount_usd` and `org_id`.
--
-- `src/app/admin/billing/actions.ts` (`recordPayment`) does re-fetch the
-- real invoice and send its `amount_usd` — but that is the Next.js
-- server action's convention, not a database guarantee. Any caller holding
-- a valid org_admin session can reach PostgREST directly with the same
-- anon key and INSERT a `billing_payments` row through the exact RLS policy
-- the app itself uses, with whatever `amount_usd` they choose: the INSERT
-- policy's `with check` only tests `role`/`org_id`, and nothing anywhere —
-- not a CHECK constraint (which cannot look at another table), not RLS, not
-- this trigger — ties the inserted amount to the invoice it is paying. If a
-- super_admin later confirms that payment, the trigger marks the invoice
-- `paid` regardless of whether the confirmed amount matches what was owed,
-- and `/super/billing`'s confirmation queue does not show the invoice's real
-- amount alongside the payment to catch the mismatch by eye.
--
-- `org_id` has the smaller version of the same problem: the INSERT policy
-- scopes it to the caller's own org, but nothing checks it against the
-- `invoice_id` actually referenced, so a payment could in principle name one
-- org's `org_id` and another org's `invoice_id`. Lower real-world risk —
-- exploiting it needs another org's invoice UUID, which nothing in this app
-- exposes — but the fix is free once the trigger is already deriving values
-- from the invoice row for the reason above, so it is closed in the same
-- pass rather than left as a known gap for later.
--
-- The fix is the same technique the trigger already uses for the other four
-- columns: derive from a trusted source and overwrite whatever the client
-- sent, rather than validate-and-reject. `billing_invoices` is read here
-- under this function's existing SECURITY DEFINER — the same privilege that
-- already lets the UPDATE branch write across the FK on confirmation.

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

    -- Force these regardless of what the client sent. A WITH CHECK could
    -- reject a bad value; only a trigger can coerce it to the right one.
    -- amount_usd and org_id are derived from the invoice itself, not
    -- accepted from the caller — the reason this migration exists.
    new.status       := 'pending';
    new.recorded_by  := v_me.id;
    new.confirmed_by := null;
    new.confirmed_at := null;
    new.amount_usd   := v_invoice.amount_usd;
    new.org_id       := v_invoice.org_id;
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

-- PostgREST caches the schema and does not notice DDL on its own.
notify pgrst, 'reload schema';

commit;
