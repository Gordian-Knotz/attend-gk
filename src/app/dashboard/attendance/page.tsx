import { History } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";
import { DISPLAY_LOCALE, ORG_TIME_ZONE, formatTime } from "@/lib/timezone";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * `/dashboard/attendance`: the last 30 days of check-ins, up to 50 rows.
 *
 * Signed-in / employee-row / suspended-org guards all live in the layout —
 * this only runs once `getEmployeeContext` has already returned non-null.
 */
export default async function AttendancePage() {
  const supabase = await createClient();
  const employee = await getEmployeeContext();
  if (!employee) return null;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: events, error } = await supabase
    .from("attendance_events")
    .select("id, event_type, occurred_at")
    .eq("employee_id", employee.id)
    .gte("occurred_at", thirtyDaysAgo.toISOString())
    .order("occurred_at", { ascending: false })
    .limit(50);

  // Reports its own failure — an empty state here would tell someone their
  // history is clean when the query actually errored.
  const eventsFailed = Boolean(error);

  return (
    <Card id="history">
      <CardHeader>
        <div className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">Attendance history</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {eventsFailed ? (
          <p className="py-4 text-center text-sm text-destructive">
            Couldn&apos;t load your attendance history.
          </p>
        ) : (
          (!events || events.length === 0) && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No check-ins in the last 30 days yet.
            </p>
          )
        )}
        {events?.map((ev) => (
          <div
            key={ev.id}
            className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-0"
          >
            <span>
              {new Date(ev.occurred_at).toLocaleDateString(DISPLAY_LOCALE, {
                weekday: "short",
                month: "short",
                day: "numeric",
                timeZone: ORG_TIME_ZONE,
              })}
            </span>
            <span className="flex items-center gap-2">
              <Badge variant={ev.event_type === "check_in" ? "attention" : "outline"}>
                {ev.event_type === "check_in" ? "In" : "Out"}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">
                {formatTime(ev.occurred_at)}
              </span>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
