import { Palmtree } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";
import { LeaveRequestDialog } from "../leave-request-dialog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const LEAVE_STATUS_VARIANT = {
  pending: "proposed",
  approved: "outline",
  rejected: "destructive",
} as const;

/**
 * `/dashboard/leave`: every leave request the employee has made, newest
 * first, up to 20 rows.
 *
 * Signed-in / employee-row / suspended-org guards all live in the layout —
 * this only runs once `getEmployeeContext` has already returned non-null.
 */
export default async function LeavePage() {
  const supabase = await createClient();
  const employee = await getEmployeeContext();
  if (!employee) return null;

  const { data: leaveRequests, error } = await supabase
    .from("leave_requests")
    .select("id, leave_type, start_date, end_date, status")
    .eq("employee_id", employee.id)
    .order("start_date", { ascending: false })
    .limit(20);

  // Reports its own failure — "No leave requests yet" would otherwise hide
  // a query error behind a state that looks perfectly normal.
  const leaveFailed = Boolean(error);

  return (
    <div className="flex flex-col gap-3">
      <Card id="leave">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Palmtree className="size-4 text-muted-foreground" />
              <CardTitle className="text-base">Leave</CardTitle>
            </div>
            <LeaveRequestDialog />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {leaveFailed ? (
            <p className="py-4 text-center text-sm text-destructive">
              Couldn&apos;t load your leave requests.
            </p>
          ) : (
            (!leaveRequests || leaveRequests.length === 0) && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No leave requests yet.
              </p>
            )
          )}
          {leaveRequests?.map((lr) => (
            <div
              key={lr.id}
              className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-0"
            >
              <span className="capitalize">{lr.leave_type}</span>
              <span className="flex items-center gap-3">
                <span className="font-mono text-xs text-muted-foreground">
                  {lr.start_date === lr.end_date
                    ? lr.start_date
                    : `${lr.start_date} – ${lr.end_date}`}
                </span>
                <Badge
                  variant={
                    LEAVE_STATUS_VARIANT[lr.status as keyof typeof LEAVE_STATUS_VARIANT] ??
                    "outline"
                  }
                >
                  {lr.status}
                </Badge>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Leave balances aren&apos;t tracked yet — this list is every request
        you&apos;ve made.
      </p>
    </div>
  );
}
