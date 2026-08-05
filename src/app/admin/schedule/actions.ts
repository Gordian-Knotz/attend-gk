"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";

export async function createShift(input: {
  employeeId: string;
  siteId: string;
  date: string; // yyyy-mm-dd
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}) {
  const employee = await getEmployeeContext();
  if (!employee || !["org_admin", "super_admin", "manager"].includes(employee.role)) {
    return { error: "Only managers and org admins can schedule shifts." };
  }

  const startAt = new Date(`${input.date}T${input.startTime}:00`);
  const endAt = new Date(`${input.date}T${input.endTime}:00`);

  if (endAt <= startAt) {
    return { error: "End time must be after start time." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("shifts").insert({
    employee_id: input.employeeId,
    site_id: input.siteId,
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    status: "scheduled",
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/schedule");
  return { success: true as const };
}

export async function deleteShift(shiftId: string) {
  const employee = await getEmployeeContext();
  if (!employee || !["org_admin", "super_admin", "manager"].includes(employee.role)) {
    return { error: "Only managers and org admins can edit the schedule." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("shifts").delete().eq("id", shiftId);

  if (error) return { error: error.message };

  revalidatePath("/admin/schedule");
  return { success: true as const };
}
