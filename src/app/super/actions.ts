"use server";

import { revalidatePath } from "next/cache";
import { revalidateTag } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";
import { CACHE_TAGS } from "@/lib/cache";

/**
 * Commercial writes on a tenant, performed by the vendor.
 *
 * All of these go through the *user's* client, not the service role — the
 * `organizations` policy plus the column guard in migration 0010 are the
 * real enforcement, and using the anon client keeps them in play. The role
 * check here is for a readable error, not for security.
 */

const PLAN_TIERS = ["starter", "growth", "enterprise"] as const;
const BILLING_STATUSES = ["trialing", "active", "past_due", "canceled"] as const;

type PlanTier = (typeof PLAN_TIERS)[number];
type BillingStatus = (typeof BILLING_STATUSES)[number];

const MAX_REASON_LENGTH = 280;

async function requireSuperAdmin() {
  const identity = await getEmployeeContext();
  if (!identity || identity.role !== "super_admin") {
    return null;
  }
  return identity;
}

function done() {
  // The /super aggregates are cached by tag; a commercial change is exactly
  // the event that makes them stale.
  revalidateTag(CACHE_TAGS.platformOverview);
  revalidatePath("/super");
}

export async function updateOrgPlan(orgId: string, planTier: string) {
  if (!(await requireSuperAdmin())) {
    return { error: "Only platform administrators can change a plan." };
  }
  if (!PLAN_TIERS.includes(planTier as PlanTier)) {
    return { error: "Unrecognised plan tier." };
  }

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("organizations")
    .update({ plan_tier: planTier }, { count: "exact" })
    .eq("id", orgId);

  if (error) return { error: error.message };
  if (!count) return { error: "That organization no longer exists." };

  done();
  return { success: true as const };
}

export async function updateOrgBilling(orgId: string, billingStatus: string) {
  if (!(await requireSuperAdmin())) {
    return { error: "Only platform administrators can change billing." };
  }
  if (!BILLING_STATUSES.includes(billingStatus as BillingStatus)) {
    return { error: "Unrecognised billing status." };
  }

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("organizations")
    .update({ billing_status: billingStatus }, { count: "exact" })
    .eq("id", orgId);

  if (error) return { error: error.message };
  if (!count) return { error: "That organization no longer exists." };

  done();
  return { success: true as const };
}

/**
 * Suspension is reversible and keeps every row. There is deliberately no
 * "delete organization" action: deleting cascades to every employee,
 * attendance event and leave request that org has ever recorded, and
 * non-payment is a conversation rather than a reason to destroy an audit
 * trail. If a hard delete is ever genuinely needed, it should be a
 * deliberate, logged, service-role operation — not a button next to this one.
 */
export async function setOrgSuspension(
  orgId: string,
  suspended: boolean,
  reason?: string
) {
  const identity = await requireSuperAdmin();
  if (!identity) {
    return { error: "Only platform administrators can suspend an organization." };
  }

  if (suspended && orgId === identity.orgId) {
    return { error: "You can't suspend the organization you're signed in to." };
  }

  const trimmed = (reason ?? "").trim().slice(0, MAX_REASON_LENGTH);
  if (suspended && !trimmed) {
    return { error: "Give a reason — it's shown to the organization." };
  }

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("organizations")
    .update(
      suspended
        ? { suspended_at: new Date().toISOString(), suspended_reason: trimmed }
        : { suspended_at: null, suspended_reason: null },
      { count: "exact" }
    )
    .eq("id", orgId);

  if (error) return { error: error.message };
  if (!count) return { error: "That organization no longer exists." };

  done();
  return { success: true as const };
}
