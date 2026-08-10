"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";

const MAX_NAME_LENGTH = 120;

/** Wide enough for a large depot, narrow enough that the fence still means
 *  something. A radius of 0 or 10^9 disables geofencing by other means. */
const MIN_RADIUS_M = 10;
const MAX_RADIUS_M = 20_000;

export async function createSite(input: {
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
}) {
  const employee = await getEmployeeContext();
  if (!employee || !["org_admin", "super_admin"].includes(employee.role)) {
    return { error: "Only org admins can add sites." };
  }

  const name = input.name?.trim() ?? "";
  if (!name) return { error: "Enter a name for the site." };
  if (name.length > MAX_NAME_LENGTH) {
    return { error: `Site names must be under ${MAX_NAME_LENGTH} characters.` };
  }

  // These three define the geofence. NaN survives a `number` annotation and
  // would make every distance comparison false — i.e. no fence at all.
  const finite = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);

  if (!finite(input.lat) || Math.abs(input.lat) > 90) {
    return { error: "Latitude must be between -90 and 90." };
  }
  if (!finite(input.lng) || Math.abs(input.lng) > 180) {
    return { error: "Longitude must be between -180 and 180." };
  }
  if (
    !finite(input.radiusM) ||
    input.radiusM < MIN_RADIUS_M ||
    input.radiusM > MAX_RADIUS_M
  ) {
    return {
      error: `Radius must be between ${MIN_RADIUS_M} and ${MAX_RADIUS_M} metres.`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("sites").insert({
    org_id: employee.orgId,
    name,
    geofence_lat: input.lat,
    geofence_lng: input.lng,
    geofence_radius_m: Math.round(input.radiusM),
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/sites");
  revalidatePath("/admin");
  return { success: true as const };
}

export async function deleteSite(siteId: string) {
  const employee = await getEmployeeContext();
  if (!employee || !["org_admin", "super_admin"].includes(employee.role)) {
    return { error: "Only org admins can remove sites." };
  }

  const supabase = await createClient();

  // Scoped in the query as well as by RLS. Defence in depth, and it makes
  // the row count below mean "you weren't allowed to" rather than
  // "the policy quietly matched nothing".
  const query = supabase.from("sites").delete({ count: "exact" }).eq("id", siteId);
  if (employee.role !== "super_admin") {
    query.eq("org_id", employee.orgId);
  }

  const { error, count } = await query;

  if (error) return { error: error.message };
  if (!count) return { error: "Site not found, or you can't remove it." };

  revalidatePath("/admin/sites");
  revalidatePath("/admin");
  return { success: true as const };
}
