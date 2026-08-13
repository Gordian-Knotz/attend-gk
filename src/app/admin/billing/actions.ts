"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";

const MAX_REFERENCE_LENGTH = 64;
const MAX_PHONE_LENGTH = 20;

/**
 * Records a payment attempt against one of the caller's own org's invoices.
 *
 * `status`, `recorded_by`, `confirmed_by` and `confirmed_at` are deliberately
 * NOT sent — migration 0019's trigger overwrites all four on insert
 * regardless of what the payload says, so an attempt cannot arrive already
 * "confirmed" no matter what a crafted client sends.
 */
export async function recordPayment(input: {
  invoiceId: string;
  payerPhone: string;
  reference: string;
}) {
  const employee = await getEmployeeContext();
  if (!employee || !["org_admin", "super_admin"].includes(employee.role)) {
    return { error: "Only org admins can record a payment." };
  }

  const payerPhone = input.payerPhone.trim();
  const reference = input.reference.trim();

  if (!payerPhone) return { error: "Enter the phone number the payment was made from." };
  if (payerPhone.length > MAX_PHONE_LENGTH) {
    return { error: `Phone numbers must be under ${MAX_PHONE_LENGTH} characters.` };
  }
  if (!reference) return { error: "Enter the M-Pesa transaction code." };
  if (reference.length > MAX_REFERENCE_LENGTH) {
    return { error: `Transaction codes must be under ${MAX_REFERENCE_LENGTH} characters.` };
  }

  const supabase = await createClient();

  const { data: invoice, error: invoiceError } = await supabase
    .from("billing_invoices")
    .select("id, org_id, amount_usd, status")
    .eq("id", input.invoiceId)
    .maybeSingle();

  if (invoiceError) return { error: invoiceError.message };
  if (!invoice || invoice.org_id !== employee.orgId) {
    return { error: "That invoice couldn't be found." };
  }
  // Allow-listed rather than a single "not paid" check: a draft or void
  // invoice isn't owed either, and an explicit list says so instead of
  // accepting anything that merely isn't "paid".
  if (invoice.status !== "issued") {
    return { error: "Payments can only be recorded for an issued invoice." };
  }

  const { data: existingPending, error: pendingError } = await supabase
    .from("billing_payments")
    .select("id")
    .eq("invoice_id", invoice.id)
    .eq("status", "pending")
    .maybeSingle();

  if (pendingError) return { error: pendingError.message };
  if (existingPending) {
    return {
      error: "A payment for this invoice is already recorded and awaiting confirmation.",
    };
  }

  const { error } = await supabase.from("billing_payments").insert({
    invoice_id: invoice.id,
    org_id: invoice.org_id,
    method: "mpesa",
    amount_usd: invoice.amount_usd,
    payer_phone: payerPhone,
    reference,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/billing");
  return { success: true as const };
}
