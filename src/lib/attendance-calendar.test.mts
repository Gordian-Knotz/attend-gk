import { test } from "node:test";
import assert from "node:assert/strict";

import { buildAttendanceMonthGrid } from "./attendance-calendar.ts";

const AUGUST_LEAVE = [
  { start_date: "2026-08-12", end_date: "2026-08-14", status: "approved" },
  { start_date: "2026-08-20", end_date: "2026-08-20", status: "rejected" },
];

test("a day with an on-time check-in reads present", () => {
  const weeks = buildAttendanceMonthGrid({
    year: 2026,
    month: 8,
    checkIns: [{ date: "2026-08-03", status: "present" }],
    leave: [],
    today: "2026-08-31",
    todaySettled: true,
  });
  const day = weeks.flat().find((d) => d.date === "2026-08-03");
  assert.equal(day?.status, "present");
});

test("a day with a late check-in reads late, not present", () => {
  const weeks = buildAttendanceMonthGrid({
    year: 2026,
    month: 8,
    checkIns: [{ date: "2026-08-04", status: "late" }],
    leave: [],
    today: "2026-08-31",
    todaySettled: true,
  });
  const day = weeks.flat().find((d) => d.date === "2026-08-04");
  assert.equal(day?.status, "late");
});

test("a past day with no check-in and no leave reads absent", () => {
  const weeks = buildAttendanceMonthGrid({
    year: 2026,
    month: 8,
    checkIns: [],
    leave: [],
    today: "2026-08-31",
    todaySettled: true,
  });
  const day = weeks.flat().find((d) => d.date === "2026-08-05");
  assert.equal(day?.status, "absent");
});

test("a day inside an approved leave span reads on_leave, even with no check-in", () => {
  const weeks = buildAttendanceMonthGrid({
    year: 2026,
    month: 8,
    checkIns: [],
    leave: AUGUST_LEAVE,
    today: "2026-08-31",
    todaySettled: true,
  });
  const day = weeks.flat().find((d) => d.date === "2026-08-13");
  assert.equal(day?.status, "on_leave");
});

test("a rejected leave request does not mark a day on_leave", () => {
  const weeks = buildAttendanceMonthGrid({
    year: 2026,
    month: 8,
    checkIns: [],
    leave: AUGUST_LEAVE,
    today: "2026-08-31",
    todaySettled: true,
  });
  const day = weeks.flat().find((d) => d.date === "2026-08-20");
  assert.equal(day?.status, "absent");
});

test("checking in on an approved-leave day counts as present, not on_leave", () => {
  // Someone on leave who turns up anyway shouldn't be told they were absent
  // from work they in fact did — same reasoning buildDailySeries applies.
  const weeks = buildAttendanceMonthGrid({
    year: 2026,
    month: 8,
    checkIns: [{ date: "2026-08-12", status: "present" }],
    leave: AUGUST_LEAVE,
    today: "2026-08-31",
    todaySettled: true,
  });
  const day = weeks.flat().find((d) => d.date === "2026-08-12");
  assert.equal(day?.status, "present");
});

test("a day after today has no status — nothing has happened yet", () => {
  const weeks = buildAttendanceMonthGrid({
    year: 2026,
    month: 8,
    checkIns: [],
    leave: [],
    today: "2026-08-10",
    todaySettled: true,
  });
  const day = weeks.flat().find((d) => d.date === "2026-08-15");
  assert.equal(day?.status, null);
});

test("today reads absent once settled, but stays blank before the cutoff", () => {
  const settled = buildAttendanceMonthGrid({
    year: 2026,
    month: 8,
    checkIns: [],
    leave: [],
    today: "2026-08-10",
    todaySettled: true,
  });
  assert.equal(settled.flat().find((d) => d.date === "2026-08-10")?.status, "absent");

  const unsettled = buildAttendanceMonthGrid({
    year: 2026,
    month: 8,
    checkIns: [],
    leave: [],
    today: "2026-08-10",
    todaySettled: false,
  });
  assert.equal(unsettled.flat().find((d) => d.date === "2026-08-10")?.status, null);
});

test("weeks are Monday-first and trailing out-of-month weeks are dropped", () => {
  // August 2026's 1st is a Saturday, so the grid should lead with days
  // borrowed from late July rather than starting mid-week.
  const weeks = buildAttendanceMonthGrid({
    year: 2026,
    month: 8,
    checkIns: [],
    leave: [],
    today: "2026-08-31",
    todaySettled: true,
  });
  assert.equal(weeks[0][0].date, "2026-07-27");
  assert.equal(weeks[weeks.length - 1].some((d) => d.inMonth), true);
});

test("isToday is set on exactly the day matching `today`", () => {
  const weeks = buildAttendanceMonthGrid({
    year: 2026,
    month: 8,
    checkIns: [],
    leave: [],
    today: "2026-08-13",
    todaySettled: true,
  });
  const flagged = weeks.flat().filter((d) => d.isToday);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].date, "2026-08-13");
});
