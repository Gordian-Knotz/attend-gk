"use server";

import { headers } from "next/headers";

import { SUPPORT_EMAIL } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import {
  clientIpFrom,
  contactLimiter,
  retryAfterMessage,
} from "@/lib/rate-limit";

/**
 * The landing page's pilot enquiry form.
 *
 * This is the only unauthenticated write path in the application, so it is
 * the only one where the rate limit is load-bearing rather than defence in
 * depth: without it, a public form backed by an anon-insert policy is a
 * free row generator.
 */

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

  const supabase = await createClient();

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
