"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";

/**
 * Approve or reject a leave request.
 *
 * Until this existed there was no way to decide a leave request at all — the
 * table has permitted it since 0001, but no code ever wrote `status`, so every
 * request sat pending forever and no balance could ever decrease.
 *
 * The authorization here is a courtesy, not the gate. Migration 0016's trigger
 * is what actually enforces "a manager decides only for their own site" and
 * "nobody decides their own request", because RLS grants rows and not columns
 * and a server action is only as trustworthy as its caller. This check exists
 * so the common case fails with a sentence a human can act on rather than a
 * Postgres error code.
 */
export async function decideLeaveRequest(input: {
  requestId: string;
  decision: "approved" | "rejected";
  note?: string;
}) {
  const employee = await getEmployeeContext();

  if (!employee || !["manager", "org_admin", "super_admin"].includes(employee.role)) {
    return { error: "Only managers and admins can decide leave requests." };
  }

  if (input.decision !== "approved" && input.decision !== "rejected") {
    return { error: "A decision must be either approved or rejected." };
  }

  const note = input.note?.trim() ?? "";
  if (note.length > 500) {
    return { error: "Keep the note under 500 characters." };
  }

  const supabase = await createClient();

  // `decided_by` and `decided_at` are deliberately NOT sent. The trigger sets
  // them from the authenticated caller, so a decision cannot be attributed to
  // somebody else — and sending them here would be rejected outright.
  const { error, count } = await supabase
    .from("leave_requests")
    .update(
      {
        status: input.decision,
        decision_note: note.length > 0 ? note : null,
      },
      { count: "exact" }
    )
    .eq("id", input.requestId)
    .eq("status", "pending");

  if (error) {
    // 42501 is what 0016's trigger raises for a self-decision or an
    // out-of-site manager. Surfacing the database's own sentence is better than
    // inventing one, because the trigger's messages were written to be read.
    return { error: error.message };
  }

  // Zero rows and no error means RLS filtered it, or somebody decided it first.
  // Reporting success here would tell a manager they had approved something
  // they had not.
  if (count === 0) {
    return {
      error:
        "That request could not be updated — it may already have been decided, or it belongs to another site.",
    };
  }

  revalidatePath("/admin/leave");
  revalidatePath("/admin");
  revalidatePath("/dashboard/leave");
  return { success: true as const };
}
