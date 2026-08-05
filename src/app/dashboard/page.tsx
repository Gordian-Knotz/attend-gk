import Link from "next/link";
import { CalendarClock, History, Palmtree } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { CheckInWidget } from "./checkin-widget";
import { SignOutButton } from "./sign-out-button";
import { LeaveRequestDialog } from "./leave-request-dialog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/motion/reveal";

const LEAVE_STATUS_VARIANT = {
  pending: "proposed",
  approved: "outline",
  rejected: "destructive",
} as const;

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted-foreground">
          You need to be signed in to view your dashboard.
        </p>
        <Link href="/login" className="text-primary underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("id, full_name, site_id, sites(name, geofence_lat, geofence_lng, geofence_radius_m)")
    .eq("id", user.id)
    .maybeSingle();

  if (!employee) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted-foreground">
          Your account (<span className="font-mono">{user.email}</span>)
          isn&apos;t linked to an organization yet.
        </p>
        <p className="text-sm text-muted-foreground">
          Ask your admin to add you as an employee, or{" "}
          <Link href="/onboarding" className="text-primary underline">
            set up your own organization
          </Link>
          .
        </p>
        <SignOutButton />
      </div>
    );
  }

  const site = Array.isArray(employee.sites) ? employee.sites[0] : employee.sites;

  const now = new Date();
  const weekAhead = new Date(now);
  weekAhead.setDate(weekAhead.getDate() + 7);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [{ data: lastEvent }, { data: upcomingShifts }, { data: recentEvents }, { data: leaveRequests }] =
    await Promise.all([
      supabase
        .from("attendance_events")
        .select("event_type")
        .eq("employee_id", user.id)
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("shifts")
        .select("id, start_at, end_at")
        .eq("employee_id", user.id)
        .gte("start_at", now.toISOString())
        .lt("start_at", weekAhead.toISOString())
        .order("start_at", { ascending: true }),
      supabase
        .from("attendance_events")
        .select("id, event_type, occurred_at")
        .eq("employee_id", user.id)
        .gte("occurred_at", weekAgo.toISOString())
        .order("occurred_at", { ascending: false })
        .limit(8),
      supabase
        .from("leave_requests")
        .select("id, leave_type, start_date, end_date, status")
        .eq("employee_id", user.id)
        .order("start_date", { ascending: false })
        .limit(5),
    ]);

  const firstName = employee.full_name.split(" ")[0];
  const today = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-secondary/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <div>
            <div className="font-serif text-xl">Hi, {firstName}</div>
            <div className="text-sm text-muted-foreground">{today}</div>
          </div>
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
      <Reveal className="flex flex-col gap-6" distance={16} duration={0.45}>
        <CheckInWidget
          siteName={site?.name ?? null}
          geofence={
            site
              ? {
                  lat: site.geofence_lat,
                  lng: site.geofence_lng,
                  radiusM: site.geofence_radius_m,
                }
              : null
          }
          initialLastEvent={
            (lastEvent?.event_type as "check_in" | "check_out" | undefined) ?? null
          }
        />

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CalendarClock className="size-4 text-muted-foreground" />
                <CardTitle className="text-base">This week&apos;s shifts</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {(!upcomingShifts || upcomingShifts.length === 0) && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No shifts scheduled in the next 7 days.
                </p>
              )}
              {upcomingShifts?.map((shift) => (
                <div
                  key={shift.id}
                  className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-0"
                >
                  <span className="font-medium">
                    {new Date(shift.start_at).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Date(shift.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {" – "}
                    {new Date(shift.end_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <History className="size-4 text-muted-foreground" />
                <CardTitle className="text-base">Recent activity</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {(!recentEvents || recentEvents.length === 0) && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No check-ins in the last 7 days yet.
                </p>
              )}
              {recentEvents?.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-0"
                >
                  <span>
                    {new Date(ev.occurred_at).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant={ev.event_type === "check_in" ? "attention" : "outline"}>
                      {ev.event_type === "check_in" ? "In" : "Out"}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {new Date(ev.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
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
            {(!leaveRequests || leaveRequests.length === 0) && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No leave requests yet.
              </p>
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
                  <Badge variant={LEAVE_STATUS_VARIANT[lr.status as keyof typeof LEAVE_STATUS_VARIANT] ?? "outline"}>
                    {lr.status}
                  </Badge>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </Reveal>
      </main>
    </div>
  );
}
