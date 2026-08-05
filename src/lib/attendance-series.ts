import { classifyCheckIn } from "./attendance";

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

/** Local-midnight `YYYY-MM-DD`, so day bucketing matches what an admin in
 *  Nairobi sees on the wall clock rather than UTC. */
export function localDateKey(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

/** The last `count` days ending today, oldest first, at local midnight. */
export function recentDays(count: number, now = new Date()): Date[] {
  const days: Date[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push(d);
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
export function buildDailySeries({
  days,
  events,
  leave,
  workforceIds,
  now = new Date(),
  absentCutoffHour = 9,
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

    const onLeave = new Set(
      leave
        .filter(
          (l) =>
            workforce.has(l.employee_id) &&
            l.start_date <= key &&
            l.end_date >= key
        )
        .map((l) => l.employee_id)
    ).size;

    // Don't brand today's roster absent before the cutoff has passed —
    // it would show a phantom spike every morning.
    const settled = key !== todayKey || now.getHours() >= absentCutoffHour;
    const absent = settled
      ? Math.max(0, workforce.size - checkIns.size - onLeave)
      : 0;

    return {
      label: day.toLocaleDateString([], { day: "numeric", month: "short" }),
      present,
      late,
      absent,
    };
  });
}
