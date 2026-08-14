import { Building2, ArrowUpRight, BellOff } from "lucide-react";

import { getEmployeeContext } from "@/lib/supabase/employee";
import { createClient } from "@/lib/supabase/server";
import { classifyCheckIn } from "@/lib/attendance";
import {
  buildDailySeries,
  localDateKey,
  recentDays,
} from "@/lib/attendance-series";
import { formatDate, formatTime, wallClockIn } from "@/lib/timezone";
import { AttendanceTrendChart } from "@/components/charts/attendance-trend-chart";
import { describeAudience } from "@/lib/notice-audience";
import { PostNoticeDialog } from "./notice-dialog";
import { DeleteNoticeButton } from "./dismiss-notice-button";
import { PageHeader } from "@/components/admin/page-header";
import { Callout } from "@/components/callout";
import { RoadmapCard } from "@/components/roadmap-card";
import { StatValue } from "@/components/site/stat-value";
import { BentoGrid, BentoCard } from "@/components/motion/bento";
import {
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

const NOTICE_VARIANT: Record<string, "outline" | "attention" | "destructive"> = {
  info: "outline",
  warning: "attention",
  critical: "destructive",
};

// The four KPI tiles, as bento cells. `key` indexes the `kpi` object built
// below, so a label can't drift away from the number it sits under.
const KPI_TILES = [
  { key: "present", label: "Present today" },
  { key: "late", label: "Late" },
  { key: "absent", label: "Absent" },
  { key: "onLeave", label: "On leave" },
] as const;

export default async function AdminOverviewPage() {
  const identity = await getEmployeeContext();
  if (!identity) return null; // layout already redirects; satisfies TS

  const supabase = await createClient();

  const now = new Date();

  // One 14-day window serves both the trend chart and today's numbers —
  // today is just the last bucket, so there's no reason to query twice.
  // All boundaries are midnight in the organization's timezone, not the
  // server's; see src/lib/timezone.ts.
  const trendDays = recentDays(14, now);
  const windowStart = trendDays[0];
  const todayStart = trendDays[trendDays.length - 1];
  const todayEnd = new Date(todayStart.getTime() + 86_400_000);
  const todayDateStr = localDateKey(todayStart);
  const windowStartDateStr = localDateKey(windowStart);
  // see classifyCheckIn's note on this being a placeholder rule
  const pastCutoff = wallClockIn(now).hour >= 9;

  const [sitesRes, workforceRes, eventsRes, leaveRes, noticesRes] =
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
        .gte("occurred_at", windowStart.toISOString())
        .lt("occurred_at", todayEnd.toISOString())
        .order("occurred_at", { ascending: true }),
      supabase
        .from("leave_requests")
        .select("employee_id, start_date, end_date")
        .eq("org_id", identity.orgId)
        .eq("status", "approved")
        .lte("start_date", todayDateStr)
        .gte("end_date", windowStartDateStr),
      supabase
        .from("notifications")
        .select("id, message, level, site_id, created_at, author_id, target_role")
        .eq("org_id", identity.orgId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  // A failed query used to arrive here as `undefined` and fall through the
  // `?? []` fallbacks, so a database outage rendered as an empty org —
  // "No staff yet", every KPI zero. That reads as a first-run onboarding
  // state, which is the most misleading thing it could have said.
  //
  // Notices are deliberately excluded from this list: migration 0013 added
  // author_id and target_role, and until an operator runs it, selecting
  // those columns 404s. That failure belongs to the Notices card alone —
  // taking down the whole page over a card that has a perfectly good empty
  // state would be a regression for a page that otherwise still works.
  const loadError =
    sitesRes.error ??
    workforceRes.error ??
    eventsRes.error ??
    leaveRes.error;

  if (loadError) {
    return (
      <Callout variant="critical" label="Dashboard unavailable">
        Today&apos;s attendance data couldn&apos;t be loaded, so the numbers
        below would be wrong. Reload the page; if this persists, check the
        database connection before trusting any figure on this screen.
      </Callout>
    );
  }

  const { data: sites } = sitesRes;
  const { data: workforce } = workforceRes;
  const { data: windowEvents } = eventsRes;
  const { data: leaveRows } = leaveRes;
  const { data: notices, error: noticesError } = noticesRes;

  const siteNameById = new Map((sites ?? []).map((s) => [s.id, s.name]));

  // Author names come from their own lookup, not `workforce`. `workforce` is
  // filtered to staff/manager and feeds the KPI arithmetic below — widening
  // it to include org_admin authors would silently change every one of
  // those counts. This is a second, independent round trip, and only runs
  // when there is a notice with an author to resolve.
  const authorIds = Array.from(
    new Set(
      (notices ?? [])
        .map((n) => n.author_id as string | null)
        .filter((id): id is string => Boolean(id))
    )
  );

  let authorNameById = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: authors, error: authorsError } = await supabase
      .from("employees")
      .select("id, full_name")
      .eq("org_id", identity.orgId)
      .in("id", authorIds);

    // A failed or partial lookup (including RLS quietly hiding a row the
    // viewer isn't allowed to see — a manager can't see an org_admin outside
    // their site) just leaves that author unresolved below; it must not take
    // the Notices card down.
    if (!authorsError) {
      authorNameById = new Map((authors ?? []).map((a) => [a.id, a.full_name]));
    }
  }

  const todaysEvents = (windowEvents ?? []).filter(
    (ev) => localDateKey(new Date(ev.occurred_at)) === todayDateStr
  );
  const onLeaveIds = new Set(
    (leaveRows ?? [])
      .filter((r) => r.start_date <= todayDateStr && r.end_date >= todayDateStr)
      .map((r) => r.employee_id)
  );

  const trendData = buildDailySeries({
    days: trendDays,
    events: windowEvents ?? [],
    leave: leaveRows ?? [],
    workforceIds: (workforce ?? []).map((e) => e.id),
    now,
  });

  const firstCheckInByEmployee = new Map<string, string>();
  for (const ev of todaysEvents) {
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
    return { id: s.id, name: s.name, present, total: siteRows.length };
  });

  const hasAnyData = (workforce?.length ?? 0) > 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Overview"
        description={`Live status across all sites — ${identity.orgName}.`}
        action={<PostNoticeDialog sites={sites ?? []} />}
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

      <BentoGrid>
        {KPI_TILES.map(({ key, label }) => (
          <BentoCard
            key={key}
            particles
            magnetism
            ripple
            className="border-t-2 border-t-foreground"
          >
            <CardContent>
              <div className="font-display text-4xl leading-none tabular-nums">
                <StatValue value={String(kpi[key])} />
              </div>
              <div className="font-label mt-2 text-muted-foreground">
                {label}
              </div>
            </CardContent>
          </BentoCard>
        ))}

        <BentoCard className="sm:col-span-2 lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Attendance trend</CardTitle>
              <Badge variant="outline">Last 14 days</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <AttendanceTrendChart data={trendData} />
          </CardContent>
        </BentoCard>

        <BentoCard className="sm:col-span-2 lg:col-span-1">
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
                  key={site.id}
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
        </BentoCard>

        <BentoCard className="sm:col-span-2 lg:col-span-3">
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
              /* BentoCard clips (overflow-hidden, for the particles and the
                 glow ring), so a wide table has to scroll in its own box
                 rather than relying on the card to let it spill. */
              <div className="overflow-x-auto">
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
                        {r.checkInTime ? formatTime(r.checkInTime) : "—"}
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
              </div>
            )}
          </CardContent>
        </BentoCard>

        <BentoCard className="sm:col-span-2 lg:col-span-1">
          <CardHeader>
            <CardTitle>Notices</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col">
            {noticesError ? (
              <Callout variant="note" label="Notices unavailable">
                Notices couldn&apos;t be loaded. If this persists after a
                reload, the notice-targeting migration may not have run yet —
                check with whoever manages the database.
              </Callout>
            ) : (notices ?? []).length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <BellOff className="size-5 text-muted-foreground" strokeWidth={1.5} />
                <p className="text-sm text-muted-foreground">
                  Nothing posted yet. Use{" "}
                  <span className="font-medium text-foreground">Post notice</span>{" "}
                  to tell the team something.
                </p>
              </div>
            ) : (
              (notices ?? []).map((notice) => (
                <div
                  key={notice.id}
                  className="flex items-start gap-3 border-b border-border py-3 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={NOTICE_VARIANT[notice.level] ?? "outline"}>
                        {notice.level}
                      </Badge>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {formatDate(notice.created_at)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm">{notice.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {describeAudience({
                        siteName: notice.site_id ? siteNameById.get(notice.site_id) ?? null : null,
                        targetRole: notice.target_role ?? null,
                      })}
                      {" · "}
                      {notice.author_id
                        ? `Posted by ${authorNameById.get(notice.author_id) ?? "another admin"}`
                        : "Posted before authors were recorded"}
                    </p>
                  </div>
                  <DeleteNoticeButton noticeId={notice.id} />
                </div>
              ))
            )}
          </CardContent>
        </BentoCard>
      </BentoGrid>

      {/* Last on the page on purpose: this screen's job is telling an admin
          who is on site right now, and a roadmap is the least urgent thing
          on it. Content lives in src/lib/roadmap.ts, shared with
          /dashboard so the two surfaces can't drift apart. */}
      <div className="mt-4">
        <RoadmapCard audience="admin" />
      </div>
    </div>
  );
}
