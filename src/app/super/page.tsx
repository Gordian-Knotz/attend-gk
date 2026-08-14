import { Building2 } from "lucide-react";
import Link from "next/link";

import { getEmployeeContext } from "@/lib/supabase/employee";
import { createClient } from "@/lib/supabase/server";
import { localDateKey, recentDays } from "@/lib/attendance-series";
import { formatDate } from "@/lib/timezone";
import { PageHeader } from "@/components/admin/page-header";
import { Callout } from "@/components/callout";
import { StatTiles } from "@/components/site/stat-tiles";
import { DailyTrendChart } from "@/components/charts/daily-trend-chart";
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

/** How recently an org must have recorded a punch to count as active. */
const ACTIVE_WINDOW_DAYS = 30;

const BILLING_VARIANT: Record<
  string,
  "attention" | "outline" | "proposed" | "destructive"
> = {
  active: "attention",
  trialing: "proposed",
  past_due: "destructive",
  canceled: "outline",
};

export default async function SuperOverviewPage() {
  const identity = await getEmployeeContext();
  if (!identity) return null; // layout redirects; satisfies TS

  const supabase = await createClient();

  const now = new Date();
  const windowDays = recentDays(ACTIVE_WINDOW_DAYS, now);
  const windowStart = windowDays[0];

  // Four platform-wide reads. Counted in memory rather than with per-org
  // count queries — the platform has tens of orgs, not thousands, so this
  // is four round trips instead of 4N. Revisit if that stops being true.
  const [orgsRes, employeesRes, sitesRes, eventsRes] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "id, name, slug, plan_tier, billing_status, suspended_at, suspended_reason, created_at"
      )
      .order("created_at", { ascending: false }),
    supabase.from("employees").select("id, org_id, role"),
    supabase.from("sites").select("id, org_id"),
    supabase
      .from("attendance_events")
      .select("org_id, occurred_at")
      .gte("occurred_at", windowStart.toISOString()),
  ]);

  // Site and org counts here are the test of migration 0005: before it, a
  // super_admin could write another org's sites but not read them, so these
  // silently showed only their own. A failed query rendering as zero would
  // look identical to that bug.
  const loadError =
    orgsRes.error ?? employeesRes.error ?? sitesRes.error ?? eventsRes.error;

  if (loadError) {
    return (
      <Callout variant="critical" label="Platform view unavailable">
        The tenant list couldn&apos;t be loaded. Reload — don&apos;t read the
        absence of rows as an empty platform.
      </Callout>
    );
  }

  const orgs = orgsRes.data ?? [];
  const employees = employeesRes.data ?? [];
  const sites = sitesRes.data ?? [];
  const events = eventsRes.data ?? [];

  const staffByOrg = new Map<string, number>();
  for (const e of employees) {
    staffByOrg.set(e.org_id, (staffByOrg.get(e.org_id) ?? 0) + 1);
  }

  const sitesByOrg = new Map<string, number>();
  for (const s of sites) {
    sitesByOrg.set(s.org_id, (sitesByOrg.get(s.org_id) ?? 0) + 1);
  }

  const eventsByOrg = new Map<string, number>();
  const lastSeenByOrg = new Map<string, string>();
  for (const ev of events) {
    eventsByOrg.set(ev.org_id, (eventsByOrg.get(ev.org_id) ?? 0) + 1);
    const seen = lastSeenByOrg.get(ev.org_id);
    if (!seen || ev.occurred_at > seen) {
      lastSeenByOrg.set(ev.org_id, ev.occurred_at);
    }
  }

  const paying = orgs.filter((o) => o.billing_status === "active").length;
  const trialing = orgs.filter((o) => o.billing_status === "trialing").length;
  const atRisk = orgs.filter((o) => o.billing_status === "past_due").length;
  const suspended = orgs.filter((o) => o.suspended_at).length;

  // "Active" means they actually used the product, not that they have a row
  // in the table. A tenant that signed up and never clocked anyone in is a
  // very different number from a tenant running three sites.
  const activeOrgs = orgs.filter(
    (o) => !o.suspended_at && (eventsByOrg.get(o.id) ?? 0) > 0
  ).length;

  // Signups per day across the window — the growth line. Reuses the
  // attendance chart because the shape is the same: a labelled daily series.
  const signupsByDay = new Map<string, number>();
  for (const o of orgs) {
    const key = localDateKey(new Date(o.created_at));
    signupsByDay.set(key, (signupsByDay.get(key) ?? 0) + 1);
  }

  const growthSeries = windowDays.map((day) => ({
    label: formatDate(day).replace(/ \d{4}$/, ""),
    value: signupsByDay.get(localDateKey(day)) ?? 0,
  }));

  const totalPunches = events.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Platform"
        description={`Every organization on Activ-HR — usage, billing and status. Signed in as ${identity.fullName}.`}
      />

      <StatTiles
        tiles={[
          { value: String(orgs.length), label: "Organizations" },
          { value: String(paying), label: "Paying" },
          { value: String(trialing), label: "On trial" },
          { value: String(activeOrgs), label: `Active in ${ACTIVE_WINDOW_DAYS}d` },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>New organizations</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyTrendChart data={growthSeries} label="Signups" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Attention</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div>
              <div className="font-display text-4xl leading-none tabular-nums">
                {atRisk}
              </div>
              <div className="font-label mt-1 text-muted-foreground">
                Past due
              </div>
            </div>
            <div>
              <div className="font-display text-4xl leading-none tabular-nums">
                {suspended}
              </div>
              <div className="font-label mt-1 text-muted-foreground">
                Suspended
              </div>
            </div>
            <div>
              <div className="font-display text-4xl leading-none tabular-nums">
                {totalPunches.toLocaleString("en-GB")}
              </div>
              <div className="font-label mt-1 text-muted-foreground">
                Punches / {ACTIVE_WINDOW_DAYS}d
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Organizations</CardTitle>
          <p className="text-sm text-muted-foreground">
            Open an organization to change its plan, billing or suspension.
          </p>
        </CardHeader>
        <CardContent>
          {orgs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No organizations yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Organization</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Sites</TableHead>
                    <TableHead>Last punch</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Billing</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgs.map((org) => {
                    const lastSeen = lastSeenByOrg.get(org.id);
                    return (
                      <TableRow key={org.id}>
                        <TableCell className="pl-5">
                          <div className="flex items-center gap-2.5">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-secondary">
                              <Building2 className="size-4 text-muted-foreground" />
                            </span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Link
                                  href={`/super/orgs/${org.id}`}
                                  className="font-medium underline-offset-4 hover:text-primary hover:underline"
                                >
                                  {org.name}
                                </Link>
                                {org.suspended_at && (
                                  <Badge variant="destructive">Suspended</Badge>
                                )}
                              </div>
                              <div className="font-mono text-xs text-muted-foreground">
                                {org.slug} · joined {formatDate(org.created_at)}
                              </div>
                              {org.suspended_reason && (
                                <div className="mt-1 text-xs text-destructive">
                                  {org.suspended_reason}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {staffByOrg.get(org.id) ?? 0}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {sitesByOrg.get(org.id) ?? 0}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {lastSeen ? formatDate(lastSeen) : "never"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {org.plan_tier}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={BILLING_VARIANT[org.billing_status] ?? "outline"}>
                            {org.billing_status.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Callout variant="note" label="What this page can and can't do">
        Plan tier, billing status and suspension are changed on an
        organization&apos;s own page — open one from the table above. They sit
        next to that organization&apos;s name deliberately: suspension locks
        every member of a tenant out of the product, and that is not a
        control to put in a table row. Migration 0010 still blocks an
        org_admin from changing their own. There is deliberately no delete:
        it would cascade to every employee and attendance event that
        organization has recorded. Suspension is the reversible equivalent.
      </Callout>
    </div>
  );
}
