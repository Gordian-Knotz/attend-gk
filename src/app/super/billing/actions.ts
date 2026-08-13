"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";
import { countBillableSeats, invoiceAmount } from "@/lib/billing";
import type { BillingPeriod } from "@/lib/billing";

async function requireSuperAdmin() {
  const identity = await getEmployeeContext();
  if (!identity || identity.role !== "super_admin") return null;
  return identity;
}

function done() {
  revalidatePath("/super/billing");
}

/**
 * Issues one org's invoice for one period, computed from that org's current
 * roster through the same `countBillableSeats`/`invoiceAmount` the page
 * itself displays — not a second implementation in SQL. Migration 0019's
 * `unique(org_id, period_start, period_end)` is the actual backstop against
 * double-issuing; the existence check below is for a readable error instead
 * of a raw constraint-violation message.
 */
export async function issueInvoice(orgId: string, period: BillingPeriod) {
  if (!(await requireSuperAdmin())) {
    return { error: "Only platform administrators can issue an invoice." };
  }

  const supabase = await createClient();

  const [orgRes, employeesRes, existingRes] = await Promise.all([
    supabase.from("organizations").select("seat_price_usd").eq("id", orgId).maybeSingle(),
    supabase
      .from("employees")
      .select("role, employment_start_date, employment_end_date")
      .eq("org_id", orgId),
    supabase
      .from("billing_invoices")
      .select("id")
      .eq("org_id", orgId)
      .eq("period_start", period.periodStart)
      .eq("period_end", period.periodEnd)
      .maybeSingle(),
  ]);

  if (orgRes.error) return { error: orgRes.error.message };
  if (employeesRes.error) return { error: employeesRes.error.message };
  if (existingRes.error) return { error: existingRes.error.message };
  if (existingRes.data) return { error: "That period already has an invoice." };
  if (!orgRes.data) return { error: "That organization no longer exists." };

  const seatPriceUsd = Number(orgRes.data.seat_price_usd);
  const seatCount = countBillableSeats(employeesRes.data ?? [], period);
  const amountUsd = invoiceAmount(seatCount, seatPriceUsd);

  const { error } = await supabase.from("billing_invoices").insert({
    org_id: orgId,
    period_start: period.periodStart,
    period_end: period.periodEnd,
    seat_count: seatCount,
    unit_price_usd: seatPriceUsd,
    amount_usd: amountUsd,
    status: "issued",
  });

  if (error) return { error: error.message };

  done();
  return { success: true as const, seatCount, amountUsd };
}

/**
 * Confirms or fails a pending payment. `confirmed_by`/`confirmed_at` (and,
 * when confirming, the linked invoice's `status`/`paid_at`) are set entirely
 * by migration 0019's trigger — nothing here sends them.
 */
export async function decidePayment(paymentId: string, outcome: "confirmed" | "failed") {
  if (!(await requireSuperAdmin())) {
    return { error: "Only platform administrators can decide a payment." };
  }
  if (outcome !== "confirmed" && outcome !== "failed") {
    return { error: "A decision must be either confirmed or failed." };
  }

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("billing_payments")
    .update({ status: outcome }, { count: "exact" })
    .eq("id", paymentId)
    .eq("status", "pending");

  if (error) return { error: error.message };
  if (count === 0) {
    return { error: "That payment could not be updated — it may already have been decided." };
  }

  done();
  return { success: true as const };
}
