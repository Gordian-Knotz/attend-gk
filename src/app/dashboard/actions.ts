"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { haversineMeters } from "@/lib/geo";

type RecordAttendanceInput = {
  eventType: "check_in" | "check_out";
  /** Client-authoritative timestamp (ISO string) — per Section 04, trusted
   *  over server-arrival time for ordering, since offline-queued events
   *  can land long after they actually happened. */
  occurredAt: string;
  lat: number;
  lng: number;
  source?: "mobile" | "kiosk_qr";
};

export async function recordAttendance(input: RecordAttendanceInput) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not signed in." };
  }

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id, org_id, site_id")
    .eq("id", user.id)
    .single();

  if (employeeError || !employee) {
    return {
      error: "Your account isn't linked to an organization yet — ask your admin to add you.",
    };
  }

  let distanceM: number | null = null;

  // Server-side geofence re-validation — client-side validation is only
  // for instant UX feedback; this is the check that's actually trusted,
  // per Section 09's mitigation for GPS spoofing / buddy punching.
  if (employee.site_id) {
    const { data: site } = await supabase
      .from("sites")
      .select("geofence_lat, geofence_lng, geofence_radius_m")
      .eq("id", employee.site_id)
      .single();

    if (site) {
      distanceM = haversineMeters(
        site.geofence_lat,
        site.geofence_lng,
        input.lat,
        input.lng
      );

      if (distanceM > site.geofence_radius_m) {
        return {
          error: `You're ${Math.round(distanceM)}m from the site — outside the ${site.geofence_radius_m}m geofence. Move closer and try again.`,
        };
      }
    }
  }

  const { error: insertError } = await supabase.from("attendance_events").insert({
    employee_id: employee.id,
    org_id: employee.org_id,
    site_id: employee.site_id,
    source: input.source ?? "mobile",
    event_type: input.eventType,
    occurred_at: input.occurredAt,
    gps_lat: input.lat,
    gps_lng: input.lng,
    distance_m: distanceM,
  });

  if (insertError) {
    return { error: insertError.message };
  }

  revalidatePath("/dashboard");
  return { success: true as const };
}

export async function requestLeave(input: {
  leaveType: string;
  startDate: string;
  endDate: string;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not signed in." };
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("id, org_id")
    .eq("id", user.id)
    .single();

  if (!employee) {
    return { error: "Your account isn't linked to an organization yet." };
  }

  if (new Date(input.endDate) < new Date(input.startDate)) {
    return { error: "End date can't be before the start date." };
  }

  const { error } = await supabase.from("leave_requests").insert({
    employee_id: employee.id,
    org_id: employee.org_id,
    leave_type: input.leaveType,
    start_date: input.startDate,
    end_date: input.endDate,
    status: "pending",
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true as const };
}
