import { MapPin, Building2, CreditCard, Clock, Palmtree, Network } from "lucide-react";

import { getEmployeeContext } from "@/lib/supabase/employee";
import { createClient } from "@/lib/supabase/server";
import { ORG_TIME_ZONE } from "@/lib/timezone";
import { LATE_CUTOFF_HOUR, LATE_CUTOFF_MINUTE } from "@/lib/attendance";
import { ABSENT_CUTOFF_HOUR, localDateKey } from "@/lib/attendance-series";
import { LEAVE_COUNTING_RULE } from "@/lib/leave-balance";
import { SUPPORT_EMAIL } from "@/lib/brand";
import { PageHeader } from "@/components/admin/page-header";
import { Callout } from "@/components/callout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { OrgNameForm } from "./org-name-form";
import { EditSiteDialog } from "./edit-site-dialog";
import { LeavePolicyForm, type LeavePolicyValue } from "./leave-policy-form";
import { GrantEntitlementsButton } from "./grant-entitlements-button";
import { OrgLevelsForm, type OrgLevel } from "./org-levels-form";

const pad = (n: number) => String(n).padStart(2, "0");

const BILLING_LABEL: Record<string, string> = {
  trialing: "On trial",
  active: "Active",
  past_due: "Past due",
  canceled: "Cancelled",
};

const BILLING_VARIANT: Record<
  string,
  "default" | "attention" | "outline" | "destructive"
> = {
  trialing: "attention",
  active: "default",
  past_due: "destructive",
  canceled: "outline",
};

