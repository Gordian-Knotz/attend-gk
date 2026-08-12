import { test } from "node:test";
import assert from "node:assert/strict";

import {
  countLeaveDays,
  buildLeaveBalances,
  compareLeaveTypes,
  accruedDays,
} from "./leave-balance.ts";

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

test("compareLeaveTypes: annual first, unknown types after the declared four, then alphabetical", () => {
  // Exported so the admin utilization table and the staff balance card sort
  // the same way without either one re-declaring the order. This test
  // fails if the comparator regresses to plain alphabetical (annual would
  // land after "an-unlisted-type"), if an unlisted type sorts ahead of a
  // declared one, or if the within-group alphabetical fallback breaks.
  const types = ["unpaid", "an-unlisted-type", "sick", "annual", "compassionate"];
  assert.deepEqual(
    [...types].sort(compareLeaveTypes),
    ["annual", "sick", "compassionate", "unpaid", "an-unlisted-type"]
  );
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

// --- Public holidays -------------------------------------------------------
// Each of these names the broken implementation it catches. This plan has
// already shipped six assertions that could not fail; a holiday test that still
// passes when holidays are ignored would be the seventh.

test("a holiday inside the range takes a day off the charge", () => {
  // Catches: holidays being accepted and then ignored. The same range without
  // the holiday is asserted alongside, so the test cannot pass unless the
  // parameter is what made the difference.
  const withHoliday = countLeaveDays(
    "2026-08-12",
    "2026-08-16",
    new Set(["2026-08-14"])
  );
  const without = countLeaveDays("2026-08-12", "2026-08-16", new Set());
  assert.equal(without, 5);
  assert.equal(withHoliday, 4);
});

test("a holiday outside the range changes nothing", () => {
  // Catches: subtracting the size of the holiday set, or any filter that looks
  // at holidays for the whole year rather than the days actually requested.
  assert.equal(
    countLeaveDays("2026-08-12", "2026-08-16", new Set(["2026-12-25", "2026-01-01"])),
    5
  );
});

test("a holiday on a weekend is deducted once, not twice", () => {
  // Weekends are NOT excluded — only holidays were. 15 Aug 2026 is a Saturday,
  // so a holiday that day must remove exactly one day. Catches an
  // implementation that tries to reconcile the two rules and double-counts, and
  // proves the two remain independent.
  assert.equal(
    countLeaveDays("2026-08-14", "2026-08-17", new Set(["2026-08-15"])),
    3
  );
});

test("a request made entirely of holidays costs nothing", () => {
  // Catches an off-by-one that leaves a floor of 1, and confirms the subtraction
  // cannot go negative for a legitimate range.
  assert.equal(
    countLeaveDays("2026-12-25", "2026-12-26", new Set(["2026-12-25", "2026-12-26"])),
    0
  );
});

test("holidays reduce days taken in a full balance, not just the day count", () => {
  // Catches the parameter being threaded into countLeaveDays but not through
  // buildLeaveBalances — the two are separate wiring mistakes, and only this
  // one reaches the screen.
  const args = {
    year: 2026,
    entitlements: [{ leave_type: "annual", days_granted: 21, days_carried: 0 }],
    requests: [
      {
        leave_type: "annual",
        start_date: "2026-12-24",
        end_date: "2026-12-26",
        status: "approved",
      },
    ],
  };
  const plain = buildLeaveBalances(args);
  const withHolidays = buildLeaveBalances({
    ...args,
    holidays: new Set(["2026-12-25", "2026-12-26"]),
  });
  assert.equal(plain[0].taken, 3);
  assert.equal(plain[0].remaining, 18);
  assert.equal(withHolidays[0].taken, 1);
  assert.equal(withHolidays[0].remaining, 20);
});

// --- Accrual ---------------------------------------------------------------

test("annual mode ignores the month entirely", () => {
  // Catches accrual being applied to everyone rather than only to opted-in
  // policies — the failure that would silently cut every org's allowance.
  assert.equal(accruedDays(21, "annual", 1), 21);
  assert.equal(accruedDays(21, "annual", 7), 21);
});

test("monthly mode earns one twelfth per COMPLETED month", () => {
  // January: nothing completed yet, so nothing earned. Crediting the current
  // month on the 1st would let someone take leave they have not worked for.
  assert.equal(accruedDays(12, "monthly", 1), 0);
  assert.equal(accruedDays(12, "monthly", 2), 1);
  assert.equal(accruedDays(12, "monthly", 7), 6);
  assert.equal(accruedDays(12, "monthly", 12), 11);
});

test("monthly accrual rounds to one decimal, matching numeric(5,1)", () => {
  // 21/12 = 1.75 a month. Three completed months is 5.25, which must not reach
  // a payslip as 5.249999999999999.
  assert.equal(accruedDays(21, "monthly", 4), 5.3);
  assert.equal(accruedDays(21, "monthly", 5), 7);
});

test("a month outside 1-12 is clamped, never negative or over-credited", () => {
  // Catches a caller deriving the month wrongly — 0-based is the classic — and
  // being silently handed a negative allowance.
  assert.equal(accruedDays(12, "monthly", 0), 0);
  assert.equal(accruedDays(12, "monthly", -5), 0);
  assert.equal(accruedDays(12, "monthly", 99), 12);
});

test("accrual reduces granted in a full balance, and only for the opted-in type", () => {
  // Catches the accrual map being accepted but never consulted, and catches it
  // being applied to every type rather than the ones configured for it.
  const balances = buildLeaveBalances({
    year: 2026,
    entitlements: [
      { leave_type: "annual", days_granted: 24, days_carried: 0 },
      { leave_type: "compassionate", days_granted: 12, days_carried: 0 },
    ],
    requests: [],
    accrual: new Map([["annual", "monthly" as const]]),
    asOfMonth: 4,
  });
  const byType = Object.fromEntries(balances.map((b) => [b.leaveType, b]));
  assert.equal(byType.annual.granted, 6);
  assert.equal(byType.compassionate.granted, 12);
});

test("carried days are never accrued away", () => {
  // Days earned in a previous year are available in full on 1 January.
  // Accruing them would take back leave somebody had already worked for.
  const balances = buildLeaveBalances({
    year: 2026,
    entitlements: [{ leave_type: "annual", days_granted: 24, days_carried: 5 }],
    requests: [],
    accrual: new Map([["annual", "monthly" as const]]),
    asOfMonth: 1,
  });
  assert.equal(balances[0].granted, 0);
  assert.equal(balances[0].carried, 5);
  assert.equal(balances[0].remaining, 5);
});
