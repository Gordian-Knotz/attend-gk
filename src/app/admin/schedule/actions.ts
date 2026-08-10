"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";
import { zonedWallClockToUtc } from "@/lib/timezone";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

/**
 * Strict parse. `new Date("2026-02-31T09:00:00")` silently rolls over to
 * 2 March, and `new Date("garbage")` yields an Invalid Date whose every
 * comparison is false — so the old `endAt <= startAt` guard passed for any
 * unparseable input and inserted a shift with `null` timestamps.
 */
function parseDate(value: string) {
  const m = DATE_PATTERN.exec(value ?? "");
  if (!m) return null;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Reject calendar dates that don't exist rather than letting them roll.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function parseTime(value: string) {
  const m = TIME_PATTERN.exec(value ?? "");
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

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

  const date = parseDate(input.date);
  const start = parseTime(input.startTime);
  const end = parseTime(input.endTime);

  if (!date) return { error: "Enter a valid date." };
  if (!start || !end) return { error: "Enter valid start and end times." };

  // Built in the organization's timezone rather than the server's, so a
  // shift means the same thing regardless of where this renders.
  const startAt = zonedWallClockToUtc(
    date.year,
    date.month,
    date.day,
    start.hour,
    start.minute
  );
  const endAt = zonedWallClockToUtc(
    date.year,
    date.month,
    date.day,
    end.hour,
    end.minute
  );

  if (endAt.getTime() <= startAt.getTime()) {
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
  const { error, count } = await supabase
    .from("shifts")
    .delete({ count: "exact" })
    .eq("id", shiftId);

  if (error) return { error: error.message };
  // RLS silently deletes zero rows for a shift outside the caller's scope;
  // reporting success would tell them it worked.
  if (!count) return { error: "Shift not found, or you can't remove it." };

  revalidatePath("/admin/schedule");
  return { success: true as const };
}
