import { classifyCheckIn } from "./attendance";
import {
  DISPLAY_LOCALE,
  ORG_TIME_ZONE,
  wallClockIn,
  zonedDateKey,
  zonedWallClockToUtc,
} from "./timezone";

export type TrendPoint = {
  label: string;
  present: number;
  late: number;
  absent: number;
};

export type SeriesEvent = {
  employee_id: string;
  event_type: string;
  occurred_at: string;
};

export type SeriesLeave = {
  employee_id: string;
  start_date: string;
  end_date: string;
};

/**
 * `YYYY-MM-DD` as read in the organization's timezone, so day bucketing
 * matches what an admin in Nairobi sees on the wall clock.
 *
 * This used to use the *server's* local date. That is correct on a laptop
 * in Nairobi and wrong on a host anywhere else — a punch at 01:30 local
 * would fall into the previous day's bar on a UTC host, which is precisely
 * the bug the original UTC-slicing version was written to fix.
 */
export function localDateKey(d: Date, timeZone: string = ORG_TIME_ZONE): string {
  return zonedDateKey(d, timeZone);
}

/** The last `count` days ending today, oldest first, each at midnight in
 *  the organization's timezone. */
export function recentDays(
  count: number,
  now = new Date(),
  timeZone: string = ORG_TIME_ZONE
): Date[] {
  const [year, month, day] = zonedDateKey(now, timeZone).split("-").map(Number);
  const days: Date[] = [];

  for (let i = count - 1; i >= 0; i--) {
    // Step back whole calendar days on a UTC probe, then re-anchor to
    // midnight in the target zone. Stepping a Date directly would drift
    // across a DST boundary.
    const probe = new Date(Date.UTC(year, month - 1, day) - i * 86_400_000);
    days.push(
      zonedWallClockToUtc(
        probe.getUTCFullYear(),
        probe.getUTCMonth() + 1,
        probe.getUTCDate(),
        0,
        0,
        timeZone
      )
    );
  }
  return days;
}

/**
 * Rolls raw check-in events into a per-day present/late/absent series.
 *
 * Caveat worth knowing when reading the chart: `workforceIds` is the roster
 * as it stands *now*, applied to every day in the window. Someone hired last
 * week therefore reads as absent on days before they joined. Fixing that
 * needs employment start/end dates on `employees`, which the schema doesn't
 * carry yet.
 */
/**
 * The absent cutoff itself, exported for the same reason as
 * `attendance.ts`'s `LATE_CUTOFF_HOUR` — so `/admin/settings` can show the
 * threshold it actually applies rather than a hand-typed copy.
 */
export const ABSENT_CUTOFF_HOUR = 9;

export function buildDailySeries({
  days,
  events,
  leave,
  workforceIds,
  now = new Date(),
  absentCutoffHour = ABSENT_CUTOFF_HOUR,
}: {
  days: Date[];
  events: SeriesEvent[];
  leave: SeriesLeave[];
  workforceIds: string[];
  now?: Date;
  absentCutoffHour?: number;
}): TrendPoint[] {
  const workforce = new Set(workforceIds);
  const todayKey = localDateKey(now);

  // day key -> employee id -> earliest check-in ISO
  const firstCheckIn = new Map<string, Map<string, string>>();
  for (const ev of events) {
    if (ev.event_type !== "check_in") continue;
    if (!workforce.has(ev.employee_id)) continue;

    const key = localDateKey(new Date(ev.occurred_at));
    let forDay = firstCheckIn.get(key);
    if (!forDay) {
      forDay = new Map();
      firstCheckIn.set(key, forDay);
    }
    const existing = forDay.get(ev.employee_id);
    if (!existing || ev.occurred_at < existing) {
      forDay.set(ev.employee_id, ev.occurred_at);
    }
  }

  return days.map((day) => {
    const key = localDateKey(day);
    const checkIns = firstCheckIn.get(key) ?? new Map<string, string>();

    let present = 0;
    let late = 0;
    for (const iso of checkIns.values()) {
      if (classifyCheckIn(iso) === "late") late++;
      else present++;
    }

    // Someone who was on approved leave but turned up and clocked in is
    // counted once, as present. Counting them in both sets subtracted them
    // from the roster twice and under-reported absences.
    const onLeave = new Set(
      leave
        .filter(
          (l) =>
            workforce.has(l.employee_id) &&
            !checkIns.has(l.employee_id) &&
            l.start_date <= key &&
            l.end_date >= key
        )
        .map((l) => l.employee_id)
    ).size;

    // Don't brand today's roster absent before the cutoff has passed —
    // it would show a phantom spike every morning.
    const settled =
      key !== todayKey || wallClockIn(now).hour >= absentCutoffHour;
    const absent = settled
      ? Math.max(0, workforce.size - checkIns.size - onLeave)
      : 0;

    return {
      label: day.toLocaleDateString(DISPLAY_LOCALE, {
        day: "numeric",
        month: "short",
        timeZone: ORG_TIME_ZONE,
      }),
      present,
      late,
      absent,
    };
  });
}
