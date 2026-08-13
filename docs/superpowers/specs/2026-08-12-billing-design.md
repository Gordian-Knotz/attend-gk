# Billing: per-seat pricing, invoices, and a payment placeholder

**Date:** 12 August 2026
**Status:** approved for build — four decisions taken by the product owner, below.

$3 per employee per month. Visible to the **vendor** (`super_admin`) across all
tenants, and to the **org admin** who actually pays. Payment integration is a
placeholder, but shaped so a real one slots in rather than replaces it.

## Decisions taken

1. **Employment dates are added now** (`employment_start_date`,
   `employment_end_date`) — this is HR suite piece 1, already specced and
   unblocked. Billing counts only people currently employed.
2. **A billable seat is `staff` or `manager`.** Not `org_admin` (the buyer), and
   never `super_admin` (us).
3. **`plan_tier` keeps meaning what an org can DO; seats are what they PAY.**
   Nothing existing breaks and `/super` keeps its tier control.
4. **The payment placeholder is M-Pesa-shaped** — mobile-money reference, payer
   phone, confirmation state. Card can be added alongside without reshaping data.

## Why employment dates come first

Per-seat billing is impossible to do honestly without them. `employees` has no
deactivation concept, and `employees.id references auth.users(id) on delete
cascade` — so the only way to stop billing someone is to delete them, which
destroys their attendance history. That forces a choice between over-charging and
destroying records a Kenyan employer may be required to keep.

Two nullable date columns remove the dilemma, and they also fix a live reporting
bug that `src/lib/attendance-series.ts:76` already admits to: someone who joined
mid-week currently reads as **absent on days before they joined**.

**Scope boundary, deliberate:** this feature adds the columns and uses them for
billing only. Making `buildDailySeries` and `buildTimesheet` filter the roster
per day is a separate change, because it moves numbers on attendance reports and
should not ride in on a billing commit. Billing is additive; that is not.

## What a seat count is, precisely

An employee is billable for a period when **all** hold:

- `role in ('staff','manager')`
- `employment_start_date is null or <= period_end`
- `employment_end_date is null or >= period_start`

`null` start means "employed for the whole window", preserving today's behaviour
exactly — the HR spec's recommendation, chosen because a reporting change that
silently moves historical numbers is worse than a conservative one.

**Seats are counted at period end. There is no proration**, and the invoice says
so. Proration needs a daily seat history nothing records, and inventing one
silently is worse than a simple rule printed next to the number. This is the same
posture the leave counting rule takes.

## Schema

`0018_employment_dates.sql` — two nullable date columns, plus a check that an end
date is not before a start date.

`0019_billing.sql`:

```
organizations.seat_price_usd  numeric(10,2) not null default 3.00
billing_invoices  id, org_id, period_start, period_end, seat_count,
                  unit_price_usd, amount_usd, status, issued_at, paid_at
billing_payments  id, invoice_id, org_id, method, amount_usd, reference,
                  payer_phone, status, recorded_by, created_at
```

`seat_price_usd` per org rather than a constant, so a negotiated rate never means
a code change. Default 3.00, so nothing needs backfilling.

`status` on invoices: `draft` / `issued` / `paid` / `void`. On payments:
`pending` / `confirmed` / `failed`.

### Access — the one place staff get nothing

Unlike every other table in this schema, **staff and managers get no read at
all**. What an org pays is not workforce information.

- `super_admin` — full read and write, all orgs. Issues invoices, confirms payments.
- `org_admin` — reads their own org's invoices and payments. May **record** a
  payment attempt; may **not** confirm one.
- everyone else — nothing.

**That last rule is per-column and needs a trigger**, because RLS grants rows and
not columns. An org admin marking their own payment `confirmed` would be marking
their own invoice paid. This is the sixth trigger in this schema for the same
reason, after 0008, 0010, 0011, 0014 and 0016.

`recorded_by` is set by the database from the authenticated caller, never
accepted from the client — the same rule 0016 applies to `decided_by`.

## The payment placeholder

An org admin sees the amount due and a **"Record M-Pesa payment"** form: phone
number and transaction code. It writes a `pending` payment and says plainly that
the vendor confirms it. Nothing is charged, no gateway is called, and **the UI
says so** — a payment button that appears to take money and does not is worse
than an honest manual step.

What a real Daraja/STK-push integration adds later: an initiate call, a callback
that flips `pending` to `confirmed`, and a reconciliation job. None of those
change the tables.

## Surfaces

**`/admin/billing`** (new route, org_admin only) — current billable seats, the
monthly amount, the counting rule in words, invoice history, and the payment
form. Staff and managers are redirected; the admin layout already sends staff to
`/dashboard`, so only the manager case is new.

**`/super/billing`** (new route, super_admin only) — every org's seat count and
monthly amount, total MRR, and which orgs are `past_due`. This is the number the
business runs on.

Route count 21 → 23.

## Testing

A pure `src/lib/billing.ts`, tested like `leave-balance.ts`:

- `isBillableSeat(employee, period)` — role and date-window rules
- `countBillableSeats(employees, period)`
- `invoiceAmount(seats, unitPrice)`
- `formatUsd(amount)`

Every test names the broken implementation it catches. Required cases: an
`org_admin` is not billable; a `super_admin` is never billable; an employee who
left before the period is not billed; one who left *during* it **is** (no
proration, counted at period end — so actually: one who left before period end is
NOT billed, and the test states which rule it is pinning); a null start date is
billable; an amount is money-rounded, not float-dusted.

## Explicitly not in this feature

Real payment capture, proration, tax/VAT, multi-currency display, dunning emails,
usage-based add-ons, and self-service plan changes. Each is its own feature and
none is needed for an org to see what it owes and record that it paid.
