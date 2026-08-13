import { History, CalendarDays } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";
import {
  DISPLAY_LOCALE,
  ORG_TIME_ZONE,
  formatTime,
  wallClockIn,
  zonedWallClockToUtc,
} from "@/lib/timezone";
import { localDateKey, ABSENT_CUTOFF_HOUR } from "@/lib/attendance-series";
import { classifyCheckIn } from "@/lib/attendance";
import type { AttendanceCheckIn } from "@/lib/attendance-calendar";
import { AttendanceMonthCalendar } from "@/components/attendance/month-calendar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/callout";

/**
 * `/dashboard/attendance`: this month's attendance calendar, then the last
 * 30 days of check-ins as a list, up to 50 rows.
 *
 * Signed-in / employee-row / suspended-org guards all live in the layout —
 * this only runs once `getEmployeeContext` has already returned non-null.
 */
export default async function AttendancePage() {
  const supabase = await createClient();
  const employee = await getEmployeeContext();
  if (!employee) return null;

  const now = new Date();
  const today = localDateKey(now);
  const [year, month] = today.split("-").map(Number);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonthStart =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  // The org's midnight, not UTC midnight — a `Z`-suffixed string here would
  // shift the boundary by the org's UTC offset, misfiling a check-in near
  // midnight into the wrong month.
  const [msY, msM, msD] = monthStart.split("-").map(Number);
  const [nmY, nmM, nmD] = nextMonthStart.split("-").map(Number);
  const monthStartUtc = zonedWallClockToUtc(msY, msM, msD, 0, 0);
  const nextMonthStartUtc = zonedWallClockToUtc(nmY, nmM, nmD, 0, 0);

  const [eventsRes, monthEventsRes, monthLeaveRes] = await Promise.all([
    supabase
      .from("attendance_events")
      .select("id, event_type, occurred_at")
      .eq("employee_id", employee.id)
      .gte("occurred_at", thirtyDaysAgo.toISOString())
      .order("occurred_at", { ascending: false })
      .limit(50),
    // A separate read from the 30-day list above: the calendar needs every
    // check-in for the calendar MONTH, which can reach further back (or not
    // as far) than a rolling 30 days depending on where today falls.
    supabase
      .from("attendance_events")
      .select("event_type, occurred_at")
      .eq("employee_id", employee.id)
      .eq("event_type", "check_in")
      .gte("occurred_at", monthStartUtc.toISOString())
      .lt("occurred_at", nextMonthStartUtc.toISOString()),
    supabase
      .from("leave_requests")
      .select("start_date, end_date, status")
      .eq("employee_id", employee.id)
      .eq("status", "approved")
      .lte("start_date", `${nextMonthStart}`)
      .gte("end_date", monthStart),
  ]);

  const { data: events, error } = eventsRes;

  // Reports its own failure — an empty state here would tell someone their
  // history is clean when the query actually errored.
  const eventsFailed = Boolean(error);
  const calendarFailed = Boolean(monthEventsRes.error || monthLeaveRes.error);

  // Earliest check-in per day, classified the same way the trend chart on
  // /admin/reports classifies one — one implementation of "late", not two.
  const checkInByDay = new Map<string, string>();
  for (const ev of monthEventsRes.data ?? []) {
    const key = localDateKey(new Date(ev.occurred_at));
    const existing = checkInByDay.get(key);
    if (!existing || ev.occurred_at < existing) {
      checkInByDay.set(key, ev.occurred_at);
    }
  }
  const checkIns: AttendanceCheckIn[] = [...checkInByDay.entries()].map(([date, iso]) => ({
    date,
    status: classifyCheckIn(iso),
  }));

  const todaySettled = wallClockIn(now).hour >= ABSENT_CUTOFF_HOUR;

  return (
    <div className="flex flex-col gap-3">
      <Card id="calendar">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Attendance calendar</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {calendarFailed ? (
            <Callout variant="note" label="Calendar unavailable">
              This month&apos;s attendance couldn&apos;t be loaded. Your history
              below is unaffected.
            </Callout>
          ) : (
            <AttendanceMonthCalendar
              year={year}
              month={month}
              checkIns={checkIns}
              leave={monthLeaveRes.data ?? []}
              today={today}
              todaySettled={todaySettled}
            />
          )}
        </CardContent>
      </Card>

      <Card id="history">
        <CardHeader>
          <div className="flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Attendance history</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
        {eventsFailed ? (
          <p className="py-4 text-center text-sm text-destructive">
            Couldn&apos;t load your attendance history.
          </p>
        ) : (
          (!events || events.length === 0) && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No check-ins in the last 30 days yet.
            </p>
          )
        )}
        {events?.map((ev) => (
          <div
            key={ev.id}
            className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-0"
          >
            <span>
              {new Date(ev.occurred_at).toLocaleDateString(DISPLAY_LOCALE, {
                weekday: "short",
                month: "short",
                day: "numeric",
                timeZone: ORG_TIME_ZONE,
              })}
            </span>
            <span className="flex items-center gap-2">
              <Badge variant={ev.event_type === "check_in" ? "attention" : "outline"}>
                {ev.event_type === "check_in" ? "In" : "Out"}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">
                {formatTime(ev.occurred_at)}
              </span>
            </span>
          </div>
        ))}
        </CardContent>
      </Card>
    </div>
  );
}
