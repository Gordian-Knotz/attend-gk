"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";

const LEVELS = ["info", "warning", "critical"] as const;
export type NoticeLevel = (typeof LEVELS)[number];

// super_admin is deliberately not targetable — it is the vendor's own role,
// not a tenant audience.
const TARGET_ROLES = ["staff", "manager", "org_admin"] as const;

export async function postNotice(input: {
  message: string;
  level: string;
  siteId: string | null;
  targetRole: string | null;
}) {
  const employee = await getEmployeeContext();
  if (!employee || employee.role === "staff") {
    return { error: "Only managers and admins can post notices." };
  }

  const message = input.message.trim();
  if (!message) return { error: "Write a message first." };
  if (message.length > 500) {
    return { error: "Keep notices under 500 characters." };
  }

  const level = (LEVELS as readonly string[]).includes(input.level)
    ? (input.level as NoticeLevel)
    : "info";

  // Validated against an allow-list, not trusted. A server action is a public
  // HTTP endpoint; the TypeScript signature is documentation, not a control.
  const targetRole =
    input.targetRole && (TARGET_ROLES as readonly string[]).includes(input.targetRole)
      ? input.targetRole
      : null;

  // Managers can only post to their own site — RLS enforces this too, but
  // pinning it here gives a clear error instead of an opaque policy failure.
  const siteId =
    employee.role === "manager" ? employee.siteId : (input.siteId ?? null);

  if (employee.role === "manager" && !siteId) {
    return { error: "You aren't assigned to a site yet." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("notifications").insert({
    org_id: employee.orgId,
    site_id: siteId,
    message,
    level,
    author_id: employee.id,
    target_role: targetRole,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { success: true as const };
}

/**
 * Removes a notice for everyone. This is what the old single dismiss action
 * actually did, while being labelled "Dismiss" — so it is now named for its
 * effect and restricted to the people entitled to retract an announcement.
 */
export async function deleteNotice(noticeId: string) {
  const employee = await getEmployeeContext();
  if (!employee || employee.role === "staff") {
    return { error: "Only managers and admins can delete notices." };
  }

  const supabase = await createClient();
  // Reassigned, not mutated in place: postgrest-js's filter builder happens to
  // mutate `this` and return it today, so discarding `.eq()`'s return value
  // used to work, but that is an implementation detail, not a contract. If a
  // future version made builders immutable, the discarded call above would
  // silently stop narrowing by org_id — deleting a notice by id alone, across
  // organizations.
  let query = supabase.from("notifications").delete({ count: "exact" }).eq("id", noticeId);
  if (employee.role !== "super_admin") {
    query = query.eq("org_id", employee.orgId);
  }

  const { error, count } = await query;
  if (error) return { error: error.message };
  if (!count) return { error: "Notice not found, or you can't delete it." };

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return { success: true as const };
}

/**
 * Hides a notice for the caller alone. Available to everyone, staff included —
 * clearing your own board is not an administrative act.
 */
export async function dismissNoticeForSelf(noticeId: string) {
  const employee = await getEmployeeContext();
  if (!employee) return { error: "You need to be signed in." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_dismissals")
    .upsert(
      { notification_id: noticeId, employee_id: employee.id },
      { onConflict: "notification_id,employee_id" }
    );

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/admin");
  return { success: true as const };
}
