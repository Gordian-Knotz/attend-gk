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

const LEAVE_TYPES = ["annual", "sick", "compassionate", "unpaid"] as const;

/** Max any sane policy would set; also stops a fat-fingered 2100 from sticking. */
const MAX_POLICY_DAYS = 365;

/**
 * Sets an org's leave policy for one leave type — how many days it grants a
 * year, and how many of those may carry into the next.
 *
 * `leave_type` is allow-listed rather than free text: it is a check
 * constraint in 0014 too, but a query built from an unvalidated string would
 * still be the wrong thing to write even if the database were the backstop.
 *
 * `upsert` needs the table's UPDATE policy to exist — it does, via
 * `"leave policy: admins manage"`, which is `for all`. That is the trap 0013
 * hit with dismissals (an insert-only policy on a table an upsert also
 * updates); it does not apply here.
 */
export async function upsertLeavePolicy(input: {
  leaveType: string;
  annualDays: number;
  carryOverMax: number;
  accrualMode?: "annual" | "monthly";
}) {
  const employee = await getEmployeeContext();
  if (!employee || !["org_admin", "super_admin"].includes(employee.role)) {
    return { error: "Only org admins can change leave policy." };
  }

  if (!(LEAVE_TYPES as readonly string[]).includes(input.leaveType)) {
    return { error: "Unknown leave type." };
  }

  const finite = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);

  if (!finite(input.annualDays) || input.annualDays < 0 || input.annualDays > MAX_POLICY_DAYS) {
    return { error: `Annual days must be between 0 and ${MAX_POLICY_DAYS}.` };
  }
  if (!finite(input.carryOverMax) || input.carryOverMax < 0 || input.carryOverMax > MAX_POLICY_DAYS) {
    return { error: `Carry-over must be between 0 and ${MAX_POLICY_DAYS}.` };
  }

  // Allow-listed rather than passed through, for the same reason leaveType is:
  // an unexpected value would otherwise reach the check constraint and surface
  // as a Postgres error instead of a sentence.
  if (
    input.accrualMode !== undefined &&
    input.accrualMode !== "annual" &&
    input.accrualMode !== "monthly"
  ) {
    return { error: "Accrual must be either all at once or monthly." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("leave_policies").upsert(
    {
      org_id: employee.orgId,
      leave_type: input.leaveType,
      annual_days: input.annualDays,
      carry_over_max: input.carryOverMax,
      accrual_mode: input.accrualMode ?? "annual",
    },
    { onConflict: "org_id,leave_type" }
  );

  if (error) return { error: error.message };

  revalidatePath("/admin/settings");
  revalidatePath("/dashboard/leave");
  return { success: true as const };
}

/**
 * Materialises this year's entitlements from the policy.
 *
 * The function is `on conflict do nothing`, so pressing this twice does not
 * overwrite an entitlement somebody adjusted by hand. It returns the number of
 * rows actually created, which is what the button reports back.
 */
export async function grantEntitlements(year: number) {
  const employee = await getEmployeeContext();
  if (!employee || !["org_admin", "super_admin"].includes(employee.role)) {
    return { error: "Only org admins can grant entitlements." };
  }

  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return { error: "Pick a year between 2020 and 2100." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ensure_leave_entitlements", {
    p_year: year,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/settings");
  revalidatePath("/dashboard/leave");
  return { success: true as const, created: (data as number) ?? 0 };
}
