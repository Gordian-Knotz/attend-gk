"use server";

import { revalidatePath } from "next/cache";

import {
  recordAttendanceFor,
  type RecordAttendanceInput,
} from "@/lib/record-attendance";

export async function recordAttendance(input: RecordAttendanceInput) {
  const result = await recordAttendanceFor(input);
  if (result.error) return result;

  revalidatePath("/checkin");
  return result;
}
