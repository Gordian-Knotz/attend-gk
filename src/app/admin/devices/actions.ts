"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";

export async function registerDevice(input: {
  siteId: string;
  deviceId: string;
  model: string;
}) {
  const employee = await getEmployeeContext();
  if (!employee || !["org_admin", "super_admin"].includes(employee.role)) {
    return { error: "Only org admins can register devices." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("biometric_devices").insert({
    org_id: employee.orgId,
    site_id: input.siteId,
    device_id: input.deviceId,
    model: input.model || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/devices");
  return { success: true as const };
}

export async function removeDevice(id: string) {
  const employee = await getEmployeeContext();
  if (!employee || !["org_admin", "super_admin"].includes(employee.role)) {
    return { error: "Only org admins can remove devices." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("biometric_devices").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/devices");
  return { success: true as const };
}
