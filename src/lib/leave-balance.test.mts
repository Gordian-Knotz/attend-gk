import { test } from "node:test";
import assert from "node:assert/strict";

import { countLeaveDays, buildLeaveBalances } from "./leave-balance.ts";

test("a single day is one day", () => {
  assert.equal(countLeaveDays("2026-08-12", "2026-08-12"), 1);
});

test("counts calendar days inclusive, weekends included", () => {
  // Wed 12 Aug to Sun 16 Aug 2026 — five calendar days, weekend deducted.
  assert.equal(countLeaveDays("2026-08-12", "2026-08-16"), 5);
});

test("spans a month boundary", () => {
  assert.equal(countLeaveDays("2026-08-30", "2026-09-02"), 4);
});

test("spans a leap day", () => {
  assert.equal(countLeaveDays("2028-02-27", "2028-03-01"), 4);
});

test("an end before the start counts as zero rather than negative", () => {
  assert.equal(countLeaveDays("2026-08-16", "2026-08-12"), 0);
});

test("an unparseable date counts as zero rather than NaN", () => {
  // NaN would propagate silently through a balance and render as "NaN days".
  assert.equal(countLeaveDays("not-a-date", "2026-08-12"), 0);
});

const ENTITLEMENTS = [
  { leave_type: "annual", days_granted: 21, days_carried: 3 },
];

test("remaining is granted plus carried minus approved", () => {
  const [annual] = buildLeaveBalances({
    year: 2026,
    entitlements: ENTITLEMENTS,
    requests: [
      { leave_type: "annual", start_date: "2026-08-12", end_date: "2026-08-16", status: "approved" },
    ],
  });

  assert.equal(annual.granted, 21);
  assert.equal(annual.carried, 3);
  assert.equal(annual.taken, 5);
  assert.equal(annual.remaining, 19);
});

test("pending is reported separately and does not reduce remaining", () => {
  const [annual] = buildLeaveBalances({
    year: 2026,
    entitlements: ENTITLEMENTS,
    requests: [
      { leave_type: "annual", start_date: "2026-08-12", end_date: "2026-08-16", status: "pending" },
    ],
  });

  assert.equal(annual.taken, 0);
  assert.equal(annual.pending, 5);
  assert.equal(annual.remaining, 24);
});

test("rejected and cancelled requests count for nothing", () => {
  const [annual] = buildLeaveBalances({
    year: 2026,
    entitlements: ENTITLEMENTS,
    requests: [
      { leave_type: "annual", start_date: "2026-08-12", end_date: "2026-08-16", status: "rejected" },
      { leave_type: "annual", start_date: "2026-09-01", end_date: "2026-09-02", status: "cancelled" },
    ],
  });

  assert.equal(annual.taken, 0);
  assert.equal(annual.pending, 0);
  assert.equal(annual.remaining, 24);
});

test("a type with no entitlement is tracked but not budgeted", () => {
  // This is how sick leave behaves by default: days counted, no allowance.
  // The fixture deliberately uses "compassionate" rather than "sick" — a
  // hardcoded `leaveType === "sick"` special case (which the module must not
  // contain) would fail this test, whereas it would have slipped past a
  // "sick"-only fixture.
  const balances = buildLeaveBalances({
    year: 2026,
    entitlements: ENTITLEMENTS,
    requests: [
      { leave_type: "compassionate", start_date: "2026-03-02", end_date: "2026-03-03", status: "approved" },
    ],
  });

  const compassionate = balances.find((b) => b.leaveType === "compassionate");
  assert.equal(compassionate?.taken, 2);
  assert.equal(compassionate?.granted, 0);
  assert.equal(compassionate?.remaining, null);
});

test("requests are attributed to the year their start date falls in", () => {
  const [annual] = buildLeaveBalances({
    year: 2026,
    entitlements: ENTITLEMENTS,
    requests: [
      { leave_type: "annual", start_date: "2025-12-30", end_date: "2026-01-02", status: "approved" },
    ],
  });

  // Starts in 2025, so it belongs to 2025's balance, not 2026's.
  assert.equal(annual.taken, 0);
});

test("an entitlement with no requests still appears, so a balance is visible from day one", () => {
  const balances = buildLeaveBalances({ year: 2026, entitlements: ENTITLEMENTS, requests: [] });
  assert.equal(balances.length, 1);
  assert.equal(balances[0].remaining, 24);
});

test("a request with an unparseable date is ignored, not counted as a year zero", () => {
  // The first draft of this module guarded with `utcMidnight(x) !== NaN`, which
  // is always true because NaN is not equal to itself — so a malformed date fell
  // through to the year check and could be silently attributed or dropped
  // depending on the string. This test is the one that catches that mistake.
  const [annual] = buildLeaveBalances({
    year: 2026,
    entitlements: ENTITLEMENTS,
    requests: [
      { leave_type: "annual", start_date: "garbage", end_date: "2026-08-16", status: "approved" },
    ],
  });

  assert.equal(annual.taken, 0);
  assert.equal(annual.remaining, 24);
});

test("ordering follows the declared TYPE_ORDER, not the alphabet", () => {
  // sick and compassionate are the discriminating pair: TYPE_ORDER places
  // sick before compassionate, but the alphabet disagrees (compassionate <
  // sick). Plain alphabetical sorting would produce the opposite order and
  // fail this test.
  const balances = buildLeaveBalances({
    year: 2026,
    entitlements: [
      { leave_type: "compassionate", days_granted: 0, days_carried: 0 },
      { leave_type: "sick", days_granted: 0, days_carried: 0 },
    ],
    requests: [],
  });
  assert.deepEqual(balances.map((b) => b.leaveType), ["sick", "compassionate"]);
});

test("a numeric column arriving as a string still adds as a number", () => {
  // Supabase returns a `numeric(5,1)` column as a string, not a number. If
  // days_granted/days_carried weren't wrapped in Number(...), "21" + "3"
  // would concatenate to "213" instead of summing to 24.
  const balances = buildLeaveBalances({
    year: 2026,
    entitlements: [
      { leave_type: "annual", days_granted: "21" as unknown as number, days_carried: "3" as unknown as number },
    ],
    requests: [],
  });
  assert.equal(balances[0].remaining, 24);
});
