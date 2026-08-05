import { classifyCheckIn } from "./attendance";
import {
  localDateKey,
  type SeriesEvent,
  type SeriesLeave,
} from "./attendance-series";

export type TimesheetRow = {
  employeeId: string;
  fullName: string;
  siteName: string;
  daysPresent: number;
  daysLate: number;
  daysOnLeave: number;
  daysAbsent: number;
  hoursWorked: number;
};

/**
 * Pairs check_in/check_out events into worked hours, per employee per day.
 *
 * Unmatched events are skipped rather than guessed at: a check-in with no
 * check-out contributes a present day but zero hours. That undercounts
 * rather than inventing a shift length, which is the safer direction for
 * anything that feeds payroll.
 */
export function buildTimesheet({
  employees,
  siteNameById,
  events,
  leave,
  days,
}: {
  employees: { id: string; full_name: string; site_id: string | null }[];
  siteNameById: Map<string, string>;
  events: SeriesEvent[];
  leave: SeriesLeave[];
  days: Date[];
}): TimesheetRow[] {
  const dayKeys = days.map(localDateKey);
  const dayKeySet = new Set(dayKeys);

  // employee -> day -> events (already time-ordered by the caller's query)
  const byEmployeeDay = new Map<string, Map<string, SeriesEvent[]>>();
  for (const ev of events) {
    const dayKey = localDateKey(new Date(ev.occurred_at));
    if (!dayKeySet.has(dayKey)) continue;

    let forEmployee = byEmployeeDay.get(ev.employee_id);
    if (!forEmployee) {
      forEmployee = new Map();
      byEmployeeDay.set(ev.employee_id, forEmployee);
    }
    const bucket = forEmployee.get(dayKey);
    if (bucket) bucket.push(ev);
    else forEmployee.set(dayKey, [ev]);
  }

  return employees.map((employee) => {
    const forEmployee = byEmployeeDay.get(employee.id) ?? new Map();

    let daysPresent = 0;
    let daysLate = 0;
    let daysOnLeave = 0;
    let daysAbsent = 0;
    let minutesWorked = 0;

    for (const dayKey of dayKeys) {
      const dayEvents: SeriesEvent[] = (forEmployee.get(dayKey) ?? []).slice();
      dayEvents.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

      const checkIns = dayEvents.filter((e) => e.event_type === "check_in");

      if (checkIns.length > 0) {
        if (classifyCheckIn(checkIns[0].occurred_at) === "late") daysLate++;
        else daysPresent++;

        let openedAt: string | null = null;
        for (const ev of dayEvents) {
          if (ev.event_type === "check_in") {
            if (openedAt === null) openedAt = ev.occurred_at;
          } else if (ev.event_type === "check_out" && openedAt !== null) {
            minutesWorked +=
              (new Date(ev.occurred_at).getTime() -
                new Date(openedAt).getTime()) /
              60000;
            openedAt = null;
          }
        }
        continue;
      }

      const onLeave = leave.some(
        (l) =>
          l.employee_id === employee.id &&
          l.start_date <= dayKey &&
          l.end_date >= dayKey
      );
      if (onLeave) daysOnLeave++;
      else daysAbsent++;
    }

    return {
      employeeId: employee.id,
      fullName: employee.full_name,
      siteName: employee.site_id
        ? (siteNameById.get(employee.site_id) ?? "—")
        : "—",
      daysPresent,
      daysLate,
      daysOnLeave,
      daysAbsent,
      hoursWorked: Math.round((minutesWorked / 60) * 100) / 100,
    };
  });
}

export function timesheetToCsv(rows: TimesheetRow[], periodLabel: string): string {
  const header = [
    "Employee",
    "Site",
    "Days present",
    "Days late",
    "Days on leave",
    "Days absent",
    "Hours worked",
    "Period",
  ];

  const escape = (value: string | number) => {
    const s = String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = rows.map((r) =>
    [
      r.fullName,
      r.siteName,
      r.daysPresent,
      r.daysLate,
      r.daysOnLeave,
      r.daysAbsent,
      r.hoursWorked.toFixed(2),
      periodLabel,
    ]
      .map(escape)
      .join(",")
  );

  return [header.join(","), ...lines].join("\r\n");
}
