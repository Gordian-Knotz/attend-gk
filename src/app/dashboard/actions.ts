"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  recordAttendanceFor,
  type RecordAttendanceInput,
} from "@/lib/record-attendance";

export async function recordAttendance(input: RecordAttendanceInput) {
  const result = await recordAttendanceFor(input);
  if (result.error) return result;

  revalidatePath("/dashboard");
  return result;
}

/** Kept in sync with `leave_requests_type_check` in migration 0008. */
const LEAVE_TYPES = ["annual", "sick", "compassionate", "unpaid"] as const;

/** `YYYY-MM-DD`, as produced by an `<input type="date">`. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  // Rejects 2026-02-31 and friends, which Date happily rolls over.
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
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

  if (!LEAVE_TYPES.includes(input.leaveType as (typeof LEAVE_TYPES)[number])) {
    return { error: "Choose a valid leave type." };
  }

  // The previous `new Date(end) < new Date(start)` comparison silently
  // passed when either value was unparseable, because every comparison with
  // an Invalid Date is false.
  if (!isValidDate(input.startDate) || !isValidDate(input.endDate)) {
    return { error: "Enter valid start and end dates." };
  }

  if (input.endDate < input.startDate) {
    return { error: "End date can't be before the start date." };
  }

  const { error } = await supabase.from("leave_requests").insert({
    employee_id: employee.id,
    org_id: employee.org_id,
    leave_type: input.leaveType,
    start_date: input.startDate,
    end_date: input.endDate,
    // Enforced by RLS as of 0008 too: a client that posts 'approved'
    // straight to PostgREST is now rejected rather than self-approving.
    status: "pending",
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true as const };
}
