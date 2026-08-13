import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isBillableSeat,
  countBillableSeats,
  invoiceAmount,
  formatUsd,
  currentBillingPeriod,
} from "./billing.ts";

const AUGUST = { periodStart: "2026-08-01", periodEnd: "2026-08-31" };

test("staff and manager are billable seats", () => {
  assert.equal(
    isBillableSeat({ role: "staff", employment_start_date: null, employment_end_date: null }, AUGUST),
    true
  );
  assert.equal(
    isBillableSeat({ role: "manager", employment_start_date: null, employment_end_date: null }, AUGUST),
    true
  );
});

test("an org_admin is not a billable seat — they are the buyer", () => {
  assert.equal(
    isBillableSeat({ role: "org_admin", employment_start_date: null, employment_end_date: null }, AUGUST),
    false
  );
});

test("a super_admin is never a billable seat, in any org", () => {
  assert.equal(
    isBillableSeat({ role: "super_admin", employment_start_date: null, employment_end_date: null }, AUGUST),
    false
  );
});

test("a null start date is billable — employed for the whole window", () => {
  assert.equal(
    isBillableSeat(
      { role: "staff", employment_start_date: null, employment_end_date: null },
      AUGUST
    ),
    true
  );
});

test("an employee who left before the period is not billed", () => {
  // Departed 15 July, well before the August window opens.
  assert.equal(
    isBillableSeat(
      { role: "staff", employment_start_date: null, employment_end_date: "2026-07-15" },
      AUGUST
    ),
    false
  );
});

test("an employee who left during the period IS billed — no proration", () => {
  // This pins the spec's precise rule, not its own confused restatement of
  // it: employment_end_date only has to be >= period_start, not >= period_end.
  // Someone who departs on 10 August still overlapped August, so August is
  // billed in full. They would NOT be billed for September, because by
  // September's period_start their end date is already in the past.
  assert.equal(
    isBillableSeat(
      { role: "staff", employment_start_date: null, employment_end_date: "2026-08-10" },
      AUGUST
    ),
    true
  );
  assert.equal(
    isBillableSeat(
      { role: "staff", employment_start_date: null, employment_end_date: "2026-08-10" },
      { periodStart: "2026-09-01", periodEnd: "2026-09-30" }
    ),
    false
  );
});

test("an employee who starts after the period is not billed", () => {
  assert.equal(
    isBillableSeat(
      { role: "staff", employment_start_date: "2026-09-01", employment_end_date: null },
      AUGUST
    ),
    false
  );
});

test("boundary: leaving exactly on period_start still counts", () => {
  assert.equal(
    isBillableSeat(
      { role: "staff", employment_start_date: null, employment_end_date: "2026-08-01" },
      AUGUST
    ),
    true
  );
});

test("boundary: leaving one day before period_start does not count", () => {
  assert.equal(
    isBillableSeat(
      { role: "staff", employment_start_date: null, employment_end_date: "2026-07-31" },
      AUGUST
    ),
    false
  );
});

test("countBillableSeats counts only billable roles within the window", () => {
  const employees = [
    { role: "staff", employment_start_date: null, employment_end_date: null },
    { role: "manager", employment_start_date: null, employment_end_date: null },
    { role: "org_admin", employment_start_date: null, employment_end_date: null },
    { role: "super_admin", employment_start_date: null, employment_end_date: null },
    { role: "staff", employment_start_date: null, employment_end_date: "2026-07-01" },
  ];
  assert.equal(countBillableSeats(employees, AUGUST), 2);
});

test("invoiceAmount is money-rounded, not float-dusted", () => {
  // The classic float-dust case: 0.1 + 0.1 + 0.1 !== 0.3 in IEEE 754.
  assert.equal(invoiceAmount(3, 0.1), 0.3);
  assert.equal(invoiceAmount(32, 3), 96);
  assert.equal(invoiceAmount(7, 29.99), 209.93);
});

test("invoiceAmount rounds to the nearest cent", () => {
  assert.equal(invoiceAmount(1, 3.005), 3.01);
});

test("invoiceAmount survives a near-miss IEEE 754 boundary", () => {
  // 1 * 1.005 * 100 === 100.49999999999999 in IEEE 754, one ULP short of the
  // 100.5 the decimal math implies — a plain Math.round truncates this to
  // $1.00 without the Number.EPSILON nudge.
  assert.equal(invoiceAmount(1, 1.005), 1.01);
});

test("formatUsd renders as a dollar amount with two decimal places", () => {
  assert.equal(formatUsd(96), "$96.00");
  assert.equal(formatUsd(209.93), "$209.93");
  assert.equal(formatUsd(0), "$0.00");
});

test("currentBillingPeriod spans the whole calendar month", () => {
  assert.deepEqual(currentBillingPeriod("2026-08-13"), {
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
  });
});

test("currentBillingPeriod handles a 30-day month", () => {
  assert.deepEqual(currentBillingPeriod("2026-09-05"), {
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
  });
});

test("currentBillingPeriod handles February in a leap year", () => {
  assert.deepEqual(currentBillingPeriod("2028-02-10"), {
    periodStart: "2028-02-01",
    periodEnd: "2028-02-29",
  });
});
