"use server";

import { headers } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import { SUPPORT_EMAIL } from "@/lib/brand";
import {
  clientIpFrom,
  contactLimiter,
  retryAfterMessage,
} from "@/lib/rate-limit";

/**
 * The landing page's pilot enquiry form.
 *
 * ── Why this writes with the service role ────────────────────────────────
 *
 * This used to insert with the anon client, backed by an anon INSERT policy on
 * contact_requests (0009). That made the rate limit below decorative: the anon
 * key is inlined in the client bundle, so anyone could POST straight to
 * /rest/v1/contact_requests and never touch this code. Verified against
 * production on 14 Aug — a hand-rolled anon insert returned 201.
 *
 * Writing with the service role means the limiter is the only way in, because
 * migration 0029 removes the anon policy and there is then no other path.
 *
 * DEPLOY ORDER MATTERS. This code must be live BEFORE 0029 is applied, or the
 * public form breaks: the running build would still be using the anon client
 * against a policy that no longer exists. 0029 is deliberately left unapplied
 * for that reason.
 */
function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LIMITS = {
  fullName: 120,
  workEmail: 254,
  company: 160,
  phone: 40,
  teamSize: 40,
  message: 2000,
} as const;

export type ContactInput = {
  fullName: string;
  workEmail: string;
  company: string;
  phone?: string;
  teamSize?: string;
  message?: string;
};

export async function submitContactRequest(
  input: ContactInput
): Promise<{ error?: string; success?: true }> {
  const ip = clientIpFrom(await headers());

  const quota = await contactLimiter.check(ip);
  if (!quota.ok) {
    return {
      error: `You've sent a few requests already. ${retryAfterMessage(quota.retryAfterMs)}`,
    };
  }

  const clean = (value: string | undefined, max: number) =>
    (value ?? "").trim().slice(0, max);

  const fullName = clean(input.fullName, LIMITS.fullName);
  const workEmail = clean(input.workEmail, LIMITS.workEmail).toLowerCase();
  const company = clean(input.company, LIMITS.company);
  const phone = clean(input.phone, LIMITS.phone);
  const teamSize = clean(input.teamSize, LIMITS.teamSize);
  const message = clean(input.message, LIMITS.message);

  if (!fullName) return { error: "Enter your name." };
  if (!EMAIL_PATTERN.test(workEmail)) {
    return { error: "Enter a valid work email address." };
  }
  if (!company) return { error: "Enter your company name." };

  // Fails closed with the same generic message the insert failure uses: a
  // missing key is an operator problem, and the public form must not explain
  // the deployment's configuration to whoever is reading it.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[contact] SUPABASE_SERVICE_ROLE_KEY is not set");
    return {
      error: `We couldn't record that just now. Email ${SUPPORT_EMAIL} directly and we'll pick it up.`,
    };
  }

  const supabase = serviceClient();

  const { error } = await supabase.from("contact_requests").insert({
    full_name: fullName,
    work_email: workEmail,
    company,
    phone: phone || null,
    team_size: teamSize || null,
    message: message || null,
    source_ip: ip === "unknown" ? null : ip,
    status: "new",
  });

  if (error) {
    // Don't surface the database error: this form is public, and PostgREST
    // messages name tables, columns and constraints.
    console.error("[contact] insert failed", error.message);
    return {
      error:
        `We couldn't record that just now. Email ${SUPPORT_EMAIL} directly and we'll pick it up.`,
    };
  }

  return { success: true as const };
}
