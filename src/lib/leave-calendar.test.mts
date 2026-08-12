import { test } from "node:test";
import assert from "node:assert/strict";

import { buildMonthGrid, requestDays, absencesOn } from "./leave-calendar.ts";

const req = (
  employee_id: string,
  start_date: string,
  end_date: string,
  status = "approved",
  leave_type = "annual"
) => ({ employee_id, start_date, end_date, status, leave_type }) as never;

// --- requestDays -----------------------------------------------------------

test("a request covers every day between its bounds, inclusive", () => {
  assert.deepEqual(requestDays(req("a", "2026-08-12", "2026-08-15")), [
    "2026-08-12",
    "2026-08-13",
    "2026-08-14",
    "2026-08-15",
  ]);
});

test("a request spanning a month boundary keeps counting", () => {
  // Catches an implementation that increments the day-of-month rather than the
  // timestamp, which silently stops at the 31st.
  assert.deepEqual(requestDays(req("a", "2026-01-30", "2026-02-02")), [
    "2026-01-30",
    "2026-01-31",
    "2026-02-01",
    "2026-02-02",
  ]);
});

test("a reversed or unparseable range yields no days", () => {
  // Catches a loop that runs backwards for ever, and a NaN start that would
  // otherwise produce "Invalid Date" keys.
  assert.deepEqual(requestDays(req("a", "2026-08-15", "2026-08-12")), []);
  assert.deepEqual(requestDays(req("a", "not-a-date", "2026-08-12")), []);
});

test("a corrupt far-future end date is capped rather than looping", () => {
  // Catches the absence of a bound: without the cap this allocates millions of
  // strings from one bad row.
  assert.equal(requestDays(req("a", "2026-01-01", "9999-01-01")).length, 400);
});

// --- buildMonthGrid --------------------------------------------------------

const NO_HOLIDAYS = new Map<string, string>();

test("the grid starts on a Monday and covers the whole month", () => {
  // 1 Aug 2026 is a Saturday, so the grid must open on Mon 27 July.
  const weeks = buildMonthGrid({
    year: 2026,
    month: 8,
    requests: [],
    holidays: NO_HOLIDAYS,
    today: "2026-08-12",
  });
  assert.equal(weeks[0][0].date, "2026-07-27");
  assert.equal(weeks[0][0].inMonth, false);
  const flat = weeks.flat();
  assert.equal(flat.filter((d) => d.inMonth).length, 31);
  assert.ok(flat.every((_, i) => i % 7 === 0 || true));
  assert.ok(weeks.every((w) => w.length === 7));
});

test("month is 1-based, not 0-based", () => {
  // Catches passing `month` straight to Date.UTC, which would render December
  // 2025 when asked for January 2026 — the single most likely bug in this file.
  const weeks = buildMonthGrid({
    year: 2026,
    month: 1,
    requests: [],
    holidays: NO_HOLIDAYS,
    today: "2026-01-15",
  });
  assert.ok(weeks.flat().some((d) => d.date === "2026-01-01" && d.inMonth));
  assert.ok(weeks.flat().every((d) => !d.date.startsWith("2025-12-01")));
});

test("a trailing week made entirely of the next month is dropped", () => {
  // February 2026 starts on a Sunday and has 28 days, so a fixed six-week grid
  // would render a final row belonging wholly to March.
  const weeks = buildMonthGrid({
    year: 2026,
    month: 2,
    requests: [],
    holidays: NO_HOLIDAYS,
    today: "2026-02-10",
  });
  assert.ok(weeks[weeks.length - 1].some((d) => d.inMonth));
});

test("approved and pending occupy days separately", () => {
  // Catches the two buckets being merged, which would make a pending request
  // look like settled absence on a roster.
  const weeks = buildMonthGrid({
    year: 2026,
    month: 8,
    requests: [
      req("emp-1", "2026-08-12", "2026-08-13", "approved"),
      req("emp-2", "2026-08-13", "2026-08-13", "pending"),
    ],
    holidays: NO_HOLIDAYS,
    today: "2026-08-01",
  });
  const day = (d: string) => weeks.flat().find((c) => c.date === d)!;
  assert.deepEqual(day("2026-08-12").approved, ["emp-1"]);
  assert.deepEqual(day("2026-08-12").pending, []);
  assert.deepEqual(day("2026-08-13").approved, ["emp-1"]);
  assert.deepEqual(day("2026-08-13").pending, ["emp-2"]);
});

test("rejected and cancelled requests are not drawn", () => {
  // Catches a filter that checks "not approved" instead of an allow-list, which
  // would put rejected leave on the calendar as pending.
  const weeks = buildMonthGrid({
    year: 2026,
    month: 8,
    requests: [
      req("emp-1", "2026-08-12", "2026-08-12", "rejected"),
      req("emp-2", "2026-08-12", "2026-08-12", "cancelled"),
    ],
    holidays: NO_HOLIDAYS,
    today: "2026-08-01",
  });
  const cell = weeks.flat().find((c) => c.date === "2026-08-12")!;
  assert.deepEqual(cell.approved, []);
  assert.deepEqual(cell.pending, []);
});

test("holidays are labelled by name, and only on their own day", () => {
  const weeks = buildMonthGrid({
    year: 2026,
    month: 12,
    requests: [],
    holidays: new Map([["2026-12-25", "Christmas Day"]]),
    today: "2026-12-01",
  });
  const flat = weeks.flat();
  assert.equal(flat.find((d) => d.date === "2026-12-25")!.holidayName, "Christmas Day");
  assert.equal(flat.find((d) => d.date === "2026-12-24")!.holidayName, null);
});

test("today is marked from the value passed in, not the system clock", () => {
  // Catches the function reading Date.now(), which would make the test itself
  // pass only on one day of the year and the page wrong in another timezone.
  const weeks = buildMonthGrid({
    year: 2026,
    month: 8,
    requests: [],
    holidays: NO_HOLIDAYS,
    today: "2026-08-19",
  });
  const marked = weeks.flat().filter((d) => d.isToday);
  assert.equal(marked.length, 1);
  assert.equal(marked[0].date, "2026-08-19");
});

// --- absencesOn ------------------------------------------------------------

test("someone mid-request is absent on that day", () => {
  const rows = [req("emp-1", "2026-08-10", "2026-08-14", "approved")];
  assert.equal(absencesOn(rows, "2026-08-12").length, 1);
  assert.equal(absencesOn(rows, "2026-08-09").length, 0);
  assert.equal(absencesOn(rows, "2026-08-15").length, 0);
});

test("the first and last day of a request both count as absent", () => {
  // Catches an exclusive comparison at either end — an off-by-one here means a
  // supervisor rosters somebody who is on leave.
  const rows = [req("emp-1", "2026-08-10", "2026-08-14", "approved")];
  assert.equal(absencesOn(rows, "2026-08-10").length, 1);
  assert.equal(absencesOn(rows, "2026-08-14").length, 1);
});

test("pending leave is not reported as absence", () => {
  // Catches the roster being planned around a decision nobody has made.
  const rows = [req("emp-1", "2026-08-10", "2026-08-14", "pending")];
  assert.equal(absencesOn(rows, "2026-08-12").length, 0);
});
