import Link from "next/link";

import { getEmployeeContext } from "@/lib/supabase/employee";
import { createClient } from "@/lib/supabase/server";
import { buildDailySeries, localDateKey, recentDays } from "@/lib/attendance-series";
import { buildTimesheet } from "@/lib/timesheet";
import {
  buildLeaveBalances,
  compareLeaveTypes,
  formatLeaveDays,
  LEAVE_COUNTING_RULE,
  type AccrualMode,
  type EntitlementRow,
  type LeaveRequestRow,
} from "@/lib/leave-balance";
import { formatDate } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page-header";
import { Callout } from "@/components/callout";
import { StatTiles } from "@/components/site/stat-tiles";
import { AttendanceTrendChart } from "@/components/charts/attendance-trend-chart";
import { SiteAttendanceChart } from "@/components/charts/site-attendance-chart";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Meter } from "@/components/ui/meter";
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

  // The org's timezone, not the server's — same derivation Task 3 uses on
  // /dashboard/leave, so the admin card and the staff card never disagree
  // about which year "this year" means.
  const year = Number(localDateKey(new Date()).slice(0, 4));

  const [
    sitesRes,
    workforceRes,
    eventsRes,
    leaveRes,
    entitlementsRes,
    leaveUtilizationRes,
    holidaysRes,
    accrualRes,
  ] = await Promise.all([
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
      supabase
        .from("leave_entitlements")
        .select("employee_id, leave_type, days_granted, days_carried")
        .eq("org_id", identity.orgId)
        .eq("year", year),
      supabase
        .from("leave_requests")
        .select("employee_id, leave_type, start_date, end_date, status")
        .eq("org_id", identity.orgId)
        .gte("start_date", `${year}-01-01`)
        .lte("start_date", `${year}-12-31`),
      // Same read as /dashboard/leave, and it must stay the same or the two
      // surfaces would charge the same request differently — the exact
      // disagreement the shared balance module exists to prevent. RLS scopes it
      // to national rows plus this org's, so no org filter. Error deliberately
      // unhandled: 0015 may be unapplied, and the empty-set fallback is simply
      // the pre-0015 behaviour.
      supabase
        .from("public_holidays")
        .select("holiday")
        .gte("holiday", `${year}-01-01`)
        .lte("holiday", `${year}-12-31`),
      // Must match /dashboard/leave's read exactly, or utilization would be
      // computed against a full-year entitlement while the employee sees an
      // accrued one — two different denominators for the same person.
      supabase
        .from("leave_policies")
        .select("leave_type, accrual_mode")
        .eq("org_id", identity.orgId),
    ]);

  // Without this, a failed query fell through the `?? []` fallbacks and the
  // page rendered a complete-looking report of zeros — and handed those
  // zeros to ExportButton, so someone could download a timesheet that
  // understated every employee's hours and never know a query had failed.
  const loadError =
    sitesRes.error ?? workforceRes.error ?? eventsRes.error ?? leaveRes.error;

  if (loadError) {
    return (
      <Callout variant="critical" label="Report unavailable">
        The attendance data for this period couldn&apos;t be loaded, so the
        figures and the CSV export would both be wrong. Reload the page, and
        don&apos;t export until it renders cleanly.
      </Callout>
    );
  }

  const { data: sites } = sitesRes;
  const { data: workforce } = workforceRes;
  const { data: events } = eventsRes;
  const { data: leaveRows } = leaveRes;

  // Migration 0014 may not be applied yet, so `leave_entitlements` can 404.
  // Captured separately from `loadError` above: that error breaks the whole
  // report (it works today and must keep working); this one only means the
  // utilization card below isn't provisioned on this org, so it renders its
  // own note instead. Kept as two distinct error values, not pre-merged,
  // for the same reason Task 3 keeps `leaveFailed` and `entitlementsFailed`
  // apart on /dashboard/leave — a genuine error in either read should still
  // be traceable to its own query, even though both currently render the
  // same note here.
  const holidays = new Set(
    (holidaysRes.data ?? []).map((h) => h.holiday as string)
  );

  const accrual = new Map(
    (accrualRes.data ?? []).map((p) => [
      p.leave_type as string,
      ((p as { accrual_mode?: string }).accrual_mode === "monthly"
        ? "monthly"
        : "annual") as AccrualMode,
    ])
  );
  const asOfMonth = Number(localDateKey(new Date()).slice(5, 7));

  const { data: orgEntitlements, error: entitlementsError } = entitlementsRes;
  const { data: orgLeaveRequestsForUtilization, error: utilizationRequestsError } =
    leaveUtilizationRes;
  const utilizationFailed = Boolean(entitlementsError) || Boolean(utilizationRequestsError);

  // Per-employee balances, summed across the org. Deliberately not a second
  // implementation of the day-counting or budgeted/unbudgeted rules —
  // `buildLeaveBalances` is called once per employee, exactly as the staff
  // page calls it for one, and only the per-type totals are summed here.
  // A balance is only trustworthy when both reads succeeded, so this stays
  // empty rather than computing from a partial `?? []` fallback — the same
  // rule /dashboard/leave applies to its own balance.
  const utilizationRows: {
    leaveType: string;
    granted: number;
    taken: number;
    employeesWithEntitlement: number;
  }[] = [];

  if (!utilizationFailed) {
    const entitlementsByEmployee = new Map<string, EntitlementRow[]>();
    for (const row of orgEntitlements ?? []) {
      const list = entitlementsByEmployee.get(row.employee_id) ?? [];
      list.push(row);
      entitlementsByEmployee.set(row.employee_id, list);
    }

    const requestsByEmployee = new Map<string, LeaveRequestRow[]>();
    for (const row of orgLeaveRequestsForUtilization ?? []) {
      const list = requestsByEmployee.get(row.employee_id) ?? [];
      list.push(row);
      requestsByEmployee.set(row.employee_id, list);
    }

    const employeeIds = new Set([
      ...entitlementsByEmployee.keys(),
      ...requestsByEmployee.keys(),
    ]);

    const byType = new Map<
      string,
      { leaveType: string; granted: number; taken: number; employeesWithEntitlement: number }
    >();

    for (const employeeId of employeeIds) {
      const balances = buildLeaveBalances({
        year,
        entitlements: entitlementsByEmployee.get(employeeId) ?? [],
        requests: requestsByEmployee.get(employeeId) ?? [],
        holidays,
        accrual,
        asOfMonth,
      });
      for (const b of balances) {
        const agg = byType.get(b.leaveType) ?? {
          leaveType: b.leaveType,
          granted: 0,
          taken: 0,
          employeesWithEntitlement: 0,
        };
        agg.granted += b.granted + b.carried;
        agg.taken += b.taken;
        // `remaining` is null exactly when this employee has no entitlement
        // row for this type — the same signal `buildLeaveBalances` uses to
        // tell "tracked" apart from "budgeted." Reusing it here means this
        // count never has to name a leave type in code to decide it.
        if (b.remaining !== null) agg.employeesWithEntitlement += 1;
        byType.set(b.leaveType, agg);
      }
    }

    // Same ordering `buildLeaveBalances` applies to the staff page's own
    // list, via the same exported comparator — an admin and an employee
    // reading the same four leave types in different orders is the small
    // version of exactly what the shared module exists to prevent.
    utilizationRows.push(
      ...[...byType.values()].sort((a, b) => compareLeaveTypes(a.leaveType, b.leaveType))
    );
  }

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

  // Explicit locale and timezone: a bare toLocaleDateString() renders
  // according to the server's, so the same CSV could say "10/08/2026" or
  // "8/10/2026" depending on where it was generated.
  const periodLabel = `${formatDate(windowStart)} – ${formatDate(now)}`;
  const fileName = `activ-hr-timesheet-${localDateKey(windowStart)}-to-${localDateKey(now)}.csv`;

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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Leave utilization</CardTitle>
            <Badge variant="outline">{year}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {utilizationRequestsError ? (
            // Checked first, ahead of entitlementsError: when the requests
            // read itself failed, "not set up yet" would be a false claim —
            // entitlements may well exist. Mirrors the order /dashboard/leave
            // uses between its own leaveFailed and entitlementsFailed.
            <Callout variant="note" label="Utilization unavailable">
              This year&apos;s leave history couldn&apos;t be loaded, so
              utilization can&apos;t be computed right now. Reload the page
              to try again.
            </Callout>
          ) : entitlementsError ? (
            // Deliberately does not assert WHICH it is. A timeout, a 500 or an
            // RLS denial lands here too, and telling a provisioned org their
            // leave "isn't set up" is a false claim about their configuration.
            // Same wording as /dashboard/leave, for the same reason.
            <Callout variant="note" label="Utilization unavailable">
              Leave entitlements couldn&apos;t be loaded — they may not be set
              up for this organization yet.
            </Callout>
          ) : utilizationRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No leave entitlements configured for {year}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              {/* At-a-glance meters, one per budgeted leave type — the exact
                  numbers stay in the table below. Skips a type with no
                  entitlement (granted === 0): "tracked, no allowance" has no
                  limit to be a ratio against, and the table already says so. */}
              <div className="mb-5 flex flex-col gap-3">
                {utilizationRows
                  .filter((u) => u.granted > 0)
                  .map((u) => (
                    <div key={u.leaveType} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 truncate text-sm font-medium capitalize">
                        {u.leaveType}
                      </span>
                      <Meter
                        value={u.taken}
                        max={u.granted}
                        label={`${u.leaveType} leave utilization`}
                        className="flex-1"
                      />
                      <span className="w-12 shrink-0 text-right font-mono text-xs text-muted-foreground">
                        {Math.round((u.taken / u.granted) * 100)}%
                      </span>
                    </div>
                  ))}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Leave type</TableHead>
                    <TableHead className="text-right">Granted</TableHead>
                    <TableHead className="text-right">Taken</TableHead>
                    <TableHead className="text-right">Utilization</TableHead>
                    <TableHead className="text-right">Employees</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {utilizationRows.map((u) => (
                    <TableRow key={u.leaveType}>
                      <TableCell className="font-medium capitalize">
                        {u.leaveType}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {/* Display only; the percentage below keeps using the
                            unrounded values. Shared with the staff page so the
                            two cannot format the same figure differently —
                            see formatLeaveDays for why tenths, not halves,
                            are the hazard. */}
                        {formatLeaveDays(u.granted)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatLeaveDays(u.taken)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {u.granted > 0
                          ? `${Math.round((u.taken / u.granted) * 100)}%`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {u.employeesWithEntitlement}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {/* The rule these percentages are computed under. An admin
                  reading a utilization figure needs it as much as an employee
                  reading their own balance does. */}
              <p className="pt-3 text-xs text-muted-foreground">
                {LEAVE_COUNTING_RULE}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
