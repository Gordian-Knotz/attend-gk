import { Palmtree, Wallet } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";
import { localDateKey } from "@/lib/attendance-series";
import {
  buildLeaveBalances,
  formatLeaveDays,
  LEAVE_COUNTING_RULE,
} from "@/lib/leave-balance";
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
    { data: holidayRows },
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
    // National rows plus this org's own — RLS decides which, so no org filter
    // here. Errors are swallowed on purpose: migration 0015 may be unapplied,
    // and a missing holiday table must not take down a page that works. The
    // fallback is an empty set, which is exactly the pre-0015 behaviour, so the
    // failure mode is "charged a day you should not have been", never a crash.
    supabase
      .from("public_holidays")
      .select("holiday")
      .gte("holiday", `${year}-01-01`)
      .lte("holiday", `${year}-12-31`),
  ]);

  const holidays = new Set((holidayRows ?? []).map((h) => h.holiday as string));

  // Reports its own failure — "No leave requests yet" would otherwise hide
  // a query error behind a state that looks perfectly normal.
  const leaveFailed = Boolean(leaveError);

  // Migration 0014 may not be applied yet, so this table can 404. Rendered as
  // a note rather than an error, and never fails the page: an unprovisioned
  // feature is not a broken one. Kept as its own boolean, separate from
  // `leaveFailed`, so a genuine requests-query error still gets its own error
  // copy above.
  //
  // The copy deliberately does NOT assert which of the two it is. A timeout, a
  // 500 or an RLS denial lands here too, and telling a provisioned customer
  // their leave "isn't set up" would be a false statement about their own
  // configuration. Distinguishing them would mean matching PostgREST error
  // codes, which nobody here has verified against an unapplied migration — a
  // wrong code match would reinstate the same lie while looking rigorous.
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
          holidays,
        });

  return (
    <div className="flex flex-col gap-3">
      <Card id="leave-balance">
        <CardHeader>
          {/* Both cards on this page are scoped to `year`, so both say so.
              Without it, an employee reading "No leave requests yet" on 2
              January is told something false about their December request. */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="size-4 text-muted-foreground" />
              <CardTitle className="text-base">Leave balance</CardTitle>
            </div>
            <Badge variant="outline">{year}</Badge>
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
              Your leave balances couldn&apos;t be loaded — they may not be set
              up for this organization yet. Your requests are listed below and
              are unaffected.
            </Callout>
          ) : balances.length === 0 ? (
            // Reachable in a real window: 0014 applied, but no admin has
            // pressed the grant button yet, or this employee has neither an
            // entitlement nor a leave request this year. Both reads
            // succeeded — this is not a "can't compute" state — there is
            // just nothing to show yet.
            <p className="py-4 text-center text-sm text-muted-foreground">
              No leave entitlements yet for {year}.
            </p>
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
                      : `${formatLeaveDays(b.remaining)} remaining`}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatLeaveDays(b.granted + b.carried)} granted ·{" "}
                    {formatLeaveDays(b.taken)} taken ·{" "}
                    {formatLeaveDays(b.pending)} pending
                  </span>
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">{LEAVE_COUNTING_RULE}</p>
      <Card id="leave">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Palmtree className="size-4 text-muted-foreground" />
              <CardTitle className="text-base">Leave requests</CardTitle>
              <Badge variant="outline">{year}</Badge>
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
                No leave requests in {year}.
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
