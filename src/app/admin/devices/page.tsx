import { Fingerprint } from "lucide-react";

import { getEmployeeContext } from "@/lib/supabase/employee";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { RegisterDeviceDialog } from "./register-device-dialog";
import { RemoveDeviceButton } from "./remove-device-button";

function timeAgo(iso: string | null) {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default async function DevicesPage() {
  const employee = await getEmployeeContext();
  if (!employee) return null;

  const supabase = await createClient();

  const [{ data: devices }, { data: sites }] = await Promise.all([
    supabase
      .from("biometric_devices")
      // webhook_secret is deliberately NOT selected. It authenticates a
      // terminal, and 'biometric' is the geofence-exempt source in 0007 —
      // so anyone holding one can post unfenced attendance. Rendering even
      // the first 8 characters put it into the page HTML for every viewer
      // and every proxy in between. Retrieval belongs behind an explicit
      // service-role action, not a list view; see doc 11.
      .select("id, device_id, model, site_id, last_seen_at, created_at")
      .eq("org_id", employee.orgId)
      .order("created_at", { ascending: true }),
    supabase.from("sites").select("id, name").eq("org_id", employee.orgId),
  ]);

  const siteNameById = new Map((sites ?? []).map((s) => [s.id, s.name]));
  const canManage = employee.role === "org_admin" || employee.role === "super_admin";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Devices"
        description="Registered biometric terminals per site — the SDK/webhook bridge from Section 04."
        action={canManage ? <RegisterDeviceDialog sites={sites ?? []} /> : undefined}
      />

      <Card>
        <CardContent className="p-0">
          {(!devices || devices.length === 0) ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No devices registered yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Device</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead>Webhook secret</TableHead>
                  {canManage && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="pl-5">
                      <div className="flex items-center gap-2 font-medium">
                        <Fingerprint className="size-4 text-muted-foreground" />
                        {d.device_id}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{siteNameById.get(d.site_id) ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{d.model ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {timeAgo(d.last_seen_at)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      Hidden
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <RemoveDeviceButton deviceId={d.id} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
