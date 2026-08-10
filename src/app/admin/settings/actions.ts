"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";

const MAX_ORG_NAME_LENGTH = 120;

/**
 * Renames the caller's organization. **Name only, deliberately.**
 *
 * `plan_tier`, `billing_status` and `suspended_at` are not writable here and
 * must not be added. Migration 0010 enforces that with a `BEFORE UPDATE`
 * trigger — RLS operates on rows, not columns, so 0001's `org: admins update
 * own` policy would otherwise have let an org_admin set their own plan to
 * enterprise, mark themselves paid, or clear a suspension somebody had just
 * applied to them. This action stays inside what that trigger permits; if you
 * widen the update payload, the database rejects the write and you will get an
 * opaque error rather than a partial success.
 *
 * Commercial fields are changed from `/super`, by us.
 */
export async function updateOrganizationName(input: { name: string }) {
  const employee = await getEmployeeContext();
  if (!employee || !["org_admin", "super_admin"].includes(employee.role)) {
    return { error: "Only org admins can change organization details." };
  }

  const name = input.name?.trim() ?? "";
  if (!name) return { error: "Enter a name for your organization." };
  if (name.length > MAX_ORG_NAME_LENGTH) {
    return {
      error: `Organization names must be under ${MAX_ORG_NAME_LENGTH} characters.`,
    };
  }

  const supabase = await createClient();

  const { error, count } = await supabase
    .from("organizations")
    .update({ name }, { count: "exact" })
    .eq("id", employee.orgId);

  if (error) return { error: error.message };
  if (!count) {
    return { error: "Couldn't update your organization. Reload and try again." };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  return { success: true as const };
}
