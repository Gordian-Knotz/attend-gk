import { getEmployeeContext } from "@/lib/supabase/employee";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddShiftDialog } from "./shift-dialog";
import { DeleteShiftButton } from "./delete-shift-button";

export default async function SchedulePage() {
  const employee = await getEmployeeContext();
  if (!employee) return null;

  const supabase = await createClient();

  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 14);

  const [{ data: shifts }, { data: employees }, { data: sites }] = await Promise.all([
    supabase
      .from("shifts")
      .select("id, employee_id, site_id, start_at, end_at, status")
      .gte("start_at", start.toISOString())
      .lt("start_at", end.toISOString())
      .order("start_at", { ascending: true }),
    supabase
      .from("employees")
      .select("id, full_name, site_id")
      .eq("org_id", employee.orgId)
      .in("role", ["staff", "manager"]),
    supabase.from("sites").select("id, name").eq("org_id", employee.orgId),
  ]);

  const employeeNameById = new Map((employees ?? []).map((e) => [e.id, e.full_name]));
  const siteNameById = new Map((sites ?? []).map((s) => [s.id, s.name]));
  const canManage = ["org_admin", "super_admin", "manager"].includes(employee.role);

  const byDay = new Map<string, typeof shifts>();
  for (const shift of shifts ?? []) {
    const day = shift.start_at.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(shift);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Schedule"
        description="Shift rosters for the next 14 days."
        action={
          canManage ? (
            <AddShiftDialog employees={employees ?? []} sites={sites ?? []} />
          ) : undefined
        }
      />

      {(!shifts || shifts.length === 0) && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No shifts scheduled in the next 14 days.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {Array.from(byDay.entries()).map(([day, dayShifts]) => (
          <Card key={day}>
            <CardHeader>
              <CardTitle className="font-mono text-sm font-normal tracking-wide uppercase text-muted-foreground">
                {new Date(day).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {dayShifts!.map((shift) => (
                <div
                  key={shift.id}
                  className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">
                      {employeeNameById.get(shift.employee_id) ?? "Unknown"}
                    </span>
                    <Badge variant="outline">
                      {siteNameById.get(shift.site_id) ?? "—"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground">
                      {new Date(shift.start_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {" – "}
                      {new Date(shift.end_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {canManage && <DeleteShiftButton shiftId={shift.id} />}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
