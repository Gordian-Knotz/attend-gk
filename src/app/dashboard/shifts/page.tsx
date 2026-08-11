import { CalendarClock } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";
import { DISPLAY_LOCALE, ORG_TIME_ZONE, formatTime } from "@/lib/timezone";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

/**
 * `/dashboard/shifts`: every shift in the next 14 days.
 *
 * Signed-in / employee-row / suspended-org guards all live in the layout —
 * this only runs once `getEmployeeContext` has already returned non-null.
 */
export default async function ShiftsPage() {
  const supabase = await createClient();
  const employee = await getEmployeeContext();
  if (!employee) return null;

  const now = new Date();
  const twoWeeksAhead = new Date(now);
  twoWeeksAhead.setDate(twoWeeksAhead.getDate() + 14);

  const { data: shifts, error } = await supabase
    .from("shifts")
    .select("id, start_at, end_at")
    .eq("employee_id", employee.id)
    .gte("start_at", now.toISOString())
    .lt("start_at", twoWeeksAhead.toISOString())
    .order("start_at", { ascending: true });

  // Reports its own failure. Rendering "No shifts scheduled" when the query
  // actually errored tells a rostered employee they have nothing on — the
  // one wrong answer that has real consequences for a shift worker.
  const shiftsFailed = Boolean(error);

  return (
    <Card id="shifts">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">Upcoming shifts</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {shiftsFailed ? (
          <p className="py-4 text-center text-sm text-destructive">
            Couldn&apos;t load your shifts — reload before assuming
            you&apos;re not rostered.
          </p>
        ) : (
          (!shifts || shifts.length === 0) && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No shifts scheduled in the next 14 days.
            </p>
          )
        )}
        {shifts?.map((shift) => (
          <div
            key={shift.id}
            className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-0"
          >
            <span className="font-medium">
              {new Date(shift.start_at).toLocaleDateString(DISPLAY_LOCALE, {
                weekday: "short",
                month: "short",
                day: "numeric",
                timeZone: ORG_TIME_ZONE,
              })}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {formatTime(shift.start_at)}
              {" – "}
              {formatTime(shift.end_at)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
