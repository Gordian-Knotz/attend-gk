import { MapPin, Building2, CreditCard, Clock } from "lucide-react";

import { getEmployeeContext } from "@/lib/supabase/employee";
import { createClient } from "@/lib/supabase/server";
import { ORG_TIME_ZONE } from "@/lib/timezone";
import { SUPPORT_EMAIL } from "@/lib/brand";
import { PageHeader } from "@/components/admin/page-header";
import { Callout } from "@/components/callout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { OrgNameForm } from "./org-name-form";
import { EditSiteDialog } from "./edit-site-dialog";

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

  const [orgRes, sitesRes] = await Promise.all([
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
  ]);

  // Both queries report their own failure. Doc 11: a failed query rendering as
  // a confident empty state is how "No sites yet" ends up on the screen of an
  // organization that has six.
  const loadFailed = Boolean(orgRes.error || sitesRes.error);
  const org = orgRes.data;
  const sites = sitesRes.data ?? [];

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
              <span className="font-serif text-xl">
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
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-muted-foreground" />
              <CardTitle className="text-base">
                Sites &amp; geofences
              </CardTitle>
            </div>
            <Badge variant="outline">
              {sites.length} site{sites.length === 1 ? "" : "s"}
            </Badge>
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
              <dd className="font-mono text-xs">07:15</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="font-label text-muted-foreground">
                Absent counted from
              </dt>
              <dd className="font-mono text-xs">09:00</dd>
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
