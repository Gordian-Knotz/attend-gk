import Link from "next/link";
import { Users } from "lucide-react";

import { getEmployeeContext } from "@/lib/supabase/employee";
import { createClient } from "@/lib/supabase/server";
import { wallClockIn, zonedWallClockToUtc } from "@/lib/timezone";
import { localDateKey, ABSENT_CUTOFF_HOUR } from "@/lib/attendance-series";
import { classifyCheckIn } from "@/lib/attendance";
import type { AttendanceCheckIn } from "@/lib/attendance-calendar";
import { AttendanceMonthCalendar } from "@/components/attendance/month-calendar";
import { PageHeader } from "@/components/admin/page-header";
import { Callout } from "@/components/callout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * `/admin/attendance`: one employee's calendar at a time, visually.
 *
 * Reads the roster through the same RLS every other `/admin` page relies
 * on — a manager naturally sees only their own site's employees here,
 * exactly as they do on `/admin/staff`, with no role branching of this
 * page's own. That's a courtesy consistent with the rest of this app, not
 * the enforcement; RLS on `attendance_events` and `leave_requests` is what
 * actually stops a manager reading another site's calendar even if this
 * page's own query were bypassed.
 */
export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string }>;
}) {
  const admin = await getEmployeeContext();
  if (!admin) return null;

  const supabase = await createClient();

  const { data: roster, error: rosterError } = await supabase
    .from("employees")
    .select("id, full_name, role")
    .eq("org_id", admin.orgId)
    .order("full_name", { ascending: true });

  if (rosterError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Attendance" description="One employee's calendar, visually." />
        <Callout variant="critical" label="Couldn't load the roster">
          Reload the page to try again.
        </Callout>
      </div>
    );
  }

  const { employee: employeeParam } = await searchParams;
  const selected =
    (roster ?? []).find((r) => r.id === employeeParam) ?? (roster ?? [])[0] ?? null;

  const now = new Date();
  const today = localDateKey(now);
  const [year, month] = today.split("-").map(Number);
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonthStart =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  // The org's midnight, not UTC midnight — see dashboard/attendance/page.tsx
  // for the same fix and why a `Z`-suffixed string here misfiles a check-in
  // near midnight into the wrong month.
  const [msY, msM, msD] = monthStart.split("-").map(Number);
  const [nmY, nmM, nmD] = nextMonthStart.split("-").map(Number);
  const monthStartUtc = zonedWallClockToUtc(msY, msM, msD, 0, 0);
  const nextMonthStartUtc = zonedWallClockToUtc(nmY, nmM, nmD, 0, 0);

  let checkIns: AttendanceCheckIn[] = [];
  let leave: { start_date: string; end_date: string; status: string }[] = [];
  let calendarFailed = false;

  if (selected) {
    const [eventsRes, leaveRes] = await Promise.all([
      supabase
        .from("attendance_events")
        .select("occurred_at")
        .eq("employee_id", selected.id)
        .eq("event_type", "check_in")
        .gte("occurred_at", monthStartUtc.toISOString())
        .lt("occurred_at", nextMonthStartUtc.toISOString()),
      supabase
        .from("leave_requests")
        .select("start_date, end_date, status")
        .eq("employee_id", selected.id)
        .eq("status", "approved")
        .lte("start_date", nextMonthStart)
        .gte("end_date", monthStart),
    ]);

    calendarFailed = Boolean(eventsRes.error || leaveRes.error);

    const checkInByDay = new Map<string, string>();
    for (const ev of eventsRes.data ?? []) {
      const key = localDateKey(new Date(ev.occurred_at));
      const existing = checkInByDay.get(key);
      if (!existing || ev.occurred_at < existing) {
        checkInByDay.set(key, ev.occurred_at);
      }
    }
    checkIns = [...checkInByDay.entries()].map(([date, iso]) => ({
      date,
      status: classifyCheckIn(iso),
    }));
    leave = leaveRes.data ?? [];
  }

  const todaySettled = wallClockIn(now).hour >= ABSENT_CUTOFF_HOUR;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title="Attendance" description="One employee's calendar, visually." />

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              <CardTitle className="text-base">Roster</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col p-0">
            {(roster ?? []).length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No staff yet.
              </p>
            ) : (
              (roster ?? []).map((r) => (
                <Link
                  key={r.id}
                  href={`/admin/attendance?employee=${r.id}`}
                  className={cn(
                    "border-b border-border px-4 py-2.5 text-sm transition-colors last:border-0 hover:bg-secondary/60",
                    selected?.id === r.id && "bg-secondary font-medium"
                  )}
                >
                  {r.full_name}
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selected ? `${selected.full_name}'s calendar` : "Calendar"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Pick someone from the roster to see their calendar.
              </p>
            ) : calendarFailed ? (
              <Callout variant="note" label="Calendar unavailable">
                This month&apos;s attendance couldn&apos;t be loaded. Reload to
                try again.
              </Callout>
            ) : (
              <AttendanceMonthCalendar
                year={year}
                month={month}
                checkIns={checkIns}
                leave={leave}
                today={today}
                todaySettled={todaySettled}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
