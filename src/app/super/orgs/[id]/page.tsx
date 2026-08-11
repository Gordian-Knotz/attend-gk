import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Users } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { localDateKey, recentDays } from "@/lib/attendance-series";
import { formatDate } from "@/lib/timezone";
import { summariseTenant } from "@/lib/tenant-summary";
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
import { PlanSelect, BillingSelect, SuspensionButton } from "../../org-controls";

/** Matches the platform overview's definition of "recently active". */
const WINDOW_DAYS = 30;

const BILLING_LABEL: Record<string, string> = {
  trialing: "On trial",
  active: "Active",
  past_due: "Past due",
  canceled: "Cancelled",
};

/**
 * One tenant, for the vendor.
 *
 * Authorization is already handled three times over before this renders:
 * middleware has `/super` in PROTECTED_PATHS, the /super layout redirects
 * anyone who is not super_admin, and each action re-checks the role. This page
 * adds no check of its own by design — a fourth copy would be a fourth thing
 * to keep in sync.
 *
 * The select lists below deliberately omit `pay_rate` and `employment_type`
 * from the `select` string itself, not from the markup — a column that
 * never leaves Postgres cannot leak through a serialized prop.
 */
export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();

  const now = new Date();

  // `summariseTenant` imports nothing, so the timezone-sensitive work happens
  // here and only here: day keys and labels are resolved up front, and every
  // punch is bucketed through `localDateKey` on the way in. See Task 1.
  const dayDates = recentDays(WINDOW_DAYS, now);
  const windowStart = dayDates[0];
  const days = dayDates.map((day) => ({
    key: localDateKey(day),
    label: formatDate(day).replace(/ \d{4}$/, ""),
  }));

  const [orgRes, sitesRes, employeesRes, eventsRes] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "id, name, slug, plan_tier, billing_status, suspended_at, suspended_reason, created_at"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("sites")
      .select("id, name, geofence_lat, geofence_lng, geofence_radius_m")
      .eq("org_id", id)
      .order("name", { ascending: true }),
    supabase
      .from("employees")
      .select("id, full_name, role, site_id")
      .eq("org_id", id),
    supabase
      .from("attendance_events")
      .select("employee_id, occurred_at")
      .eq("org_id", id)
      .gte("occurred_at", windowStart.toISOString()),
  ]);

  // A failed read here is worse than elsewhere: "0 sites, 0 staff, no usage"
  // for a healthy tenant is indistinguishable from a customer who never
  // onboarded, and someone could suspend on that misreading.
  const loadError =
    orgRes.error ?? sitesRes.error ?? employeesRes.error ?? eventsRes.error;

  if (loadError) {
    return (
      <Callout variant="critical" label="Tenant view unavailable">
        This organization&apos;s details couldn&apos;t be loaded. Reload —
        don&apos;t read the absence of rows as an empty account.
      </Callout>
    );
  }

  const org = orgRes.data;
  if (!org) notFound();

  const summary = summariseTenant({
    days,
    sites: sitesRes.data ?? [],
    employees: employeesRes.data ?? [],
    events: (eventsRes.data ?? []).map((ev) => ({
      employee_id: ev.employee_id,
      occurred_at: ev.occurred_at,
      day_key: localDateKey(new Date(ev.occurred_at)),
    })),
  });

  const suspended = Boolean(org.suspended_at);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/super"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All organizations
      </Link>

      <PageHeader
        title={org.name}
        description={`Joined ${formatDate(new Date(org.created_at))} · ${org.slug}`}
        action={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize">
              {org.plan_tier}
            </Badge>
            <Badge variant={suspended ? "destructive" : "outline"}>
              {suspended
                ? "Suspended"
                : BILLING_LABEL[org.billing_status] ?? org.billing_status}
            </Badge>
          </div>
        }
      />

      {suspended && (
        <Callout
          variant="critical"
          label="Suspended"
          meta={formatDate(new Date(org.suspended_at as string))}
        >
          {org.suspended_reason ??
            "No reason recorded. Their admins and staff see a lockout notice instead of the app."}
        </Callout>
      )}

      <StatTiles
        tiles={[
          { value: String(summary.siteCount), label: "Sites" },
          { value: String(summary.totalStaff), label: "Staff" },
          { value: String(summary.activeStaff), label: `Active in ${WINDOW_DAYS}d` },
          { value: String(summary.totalPunches), label: `Punches in ${WINDOW_DAYS}d` },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <DailyTrendChart data={summary.usageSeries} label="Punches" />
        </CardContent>
      </Card>

      {/* min-w-0 on both columns: a grid item's default min-width is its
          content's min-content width, so without this the Roster table's
          own overflow-x-auto (table.tsx) never gets a chance to absorb the
          overflow — the min-content floor pushes the column, and the page
          body ends up scrolling sideways instead of the table. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-muted-foreground" />
              <CardTitle className="text-base">Sites</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col">
            {(sitesRes.data ?? []).length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No sites yet — this tenant hasn&apos;t set up a geofence.
              </p>
            )}
            {(sitesRes.data ?? []).map((site) => (
              <div
                key={site.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-3 last:border-0"
              >
                <span className="font-medium">{site.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {site.geofence_lat.toFixed(4)}, {site.geofence_lng.toFixed(4)} ·{" "}
                  {site.geofence_radius_m}m · {summary.staffBySite[site.id] ?? 0} staff
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              <CardTitle className="text-base">Roster</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {summary.roster.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nobody on the roster yet.
              </p>
            )}
            {summary.roster.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Last seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.roster.map((person) => (
                    <TableRow key={person.id}>
                      <TableCell className="font-medium">{person.fullName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {person.role.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {person.siteName ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {person.lastSeen
                          ? formatDate(new Date(person.lastSeen))
                          : "Never"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base">Danger zone</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Plan and billing are commercial state. Suspension locks every
            member of this organization out of the product and is reversible.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <PlanSelect orgId={org.id} value={org.plan_tier} />
            <BillingSelect orgId={org.id} value={org.billing_status} />
            <SuspensionButton
              orgId={org.id}
              orgName={org.name}
              suspended={suspended}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