export default async function SettingsPage() {
  const employee = await getEmployeeContext();
  if (!employee) return null;

  const canManage =
    employee.role === "org_admin" || employee.role === "super_admin";

  const supabase = await createClient();

  // The org's timezone, not the server's — matches `/dashboard/leave`, which
  // computes "this year" the same way for the same reason.
  const year = Number(localDateKey(new Date()).slice(0, 4));

  const [orgRes, sitesRes, leavePoliciesRes, leaveEntitlementsRes, levelsRes, levelMembersRes] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("id, name, slug, plan_tier, billing_status, created_at")
        .eq("id", employee.orgId)
        .maybeSingle(),
      supabase
        .from("sites")
        .select("id, name, geofence_lat, geofence_lng, geofence_radius_m")
        .eq("org_id", employee.orgId)
        .order("created_at", { ascending: true }),
      supabase
        .from("leave_policies")
        .select("leave_type, annual_days, carry_over_max, accrual_mode")
        .eq("org_id", employee.orgId),
      // Only admins are shown the entitled-employee count, so only admins run
      // the query. Not merely to save a round trip: its error feeds
      // `leaveLoadFailed` below, which replaces the whole Leave card —
      // including the read-only policy list a manager IS meant to see. A
      // manager losing that list to a query that exists solely for the admin
      // count is a correctness bug, and gating the query closes both.
      canManage
        ? supabase
            .from("leave_entitlements")
            .select("employee_id")
            .eq("org_id", employee.orgId)
            .eq("year", year)
        : Promise.resolve({
            data: [] as { employee_id: string }[],
            error: null,
          }),
      supabase
        .from("org_levels")
        .select("id, name, rank, suggested_tier, visibility_scope")
        .eq("org_id", employee.orgId)
        .order("rank", { ascending: true })
        .order("name", { ascending: true }),
      // Counted in the app rather than with a grouped query: PostgREST has no
      // GROUP BY, and 0023's `on delete restrict` means an admin needs to know
      // who is in the way *before* pressing remove.
      supabase
        .from("employees")
        .select("org_level_id")
        .eq("org_id", employee.orgId)
        .not("org_level_id", "is", null),
    ]);

  // Both queries report their own failure. Doc 11: a failed query rendering as
  // a confident empty state is how "No sites yet" ends up on the screen of an
  // organization that has six.
  const loadFailed = Boolean(orgRes.error || sitesRes.error);
  const org = orgRes.data;
  const sites = sitesRes.data ?? [];

  // Same reasoning as the leave block below: 0023 may not be applied on every
  // environment, and one unapplied migration must not take the whole page with
  // it. An empty ladder renders the preset picker, which is also the correct
  // thing to show a genuinely unconfigured org.
  const levelMemberCounts = new Map<string, number>();
  for (const row of levelMembersRes.data ?? []) {
    if (!row.org_level_id) continue;
    levelMemberCounts.set(
      row.org_level_id,
      (levelMemberCounts.get(row.org_level_id) ?? 0) + 1
    );
  }
  const orgLevels: OrgLevel[] = (levelsRes.data ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    rank: Number(l.rank),
    suggested_tier: l.suggested_tier,
    visibility_scope: l.visibility_scope,
    memberCount: levelMemberCounts.get(l.id) ?? 0,
  }));

  // Kept apart from `loadFailed`: migration 0014 may not be applied on every
  // environment yet, and a card that dies because one unapplied migration
  // 404s is worse than a card that says it cannot load. This never touches
  // the page-level error state above.
  const leaveLoadFailed = Boolean(
    leavePoliciesRes.error || leaveEntitlementsRes.error
  );
  const leavePolicies: LeavePolicyValue[] = (leavePoliciesRes.data ?? []).map(
    (p) => ({
      leaveType: p.leave_type,
      annualDays: Number(p.annual_days) || 0,
      carryOverMax: Number(p.carry_over_max) || 0,
      // Anything other than 'monthly' reads as 'annual', so a row written before
      // 0017 (or by an older client) behaves exactly as it did before.
      accrualMode: p.accrual_mode === "monthly" ? "monthly" : "annual",
    })
  );
  // Distinct employees, not rows: one employee can hold up to four rows (one
  // per leave type with a policy), and counting rows would overstate how
  // many people are actually covered for the year.
  const entitledEmployeeCount = new Set(
    (leaveEntitlementsRes.data ?? []).map((e) => e.employee_id)
  ).size;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Organization details, geofences, and your plan."
      />

      {loadFailed && (
        <Callout variant="critical" label="Couldn't load settings">
          One or more queries failed, so what&apos;s below may be incomplete.
          Reload before changing anything.
        </Callout>
      )}

      {!canManage && (
        <Callout variant="note" label="Read only">
          Managers can see these settings but not change them. Ask an
          organization admin to make edits.
        </Callout>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Organization</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {canManage ? (
            <OrgNameForm currentName={org?.name ?? employee.orgName} />
          ) : (
            <div className="flex flex-col gap-1">
              <span className="font-label text-muted-foreground">Name</span>
              <span className="font-display text-xl">
                {org?.name ?? employee.orgName}
              </span>
            </div>
          )}

          <Separator />

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt className="font-label text-muted-foreground">Slug</dt>
              <dd className="font-mono text-xs">{org?.slug ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="font-label text-muted-foreground">Created</dt>
              <dd>
                {org?.created_at
                  ? new Date(org.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      timeZone: ORG_TIME_ZONE,
                    })
                  : "—"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Network className="size-4 text-primary" strokeWidth={1.75} />
            <CardTitle className="text-base">Structure</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <OrgLevelsForm levels={orgLevels} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Plan &amp; billing</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="capitalize">
              {org?.plan_tier ?? "—"}
            </Badge>
            <Badge
              variant={
                BILLING_VARIANT[org?.billing_status ?? ""] ?? "outline"
              }
            >
              {BILLING_LABEL[org?.billing_status ?? ""] ??
                org?.billing_status ??
                "—"}
            </Badge>
          </div>

          {/*
            Read-only on purpose, and not merely by convention: migration 0010
            installs a BEFORE UPDATE trigger that lets an org_admin change
            nothing on this row but its name. Rendering an editable control
            here would produce a form that always fails at the database.
          */}
          <Callout variant="note" label="Changing your plan">
            Plan tier and billing status are set by us, not from this screen.
            Email{" "}
            <a className="text-primary underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>{" "}
            to upgrade, downgrade or query an invoice.
          </Callout>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palmtree className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Leave</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {leaveLoadFailed ? (
            <Callout variant="note" label="Couldn't load leave settings">
              Leave policy and entitlements couldn&apos;t be loaded. Reload the
              page before making any changes here.
            </Callout>
          ) : canManage ? (
            <>
              <LeavePolicyForm policies={leavePolicies} />

              <Separator />

              <GrantEntitlementsButton year={year} />

              <p className="text-sm text-muted-foreground">
                {entitledEmployeeCount === 0
                  ? `No employees have a ${year} entitlement yet.`
                  : `${entitledEmployeeCount} employee${
                      entitledEmployeeCount === 1 ? "" : "s"
                    } already ${
                      entitledEmployeeCount === 1 ? "has" : "have"
                    } a ${year} entitlement.`}
              </p>
            </>
          ) : (
            <div className="flex flex-col">
              {leavePolicies.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No leave policy set yet.
                </p>
              )}
              {leavePolicies.map((p) => (
                <div
                  key={p.leaveType}
                  className="flex items-center justify-between border-b border-border py-3 last:border-0"
                >
                  <span className="capitalize">{p.leaveType}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {p.annualDays} days/yr · carry over up to {p.carryOverMax}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">{LEAVE_COUNTING_RULE}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-muted-foreground" />
              <CardTitle className="text-base">
                Sites &amp; geofences
              </CardTitle>
            </div>
            {!loadFailed && (
              <Badge variant="outline">
                {sites.length} site{sites.length === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col">
          {!loadFailed && sites.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No sites yet. Add one from{" "}
              <span className="font-medium">Sites</span> to set a geofence.
            </p>
          )}

          {sites.map((site) => (
            <div
              key={site.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-medium">{site.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {site.geofence_lat.toFixed(5)},{" "}
                  {site.geofence_lng.toFixed(5)} · {site.geofence_radius_m}m
                </span>
              </div>
              {canManage && <EditSiteDialog site={site} />}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Time &amp; cutoffs</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <dt className="font-label text-muted-foreground">Timezone</dt>
              <dd className="font-mono text-xs">{ORG_TIME_ZONE}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="font-label text-muted-foreground">Late after</dt>
              <dd className="font-mono text-xs">
                {pad(LATE_CUTOFF_HOUR)}:{pad(LATE_CUTOFF_MINUTE)}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="font-label text-muted-foreground">
                Absent counted from
              </dt>
              <dd className="font-mono text-xs">{pad(ABSENT_CUTOFF_HOUR)}:00</dd>
            </div>
          </dl>

          {/*
            Shown rather than hidden because these three values decide whether
            somebody is recorded as late, and an admin reading a report has a
            right to know what the numbers were computed against. They are not
            editable yet: the timezone is an environment variable and the two
            cutoffs are constants applied org-wide. Doc 06 has the real fix —
            per-shift comparison against `shifts.start_at`, and `sites.timezone`
            for an org spanning zones. Both need migrations.
          */}
          <Callout variant="note" label="Not configurable yet">
            These apply to your whole organization. Per-site timezones and
            per-shift late rules both need a schema change — tell us if you
            need them and we&apos;ll prioritise it.
          </Callout>
        </CardContent>
      </Card>
    </div>
  );
}
