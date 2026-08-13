/**
 * A month of one employee's attendance, as a calendar grid.
 *
 * Pure, like `leave-calendar.ts` and for the same reason: date arithmetic is
 * the single easiest thing to get subtly wrong, and it should be testable
 * under `node --test` with no database and no browser. Imports nothing —
 * the caller resolves every timezone-sensitive fact (which day a raw
 * timestamp falls on, whether a check-in was late, whether today's absent
 * cutoff has passed) before this module ever runs. That boundary is the
 * same one `leave-balance.ts` and `tenant-summary.ts` draw, and for the
 * same reason: the `@/` alias does not resolve under `node --test`.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type AttendanceCheckIn = {
  /** `YYYY-MM-DD`, already resolved to the org's timezone by the caller. */
  date: string;
  /** Already classified by the caller (`classifyCheckIn`) — this module
   *  does no timezone-aware hour comparison of its own. */
  status: "present" | "late";
};

export type AttendanceLeaveRow = {
  start_date: string;
  end_date: string;
  status: string;
};

/**
 * `null` means nothing to show yet — a day that hasn't happened, or today
 * before the absent cutoff has passed. Rendering "absent" prematurely would
 * be a false claim, the same reason `buildDailySeries` withholds it.
 */
export type AttendanceStatus = "present" | "late" | "on_leave" | "absent" | null;

export type AttendanceDay = {
  /** `YYYY-MM-DD`. */
  date: string;
  /** False for the leading/trailing days borrowed from adjacent months. */
  inMonth: boolean;
  isToday: boolean;
  status: AttendanceStatus;
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

/** Every approved leave day, as a set — mirrors `leave-calendar.ts`'s
 *  approach of building occupancy once rather than rescanning per cell. */
function approvedLeaveDays(leave: AttendanceLeaveRow[]): Set<string> {
  const days = new Set<string>();
  for (const request of leave) {
    if (request.status !== "approved") continue;
    const start = utcMidnight(request.start_date);
    const end = utcMidnight(request.end_date);
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) continue;
    for (let t = start; t <= end; t += DAY_MS) days.add(key(t));
  }
  return days;
}

export function buildAttendanceMonthGrid(input: {
  year: number;
  /** 1-12, not the 0-11 that `Date` uses. */
  month: number;
  checkIns: AttendanceCheckIn[];
  leave: AttendanceLeaveRow[];
  /** `YYYY-MM-DD` in the org's timezone. Passed in, never read from the clock. */
  today: string;
  /** Whether today's absent cutoff has already passed, per the caller's
   *  clock. Ignored for every day that isn't `today`. */
  todaySettled: boolean;
}): AttendanceDay[][] {
  const { year, month, checkIns, leave, today, todaySettled } = input;

  const checkInByDay = new Map(checkIns.map((c) => [c.date, c.status]));
  const onLeave = approvedLeaveDays(leave);

  const firstOfMonth = Date.UTC(year, month - 1, 1);
  const monthPrefix = key(firstOfMonth).slice(0, 7);

  // getUTCDay is 0=Sunday. Shift so Monday is 0 — same reasoning
  // leave-calendar.ts gives: a week split across the weekend either side of
  // the working days reads badly for a roster in this domain.
  const leading = (new Date(firstOfMonth).getUTCDay() + 6) % 7;
  const gridStart = firstOfMonth - leading * DAY_MS;

  const weeks: AttendanceDay[][] = [];
  let cursor = gridStart;

  for (let w = 0; w < 6; w += 1) {
    const week: AttendanceDay[] = [];
    for (let d = 0; d < 7; d += 1) {
      const date = key(cursor);

      let status: AttendanceStatus = null;
      if (date < today || (date === today && todaySettled)) {
        const checkIn = checkInByDay.get(date);
        if (checkIn) {
          // A check-in on an approved-leave day is still a day worked —
          // counting it as leave would tell someone they were absent from
          // work they in fact did.
          status = checkIn;
        } else if (onLeave.has(date)) {
          status = "on_leave";
        } else {
          status = "absent";
        }
      }

      week.push({
        date,
        inMonth: date.slice(0, 7) === monthPrefix,
        isToday: date === today,
        status,
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
