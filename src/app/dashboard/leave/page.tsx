import { Palmtree, Wallet } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";
import { localDateKey } from "@/lib/attendance-series";
import { buildLeaveBalances } from "@/lib/leave-balance";
import { LeaveRequestDialog } from "../leave-request-dialog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/callout";

const LEAVE_STATUS_VARIANT = {
  pending: "proposed",
  approved: "outline",
  rejected: "destructive",
} as const;

/**
 * `/dashboard/leave`: this year's leave balance, then every leave request the
 * employee has made this year, newest first.
 *
 * Signed-in / employee-row / suspended-org guards all live in the layout —
 * this only runs once `getEmployeeContext` has already returned non-null.
 */
export default async function LeavePage() {
  const supabase = await createClient();
  const employee = await getEmployeeContext();
  if (!employee) return null;

  // The org's timezone, not the server's — `new Date().getFullYear()` would
  // put a Nairobi user into the wrong year for the first three hours of 1
  // January on a UTC host.
  const year = Number(localDateKey(new Date()).slice(0, 4));

  const [
    { data: leaveRequests, error: leaveError },
    { data: entitlements, error: entitlementsError },
  ] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("id, leave_type, start_date, end_date, status")
      .eq("employee_id", employee.id)
      .gte("start_date", `${year}-01-01`)
      .lte("start_date", `${year}-12-31`)
      .order("start_date", { ascending: false }),
    supabase
      .from("leave_entitlements")
      .select("leave_type, days_granted, days_carried")
      .eq("employee_id", employee.id)
      .eq("year", year),
  ]);

  // Reports its own failure — "No leave requests yet" would otherwise hide
  // a query error behind a state that looks perfectly normal.
  const leaveFailed = Boolean(leaveError);

  // Migration 0014 may not be applied yet, so this table can 404. That means
  // the feature isn't provisioned on this org — not that a read broke — so
  // it renders as a note, not an error, and never fails the page. Kept as
  // its own boolean, separate from `leaveFailed`, so a genuine requests-query
  // error still gets its own error copy above.
  const entitlementsFailed = Boolean(entitlementsError);

  // A balance is only trustworthy when both reads actually succeeded.
  // Falling back to `leaveRequests ?? []` on a failed requests read would
  // compute a figure from data that was never loaded — overstating
  // `remaining` for budgeted types, and silently dropping unbudgeted types
  // (e.g. `sick`) that would otherwise only appear because of this year's
  // request activity. Neither is rendered; the balance card shows its own
  // "can't compute this" state instead, below.
  const balances =
    entitlementsFailed || leaveFailed
      ? []
      : buildLeaveBalances({
          year,
          entitlements: entitlements ?? [],
          requests: leaveRequests ?? [],
        });

  return (
    <div className="flex flex-col gap-3">
      <Card id="leave-balance">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Leave balance</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {leaveFailed ? (
            // Checked first, ahead of `entitlementsFailed`: when the
            // requests read has failed we cannot claim "your requests are
            // listed below and are unaffected" — they are not. That claim is
            // only true when this branch is false, so it must not be
            // reachable when it isn't. A failed history read is also the
            // more actionable fact here, and the requests card immediately
            // below is already showing its own error for this same read.
            <Callout variant="note" label="Can't compute balance">
              Your leave history couldn&apos;t be loaded, so this year&apos;s
              balance can&apos;t be worked out right now. Reload the page to
              try again.
            </Callout>
          ) : entitlementsFailed ? (
            <Callout variant="note" label="Balances unavailable">
              Leave balances aren&apos;t set up on this organization yet. Your
              requests are listed below and are unaffected.
            </Callout>
          ) : (
            balances.map((b) => (
              <div
                key={b.leaveType}
                className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-0"
              >
                <span className="capitalize">{b.leaveType}</span>
                <span className="flex flex-col items-end gap-0.5">
                  <span className="font-medium">
                    {b.remaining === null
                      ? "Tracked, no allowance"
                      : `${b.remaining} remaining`}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {b.granted + b.carried} granted · {b.taken} taken ·{" "}
                    {b.pending} pending
                  </span>
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Leave is counted in calendar days, including weekends and public holidays.
        Only approved requests reduce your balance; pending ones are shown separately.
      </p>
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
    </div>
  );
}
