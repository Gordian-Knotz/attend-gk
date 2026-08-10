"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";

const MAX_NAME_LENGTH = 120;

/** Wide enough for a large depot, narrow enough that the fence still means
 *  something. A radius of 0 or 10^9 disables geofencing by other means. */
const MIN_RADIUS_M = 10;
const MAX_RADIUS_M = 20_000;

type SiteInput = {
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
};

/**
 * Shared by `createSite` and `updateSite`.
 *
 * Extracted rather than copied: doc 11 records three places where the audit
 * found byte-identical security logic living in two files, and the geofence is
 * the exact kind of check where one copy drifting from the other is a hole
 * rather than an inconsistency. An edit path that validated less than the
 * create path would let someone widen a fence to 10^9 metres after the fact.
 */
function validateSiteInput(
  input: SiteInput
): { error: string } | { value: SiteInput } {
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

  return {
    value: {
      name,
      lat: input.lat,
      lng: input.lng,
      radiusM: Math.round(input.radiusM),
    },
  };
}

export async function createSite(input: SiteInput) {
  const employee = await getEmployeeContext();
  if (!employee || !["org_admin", "super_admin"].includes(employee.role)) {
    return { error: "Only org admins can add sites." };
  }

  const checked = validateSiteInput(input);
  // Returned as a fresh literal rather than `return checked`. Every dialog in
  // /admin reads the result as `result?.error`, which only type-checks while
  // the action's inferred return type is a union of object literals — handing
  // back the narrowed variable breaks that normalisation and the error surfaces
  // at the call site, not here.
  if ("error" in checked) return { error: checked.error };
  const { name, lat, lng, radiusM } = checked.value;

  const supabase = await createClient();
  const { error } = await supabase.from("sites").insert({
    org_id: employee.orgId,
    name,
    geofence_lat: lat,
    geofence_lng: lng,
    geofence_radius_m: radiusM,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/sites");
  revalidatePath("/admin");
  return { success: true as const };
}

/**
 * Edits an existing site's name and geofence.
 *
 * Doc 06 listed this as the gap that kept Settings a stub: sites could be
 * added and deleted but never corrected, so a fence entered at the wrong
 * coordinates had to be deleted and recreated — which orphans nothing, but
 * does mean re-entering everything to move a fence by 20 metres.
 *
 * Scoped in the query as well as by RLS, and the affected row count is
 * inspected, so "you can't edit this" is distinguishable from "the policy
 * matched nothing" — the same shape `deleteSite` uses.
 */
export async function updateSite(input: SiteInput & { siteId: string }) {
  const employee = await getEmployeeContext();
  if (!employee || !["org_admin", "super_admin"].includes(employee.role)) {
    return { error: "Only org admins can edit sites." };
  }

  if (!input.siteId) return { error: "No site selected." };

  const checked = validateSiteInput(input);
  // Returned as a fresh literal rather than `return checked`. Every dialog in
  // /admin reads the result as `result?.error`, which only type-checks while
  // the action's inferred return type is a union of object literals — handing
  // back the narrowed variable breaks that normalisation and the error surfaces
  // at the call site, not here.
  if ("error" in checked) return { error: checked.error };
  const { name, lat, lng, radiusM } = checked.value;

  const supabase = await createClient();

  const query = supabase
    .from("sites")
    .update(
      {
        name,
        geofence_lat: lat,
        geofence_lng: lng,
        geofence_radius_m: radiusM,
      },
      { count: "exact" }
    )
    .eq("id", input.siteId);

  if (employee.role !== "super_admin") {
    query.eq("org_id", employee.orgId);
  }

  const { error, count } = await query;

  if (error) return { error: error.message };
  if (!count) return { error: "Site not found, or you can't edit it." };

  revalidatePath("/admin/settings");
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
