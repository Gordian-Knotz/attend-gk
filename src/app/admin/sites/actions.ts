"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";

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

  const supabase = await createClient();
  const { error } = await supabase.from("sites").insert({
    org_id: employee.orgId,
    name: input.name,
    geofence_lat: input.lat,
    geofence_lng: input.lng,
    geofence_radius_m: input.radiusM,
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
  const { error } = await supabase.from("sites").delete().eq("id", siteId);

  if (error) return { error: error.message };

  revalidatePath("/admin/sites");
  revalidatePath("/admin");
  return { success: true as const };
}
