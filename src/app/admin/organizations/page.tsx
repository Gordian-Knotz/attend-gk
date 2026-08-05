import { redirect } from "next/navigation";

import { getEmployeeContext } from "@/lib/supabase/employee";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/page-header";
import { Callout } from "@/components/callout";
import { StatTiles } from "@/components/site/stat-tiles";
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

const PLAN_VARIANT = {
  starter: "outline",
  growth: "attention",
  enterprise: "default",
} as const;

export default async function OrganizationsPage() {
  const identity = await getEmployeeContext();
  if (!identity) redirect("/onboarding");

  // Platform-wide view — PAC's own operator account only. RLS would return
  // just the caller's own org for anyone else anyway, but failing closed in
  // the UI keeps the page honest about who it's for.
  if (identity.role !== "super_admin") redirect("/admin");

  const supabase = await createClient();

  const [{ data: orgs }, { data: employees }, { data: sites }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, slug, plan_tier, billing_status, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("employees").select("id, org_id, role"),
    supabase.from("sites").select("id, org_id"),
  ]);

  // Counted in memory rather than with per-org count queries: the platform
  // has a handful of orgs, and this is one round trip instead of 2N.
  const staffByOrg = new Map<string, number>();
  for (const e of employees ?? []) {
    staffByOrg.set(e.org_id, (staffByOrg.get(e.org_id) ?? 0) + 1);
  }
  const sitesByOrg = new Map<string, number>();
  for (const s of sites ?? []) {
    sitesByOrg.set(s.org_id, (sitesByOrg.get(s.org_id) ?? 0) + 1);
  }

  const rows = (orgs ?? []).map((org) => ({
    ...org,
    staff: staffByOrg.get(org.id) ?? 0,
    sites: sitesByOrg.get(org.id) ?? 0,
  }));

  const admins = (employees ?? []).filter((e) =>
    ["org_admin", "super_admin"].includes(e.role)
  ).length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Organizations"
        description="Every client organization on the platform."
      />

      <StatTiles
        tiles={[
          { value: String(rows.length), label: "Organizations" },
          { value: String(employees?.length ?? 0), label: "Staff, all orgs" },
          { value: String(sites?.length ?? 0), label: "Sites, all orgs" },
          { value: String(admins), label: "Admin accounts" },
        ]}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All organizations</CardTitle>
            <Badge variant="outline">{rows.length} total</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No organizations yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Billing</TableHead>
                    <TableHead className="text-right">Staff</TableHead>
                    <TableHead className="text-right">Sites</TableHead>
                    <TableHead className="text-right">Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((org) => (
                    <TableRow key={org.id}>
                      <TableCell>
                        <div className="font-medium">{org.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {org.slug}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            PLAN_VARIANT[
                              org.plan_tier as keyof typeof PLAN_VARIANT
                            ] ?? "outline"
                          }
                        >
                          {org.plan_tier}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {org.billing_status}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {org.staff}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {org.sites}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {new Date(org.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Callout variant="note" label="Read-only for now">
        Switching the rest of the admin dashboard into another organization&apos;s
        context isn&apos;t built yet — every other page still scopes to{" "}
        {identity.orgName}.
      </Callout>
    </div>
  );
}
