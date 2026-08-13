import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";
import { CheckInWidget } from "./checkin-widget";
import { Callout } from "@/components/callout";
import { RoadmapCard } from "@/components/roadmap-card";

/**
 * The `/dashboard` overview: just the clock-in widget.
 *
 * Everything else — the not-signed-in, no-employee-row and suspended-org
 * guards, the header and the sidebar — now live in the layout, since they
 * are properties of the person rather than this page.
 */
export default async function DashboardPage() {
  const supabase = await createClient();

  // Already validated by the layout; `perRequest` means this costs no extra
  // round trip, just a cache hit on the same render.
  const employee = await getEmployeeContext();
  if (!employee) return null;

  const [siteRes, lastEventRes] = await Promise.all([
    supabase
      .from("employees")
      .select("sites(geofence_lat, geofence_lng, geofence_radius_m)")
      .eq("id", employee.id)
      .maybeSingle(),
    supabase
      .from("attendance_events")
      .select("event_type")
      .eq("employee_id", employee.id)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Each query reports its own failure. Rendering the widget with a null
  // geofence when the site query actually errored would let someone punch
  // in unrestricted; rendering "clocked out" when the last-event query
  // errored would show a shift worker the wrong current state.
  if (siteRes.error) {
    return (
      <Callout variant="critical" label="Couldn't load your site">
        Reload the page before clocking in — your geofence couldn&apos;t be
        loaded.
      </Callout>
    );
  }

  if (lastEventRes.error) {
    return (
      <Callout variant="critical" label="Couldn't load your clock-in status">
        Reload the page to try again.
      </Callout>
    );
  }

  const site = Array.isArray(siteRes.data?.sites)
    ? siteRes.data.sites[0]
    : siteRes.data?.sites;

  return (
    <div className="flex flex-col gap-4">
      <CheckInWidget
        siteName={employee.siteName}
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
          (lastEventRes.data?.event_type as "check_in" | "check_out" | undefined) ??
          null
        }
      />

      {/* Below the widget, always. Clocking in is why somebody opens this
          page; the roadmap must never push that button off the screen on a
          phone. Staff see a filtered list — src/lib/roadmap.ts. */}
      <RoadmapCard audience="staff" />
    </div>
  );
}
