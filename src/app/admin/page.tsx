import { Building2, ArrowUpRight } from "lucide-react";

import { getEmployeeContext } from "@/lib/supabase/employee";
import { createClient } from "@/lib/supabase/server";
import { classifyCheckIn } from "@/lib/attendance";
import { PageHeader } from "@/components/admin/page-header";
import { Callout } from "@/components/callout";
import { StatTiles } from "@/components/site/stat-tiles";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";

type DailyStatus = "present" | "late" | "absent" | "on_leave";

const STATUS_LABEL: Record<DailyStatus, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  on_leave: "On leave",
};

const STATUS_VARIANT: Record<DailyStatus, "outline" | "attention" | "destructive" | "proposed"> = {
  present: "outline",
  late: "attention",
  absent: "destructive",
  on_leave: "proposed",
};

export default async function AdminOverviewPage() {
  const identity = await getEmployeeContext();
  if (!identity) return null; // layout already redirects; satisfies TS

  const supabase = await createClient();

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const todayDateStr = todayStart.toISOString().slice(0, 10);
  const pastCutoff = now.getHours() >= 9; // see classifyCheckIn's note on this being a placeholder rule

  const [{ data: sites }, { data: workforce }, { data: todaysEvents }, { data: onLeave }] =
    await Promise.all([
      supabase.from("sites").select("id, name").eq("org_id", identity.orgId),
      supabase
        .from("employees")
        .select("id, full_name, site_id, role")
        .eq("org_id", identity.orgId)
        .in("role", ["staff", "manager"]),
      supabase
        .from("attendance_events")
        .select("employee_id, event_type, occurred_at")
        .eq("org_id", identity.orgId)
        .gte("occurred_at", todayStart.toISOString())
        .lt("occurred_at", todayEnd.toISOString())
        .order("occurred_at", { ascending: true }),
      supabase
        .from("leave_requests")
        .select("employee_id")
        .eq("org_id", identity.orgId)
        .eq("status", "approved")
        .lte("start_date", todayDateStr)
        .gte("end_date", todayDateStr),
    ]);

  const siteNameById = new Map((sites ?? []).map((s) => [s.id, s.name]));
  const onLeaveIds = new Set((onLeave ?? []).map((r) => r.employee_id));

  const firstCheckInByEmployee = new Map<string, string>();
  for (const ev of todaysEvents ?? []) {
    if (ev.event_type === "check_in" && !firstCheckInByEmployee.has(ev.employee_id)) {
      firstCheckInByEmployee.set(ev.employee_id, ev.occurred_at);
    }
  }

  type Row = {
    id: string;
    fullName: string;
    siteId: string | null;
    status: DailyStatus | null;
    checkInTime: string | null;
  };

  const rows: Row[] = (workforce ?? []).map((e) => {
    let status: DailyStatus | null = null;
    let checkInTime: string | null = null;

    if (onLeaveIds.has(e.id)) {
      status = "on_leave";
    } else if (firstCheckInByEmployee.has(e.id)) {
      checkInTime = firstCheckInByEmployee.get(e.id)!;
      status = classifyCheckIn(checkInTime);
    } else if (pastCutoff) {
      status = "absent";
    }

    return { id: e.id, fullName: e.full_name, siteId: e.site_id, status, checkInTime };
  });

  const counted = rows.filter((r) => r.status !== null);
  const kpi = {
    present: counted.filter((r) => r.status === "present").length,
    late: counted.filter((r) => r.status === "late").length,
    absent: counted.filter((r) => r.status === "absent").length,
    onLeave: counted.filter((r) => r.status === "on_leave").length,
  };

  const exceptions = rows
    .filter((r) => r.status && r.status !== "present")
    .sort((a, b) => (a.status ?? "").localeCompare(b.status ?? ""));

  const siteStats = (sites ?? []).map((s) => {
    const siteRows = rows.filter((r) => r.siteId === s.id);
    const present = siteRows.filter((r) => r.status === "present" || r.status === "late").length;
    return { name: s.name, present, total: siteRows.length };
  });

  const hasAnyData = (workforce?.length ?? 0) > 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Overview"
        description={`Live status across all sites — ${identity.orgName}.`}
      />

      {!hasAnyData && (
        <Callout variant="note" label="No staff yet">
          Add employees (via SQL for now — see README) or run
          <code className="mx-1 rounded-sm bg-secondary px-1 py-0.5 font-mono text-xs">
            scripts/seed-demo-data.mjs
          </code>
          to populate a realistic demo.
        </Callout>
      )}

      {hasAnyData && !pastCutoff && (
        <Callout variant="note" label="Early morning">
          Employees without a check-in yet aren&apos;t marked absent until
          9:00 AM — it&apos;s currently {now.getHours()}:
          {String(now.getMinutes()).padStart(2, "0")}.
        </Callout>
      )}

      <StatTiles
        tiles={[
          { value: String(kpi.present), label: "Present today" },
          { value: String(kpi.late), label: "Late" },
          { value: String(kpi.absent), label: "Absent" },
          { value: String(kpi.onLeave), label: "On leave" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Today&apos;s exceptions</CardTitle>
              <Badge variant="outline">{exceptions.length} flagged</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {exceptions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No exceptions {hasAnyData ? "so far today." : "— add staff to see data here."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exceptions.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.fullName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.siteId ? siteNameById.get(r.siteId) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[r.status!]}>
                          {STATUS_LABEL[r.status!]}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.checkInTime
                          ? new Date(r.checkInTime).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.status === "late" && "Checked in after 7:15 AM"}
                        {r.status === "absent" && "No check-in today"}
                        {r.status === "on_leave" && "Approved leave"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sites</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {siteStats.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No sites yet.
              </p>
            )}
            {siteStats.map((site) => {
              const pct = site.total > 0 ? Math.round((site.present / site.total) * 100) : 0;
              return (
                <div
                  key={site.name}
                  className="flex items-center gap-3 border-b border-border py-3 last:border-0"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-secondary">
                    <Building2 className="size-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{site.name}</div>
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {site.present}/{site.total}
                  </span>
                </div>
              );
            })}
            <a
              href="/admin/sites"
              className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              View all sites <ArrowUpRight className="size-3.5" />
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
