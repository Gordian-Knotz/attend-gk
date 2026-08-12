import { CalendarCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";
import { localDateKey } from "@/lib/attendance-series";
import { countLeaveDays, LEAVE_COUNTING_RULE } from "@/lib/leave-balance";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/callout";
import { DecideButtons } from "./decide-buttons";

export const metadata = { title: "Activ-HR — Leave approvals" };

const STATUS_VARIANT = {
  pending: "proposed",
  approved: "outline",
  rejected: "destructive",
  cancelled: "outline",
} as const;

/**
 * `/admin/leave`: decide leave requests.
 *
 * This page exists because nothing in the application could approve leave. The
 * table has allowed it since 0001, but no code ever wrote `status`, so requests
 * sat pending indefinitely and — since only approved leave reduces a balance —
 * every balance showed a full allowance no matter how much leave had been taken.
 *
 * What a viewer may decide is enforced by migration 0016's RLS and trigger, not
 * here: a manager decides for their own site, an admin for the org, and nobody
 * decides their own request. This page shows what the caller can read, which
 * the four-tier SELECT policy already scopes correctly.
 */
export default async function AdminLeavePage() {
  const supabase = await createClient();
  const employee = await getEmployeeContext();
  if (!employee) return null;

  const year = Number(localDateKey(new Date()).slice(0, 4));

  const [{ data: requests, error }, { data: staff }, { data: holidayRows }] =
    await Promise.all([
      supabase
        .from("leave_requests")
        .select(
          "id, employee_id, leave_type, start_date, end_date, status, decided_at, decision_note"
        )
        .eq("org_id", employee.orgId)
        .gte("start_date", `${year}-01-01`)
        .order("status", { ascending: true })
        .order("start_date", { ascending: true }),
      supabase
        .from("employees")
        .select("id, full_name")
        .eq("org_id", employee.orgId),
      supabase
        .from("public_holidays")
        .select("holiday")
        .gte("holiday", `${year}-01-01`)
        .lte("holiday", `${year}-12-31`),
    ]);

  // `decided_at` and `decision_note` only exist once 0016 is applied, so this
  // read fails closed until then rather than rendering a page that cannot
  // actually decide anything. Same schema-guard reasoning as the notices rail:
  // a surface that half-works is worse than one that says it does not.
  const loadFailed = Boolean(error);

  const holidays = new Set((holidayRows ?? []).map((h) => h.holiday as string));
  const nameOf = new Map((staff ?? []).map((s) => [s.id as string, s.full_name as string]));

  const pending = (requests ?? []).filter((r) => r.status === "pending");
  const decided = (requests ?? []).filter((r) => r.status !== "pending").slice(0, 25);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl">Leave approvals</h1>
        <p className="text-sm text-muted-foreground">
          Requests for {year}. Managers decide for their own site; admins for the
          organization.
        </p>
      </div>

      {loadFailed ? (
        <Callout variant="note" label="Approvals unavailable">
          Leave requests couldn&apos;t be loaded. If leave approvals have just
          been added, the database may not have been updated yet.
        </Callout>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarCheck className="size-4 text-muted-foreground" />
                  <CardTitle className="text-base">Awaiting a decision</CardTitle>
                </div>
                <Badge variant="outline">{pending.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {pending.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Nothing waiting. Every request for {year} has been decided.
                </p>
              ) : (
                pending.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-4 border-b border-border py-3 text-sm last:border-0"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">
                        {nameOf.get(r.employee_id as string) ?? "Unknown employee"}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        <span className="capitalize">{r.leave_type}</span>
                        {" · "}
                        {r.start_date === r.end_date
                          ? r.start_date
                          : `${r.start_date} – ${r.end_date}`}
                        {" · "}
                        {countLeaveDays(
                          r.start_date as string,
                          r.end_date as string,
                          holidays
                        )}{" "}
                        days
                      </span>
                    </div>
                    <DecideButtons requestId={r.id as string} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recently decided</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {decided.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No decisions yet for {year}.
                </p>
              ) : (
                decided.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-4 border-b border-border py-2.5 text-sm last:border-0"
                  >
                    <span className="truncate">
                      {nameOf.get(r.employee_id as string) ?? "Unknown employee"}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-mono text-xs text-muted-foreground">
                        {r.start_date === r.end_date
                          ? r.start_date
                          : `${r.start_date} – ${r.end_date}`}
                      </span>
                      <Badge
                        variant={
                          STATUS_VARIANT[r.status as keyof typeof STATUS_VARIANT] ??
                          "outline"
                        }
                      >
                        {r.status}
                      </Badge>
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">{LEAVE_COUNTING_RULE}</p>
        </>
      )}
    </div>
  );
}
