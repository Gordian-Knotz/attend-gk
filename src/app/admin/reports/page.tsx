import Link from "next/link";

import { getEmployeeContext } from "@/lib/supabase/employee";
import { createClient } from "@/lib/supabase/server";
import { buildDailySeries, localDateKey, recentDays } from "@/lib/attendance-series";
import { buildTimesheet } from "@/lib/timesheet";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page-header";
import { Callout } from "@/components/callout";
import { StatTiles } from "@/components/site/stat-tiles";
import { AttendanceTrendChart } from "@/components/charts/attendance-trend-chart";
import { SiteAttendanceChart } from "@/components/charts/site-attendance-chart";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { ExportButton } from "./export-button";

const PERIODS = [
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
] as const;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const identity = await getEmployeeContext();
  if (!identity) return null; // layout redirects; satisfies TS

  const { days: daysParam } = await searchParams;
  const periodDays =
    PERIODS.find((p) => String(p.days) === daysParam)?.days ?? 14;

  const supabase = await createClient();

  const now = new Date();
  const windowDays = recentDays(periodDays, now);
  const windowStart = windowDays[0];
  const windowEnd = new Date(windowDays[windowDays.length - 1]);
  windowEnd.setDate(windowEnd.getDate() + 1);

  const [{ data: sites }, { data: workforce }, { data: events }, { data: leaveRows }] =
    await Promise.all([
      supabase.from("sites").select("id, name").eq("org_id", identity.orgId),
      supabase
        .from("employees")
        .select("id, full_name, site_id, role")
        .eq("org_id", identity.orgId)
        .in("role", ["staff", "manager"])
        .order("full_name"),
      supabase
        .from("attendance_events")
        .select("employee_id, event_type, occurred_at")
        .eq("org_id", identity.orgId)
        .gte("occurred_at", windowStart.toISOString())
        .lt("occurred_at", windowEnd.toISOString())
        .order("occurred_at", { ascending: true }),
      supabase
        .from("leave_requests")
        .select("employee_id, start_date, end_date")
        .eq("org_id", identity.orgId)
        .eq("status", "approved")
        .lte("start_date", localDateKey(windowDays[windowDays.length - 1]))
        .gte("end_date", localDateKey(windowStart)),
    ]);

  const siteNameById = new Map((sites ?? []).map((s) => [s.id, s.name]));
  const employees = workforce ?? [];

  const trendData = buildDailySeries({
    days: windowDays,
    events: events ?? [],
    leave: leaveRows ?? [],
    workforceIds: employees.map((e) => e.id),
    now,
  });

  const rows = buildTimesheet({
    employees,
    siteNameById,
    events: events ?? [],
    leave: leaveRows ?? [],
    days: windowDays,
  });

  const totals = rows.reduce(
    (acc, r) => ({
      hours: acc.hours + r.hoursWorked,
      present: acc.present + r.daysPresent,
      late: acc.late + r.daysLate,
      absent: acc.absent + r.daysAbsent,
    }),
    { hours: 0, present: 0, late: 0, absent: 0 }
  );

  const scheduledDays = totals.present + totals.late + totals.absent;
  const attendanceRate =
    scheduledDays > 0
      ? Math.round(((totals.present + totals.late) / scheduledDays) * 100)
      : 0;

  // Per-site attendance rate across the period, from the same rows the
  // table and the CSV use — one source of truth for all three.
  const siteChartData = (sites ?? [])
    .map((site) => {
      const siteRows = rows.filter((r) => r.siteName === site.name);
      const attended = siteRows.reduce((n, r) => n + r.daysPresent + r.daysLate, 0);
      const scheduled = siteRows.reduce(
        (n, r) => n + r.daysPresent + r.daysLate + r.daysAbsent,
        0
      );
      return {
        label: site.name,
        rate: scheduled > 0 ? Math.round((attended / scheduled) * 100) : 0,
        scheduled,
      };
    })
    .filter((d) => d.scheduled > 0)
    .map(({ label, rate }) => ({ label, rate }));

  const periodLabel = `${windowStart.toLocaleDateString()} – ${now.toLocaleDateString()}`;
  const fileName = `attendpac-timesheet-${localDateKey(windowStart)}-to-${localDateKey(now)}.csv`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Reports"
        description={`Timesheets and attendance summary — ${periodLabel}.`}
        action={
          <ExportButton
            rows={rows}
            periodLabel={periodLabel}
            fileName={fileName}
          />
        }
      />

      <div className="flex items-center gap-1 border-b border-border">
        {PERIODS.map((period) => (
          <Link
            key={period.days}
            href={`/admin/reports?days=${period.days}`}
            scroll={false}
            className={cn(
              "font-label -mb-px inline-flex h-9 items-center border-b-2 px-3 transition-colors",
              period.days === periodDays
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {period.label}
          </Link>
        ))}
      </div>

      {employees.length === 0 && (
        <Callout variant="note" label="No staff yet">
          Add employees on the Staff page, or run the demo seeder, and reports
          will fill in from their check-ins.
        </Callout>
      )}

      <StatTiles
        tiles={[
          { value: totals.hours.toFixed(0), unit: "h", label: "Hours worked" },
          { value: String(attendanceRate), unit: "%", label: "Attendance rate" },
          { value: String(totals.late), label: "Late arrivals" },
          { value: String(totals.absent), label: "Absences" },
        ]}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Attendance trend</CardTitle>
            <Badge variant="outline">Last {periodDays} days</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <AttendanceTrendChart data={trendData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attendance by site</CardTitle>
        </CardHeader>
        <CardContent>
          <SiteAttendanceChart data={siteChartData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Timesheet</CardTitle>
            <Badge variant="outline">{rows.length} staff</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing to report for this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead className="text-right">Present</TableHead>
                    <TableHead className="text-right">Late</TableHead>
                    <TableHead className="text-right">Leave</TableHead>
                    <TableHead className="text-right">Absent</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.employeeId}>
                      <TableCell className="font-medium">{r.fullName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.siteName}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {r.daysPresent}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {r.daysLate}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {r.daysOnLeave}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {r.daysAbsent}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {r.hoursWorked.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
