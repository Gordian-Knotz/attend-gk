import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { CheckInClient } from "./checkin-client";
import { SignOutButton } from "./sign-out-button";

export default async function CheckInPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // middleware.ts already redirects unauthenticated requests to /login,
  // but keep this as a defensive fallback (e.g. Supabase not configured).
  if (!user) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted-foreground">
          You need to be signed in to clock in or out.
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

  const { data: lastEvent } = await supabase
    .from("attendance_events")
    .select("event_type")
    .eq("employee_id", user.id)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-16">
      <div className="text-center">
        <div className="font-label text-muted-foreground">
          {employee.full_name}
        </div>
      </div>

      <CheckInClient
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

      <div className="text-center">
        <SignOutButton />
      </div>
    </div>
  );
}
