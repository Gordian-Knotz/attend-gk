/**
 * Month grids for the leave calendar, and "who is off" lists.
 *
 * Pure, like `leave-balance.ts` and for the same reason: date arithmetic is the
 * single easiest thing to get subtly wrong here, and it should be testable
 * under `node --test` with no database and no browser.
 *
 * All differencing is done on UTC midnights. `src/lib/timezone.ts` exists
 * because everything time-related once ran on the server's timezone; a calendar
 * that shifts by a day when the host moves is the same bug wearing a different
 * hat.
 */

import type { LeaveRequestRow } from "./leave-balance";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Statuses that occupy a day on the calendar. Nothing else is drawn. */
const VISIBLE_STATUSES = new Set(["approved", "pending"]);

export type CalendarDay = {
  /** `YYYY-MM-DD`. */
  date: string;
  /** False for the leading/trailing days borrowed from adjacent months. */
  inMonth: boolean;
  isToday: boolean;
  holidayName: string | null;
  /** Employee ids on approved leave that day. Ids, not a count, so the caller can name them. */
  approved: string[];
  pending: string[];
};

function utcMidnight(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return Number.NaN;
  const [, y, m, d] = match;
  return Date.UTC(Number(y), Number(m) - 1, Number(d));
}

function key(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/**
 * Every `YYYY-MM-DD` a request covers, inclusive.
 *
 * Returns an empty array for an unparseable or reversed range rather than
 * throwing or producing a runaway loop — the same posture `countLeaveDays`
 * takes, and the reason is identical: bad data should cost a missing entry, not
 * a crashed page. The span is also capped, because a corrupt end date of the
 * year 9999 would otherwise allocate millions of strings before anyone noticed.
 */
export function requestDays(request: LeaveRequestRow, maxDays = 400): string[] {
  const start = utcMidnight(request.start_date);
  const end = utcMidnight(request.end_date);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return [];

  const days: string[] = [];
  for (let t = start; t <= end && days.length < maxDays; t += DAY_MS) {
    days.push(key(t));
  }
  return days;
}

/**
 * A month as weeks of seven days, Monday first.
 *
 * `holidays` maps `YYYY-MM-DD` to the holiday's name so the grid can label it,
 * rather than only knowing that the day is special.
 */
export function buildMonthGrid(input: {
  year: number;
  /** 1-12, not the 0-11 that `Date` uses. Passing 0 here is the classic bug. */
  month: number;
  requests: LeaveRequestRow[];
  holidays: Map<string, string>;
  /** `YYYY-MM-DD` in the org's timezone. Passed in, never read from the clock. */
  today: string;
}): CalendarDay[][] {
  const { year, month, requests, holidays, today } = input;

  const firstOfMonth = Date.UTC(year, month - 1, 1);
  const monthPrefix = key(firstOfMonth).slice(0, 7);

  // getUTCDay is 0=Sunday. Shift so Monday is 0, because a week that starts on
  // Sunday puts the weekend either side of the working days and reads badly for
  // a roster.
  const leading = (new Date(firstOfMonth).getUTCDay() + 6) % 7;
  const gridStart = firstOfMonth - leading * DAY_MS;

  // Occupancy is built once for the whole month rather than re-scanned per
  // cell: a naive implementation is O(days x requests) and this is O(requests).
  const approvedBy = new Map<string, string[]>();
  const pendingBy = new Map<string, string[]>();

  for (const request of requests) {
    if (!VISIBLE_STATUSES.has(request.status)) continue;
    const target = request.status === "approved" ? approvedBy : pendingBy;
    const who = (request as LeaveRequestRow & { employee_id?: string }).employee_id ?? "";

    for (const day of requestDays(request)) {
      const list = target.get(day);
      if (list) list.push(who);
      else target.set(day, [who]);
    }
  }

  const weeks: CalendarDay[][] = [];
  let cursor = gridStart;

  // Six weeks covers every month layout including a 31-day month starting on a
  // Sunday. Trailing all-out-of-month weeks are dropped below so February does
  // not render a blank final row.
  for (let w = 0; w < 6; w += 1) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d += 1) {
      const date = key(cursor);
      week.push({
        date,
        inMonth: date.slice(0, 7) === monthPrefix,
        isToday: date === today,
        holidayName: holidays.get(date) ?? null,
        approved: approvedBy.get(date) ?? [],
        pending: pendingBy.get(date) ?? [],
      });
      cursor += DAY_MS;
    }
    weeks.push(week);
  }

  while (weeks.length > 0 && weeks[weeks.length - 1].every((day) => !day.inMonth)) {
    weeks.pop();
  }

  return weeks;
}

export type AbsenceEntry = {
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: string;
};

/**
 * Who is on approved leave on a given day.
 *
 * Pending is excluded deliberately: this list answers "who is unavailable",
 * and a supervisor building tomorrow's roster around a request nobody has
 * approved would be planning against a decision that has not been made.
 */
export function absencesOn(requests: LeaveRequestRow[], day: string): AbsenceEntry[] {
  const target = utcMidnight(day);
  if (Number.isNaN(target)) return [];

  return requests
    .filter((r) => {
      if (r.status !== "approved") return false;
      const start = utcMidnight(r.start_date);
      const end = utcMidnight(r.end_date);
      if (Number.isNaN(start) || Number.isNaN(end) || end < start) return false;
      return start <= target && target <= end;
    })
    .map((r) => ({
      employeeId: (r as LeaveRequestRow & { employee_id?: string }).employee_id ?? "",
      leaveType: r.leave_type,
      startDate: r.start_date,
      endDate: r.end_date,
      status: r.status,
    }));
}
