import { getEmployeeContext } from "@/lib/supabase/employee";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { InviteStaffDialog } from "./invite-dialog";
import { RemoveStaffButton } from "./remove-staff-button";

const ROLE_VARIANT = {
  staff: "outline",
  manager: "attention",
  org_admin: "default",
  super_admin: "default",
} as const;

const ROLE_LABEL: Record<string, string> = {
  staff: "Staff",
  manager: "Manager",
  org_admin: "Org Admin",
  super_admin: "Super Admin",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default async function StaffPage() {
  const employee = await getEmployeeContext();
  if (!employee) return null;

  const supabase = await createClient();

  const [{ data: staff }, { data: sites }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, role, site_id, employment_type, created_at")
      .eq("org_id", employee.orgId)
      .order("created_at", { ascending: true }),
    supabase.from("sites").select("id, name").eq("org_id", employee.orgId),
  ]);

  const siteNameById = new Map((sites ?? []).map((s) => [s.id, s.name]));
  const canManage = employee.role === "org_admin" || employee.role === "super_admin";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Staff"
        description="Employee roster, roles, and site assignments."
        action={canManage ? <InviteStaffDialog sites={sites ?? []} /> : undefined}
      />

      <Card>
        <CardContent className="p-0">
          {(!staff || staff.length === 0) ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No staff yet — invite your first employee.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Employment</TableHead>
                  {canManage && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="pl-5">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>{initials(s.full_name)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{s.full_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ROLE_VARIANT[s.role as keyof typeof ROLE_VARIANT] ?? "outline"}>
                        {ROLE_LABEL[s.role] ?? s.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.site_id ? siteNameById.get(s.site_id) ?? "—" : "Unassigned"}
                    </TableCell>
                    <TableCell className="text-muted-foreground capitalize">
                      {s.employment_type.replace("_", " ")}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        {s.id !== employee.id && (
                          <RemoveStaffButton employeeId={s.id} employeeName={s.full_name} />
                        )}
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
