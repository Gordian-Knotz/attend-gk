"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";

const MAX_FIELD_LENGTH = 120;

export async function registerDevice(input: {
  siteId: string;
  deviceId: string;
  model: string;
}) {
  const employee = await getEmployeeContext();
  if (!employee || !["org_admin", "super_admin"].includes(employee.role)) {
    return { error: "Only org admins can register devices." };
  }

  const deviceId = input.deviceId?.trim() ?? "";
  const model = input.model?.trim() ?? "";

  if (!deviceId) return { error: "Enter the device's hardware ID." };
  if (deviceId.length > MAX_FIELD_LENGTH || model.length > MAX_FIELD_LENGTH) {
    return { error: `Keep these fields under ${MAX_FIELD_LENGTH} characters.` };
  }
  if (!input.siteId) return { error: "Choose a site for this device." };

  const supabase = await createClient();

  // `org_id` is forced below, but `site_id` was written straight through
  // from the client — so a device row could point at another tenant's site.
  const { data: site, error: siteError } = await supabase
    .from("sites")
    .select("id")
    .eq("id", input.siteId)
    .eq("org_id", employee.orgId)
    .maybeSingle();

  if (siteError) return { error: siteError.message };
  if (!site) return { error: "That site isn't part of your organization." };

  const { error } = await supabase.from("biometric_devices").insert({
    org_id: employee.orgId,
    site_id: input.siteId,
    device_id: deviceId,
    model: model || null,
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
  const query = supabase
    .from("biometric_devices")
    .delete({ count: "exact" })
    .eq("id", id);
  if (employee.role !== "super_admin") {
    query.eq("org_id", employee.orgId);
  }

  const { error, count } = await query;

  if (error) return { error: error.message };
  if (!count) return { error: "Device not found, or you can't remove it." };

  revalidatePath("/admin/devices");
  return { success: true as const };
}
