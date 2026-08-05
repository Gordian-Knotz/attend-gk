import { MapPin, Fingerprint, Users } from "lucide-react";

import { getEmployeeContext } from "@/lib/supabase/employee";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddSiteDialog } from "./site-dialog";
import { DeleteSiteButton } from "./delete-site-button";

export default async function SitesPage() {
  const employee = await getEmployeeContext();
  if (!employee) return null;

  const supabase = await createClient();

  const [{ data: sites }, { data: employees }, { data: devices }] = await Promise.all([
    supabase
      .from("sites")
      .select("id, name, geofence_lat, geofence_lng, geofence_radius_m, created_at")
      .eq("org_id", employee.orgId)
      .order("created_at", { ascending: true }),
    supabase
      .from("employees")
      .select("id, site_id")
      .eq("org_id", employee.orgId),
    supabase
      .from("biometric_devices")
      .select("id, site_id")
      .eq("org_id", employee.orgId),
  ]);

  const canManage = employee.role === "org_admin" || employee.role === "super_admin";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Sites"
        description="Physical work locations, geofences, and per-site staffing."
        action={canManage ? <AddSiteDialog /> : undefined}
      />

      {(!sites || sites.length === 0) && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No sites yet — add one to start scheduling staff there.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(sites ?? []).map((site) => {
          const staffCount = (employees ?? []).filter((e) => e.site_id === site.id).length;
          const deviceCount = (devices ?? []).filter((d) => d.site_id === site.id).length;

          return (
            <Card key={site.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle>{site.name}</CardTitle>
                  {canManage && <DeleteSiteButton siteId={site.id} siteName={site.name} />}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="size-3.5" />
                  {site.geofence_lat.toFixed(4)}, {site.geofence_lng.toFixed(4)} · {site.geofence_radius_m}m radius
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline">
                    <Users className="size-3" /> {staffCount} staff
                  </Badge>
                  <Badge variant="outline">
                    <Fingerprint className="size-3" /> {deviceCount} device{deviceCount === 1 ? "" : "s"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
