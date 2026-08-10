"use server";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import {
  authIdentifierLimiter,
  authIpLimiter,
  clientIpFrom,
  passwordResetLimiter,
  retryAfterMessage,
} from "@/lib/rate-limit";

/**
 * Auth as server actions.
 *
 * These flows used to run entirely in the browser, calling Supabase's API
 * from the client. That works — it is the supported SSR pattern — but it
 * means sign-in traffic never touches this application, so nothing here can
 * see it, count it, or slow it down. Supabase's own limits protect Supabase;
 * they can't spot one IP working through a list of accounts.
 *
 * Routing through the server buys three things: our own rate limits, one
 * place where auth cookies are written, and error messages we control.
 */

type AuthResult =
  | { error: string; needsConfirmation?: undefined; role?: undefined }
  | { error?: undefined; needsConfirmation: true; role?: undefined }
  | { error?: undefined; needsConfirmation?: undefined; role: "onboarding" | "staff" | "admin" };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Supabase's own floor. Stated here so the message is specific. */
const MIN_PASSWORD_LENGTH = 6;

/**
 * Deliberately identical for "no such account" and "wrong password".
 * Distinguishing them turns the login form into an account-existence oracle,
 * which is how a scraped email list becomes a targeted one.
 */
const INVALID_CREDENTIALS = "That email and password don't match an account.";

async function limitAuth(identifier: string): Promise<string | null> {
  const ip = clientIpFrom(await headers());

  // Two keys, because they catch different attacks. Per-IP stops one host
  // spraying many accounts; per-identifier stops a distributed attempt at
  // one account. Checked IP-first so a slow attacker can't burn a victim's
  // bucket to lock them out — the per-identifier window is short.
  const byIp = await authIpLimiter.check(ip);
  if (!byIp.ok) {
    return `Too many attempts from this network. ${retryAfterMessage(byIp.retryAfterMs)}`;
  }

  const byId = await authIdentifierLimiter.check(identifier.toLowerCase());
  if (!byId.ok) {
    return `Too many attempts for this account. ${retryAfterMessage(byId.retryAfterMs)}`;
  }

  return null;
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const address = email?.trim().toLowerCase() ?? "";

  if (!EMAIL_PATTERN.test(address) || !password) {
    return { error: INVALID_CREDENTIALS };
  }

  const limited = await limitAuth(address);
  if (limited) return { error: limited };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: address,
    password,
  });

  if (error) {
    // Supabase distinguishes "Invalid login credentials" from other
    // failures; only the credential case is flattened.
    if (error.status === 400) return { error: INVALID_CREDENTIALS };
    return { error: error.message };
  }

  // A successful sign-in frees the account's bucket, so a person who
  // fat-fingered their password four times isn't still throttled after
  // getting it right.
  await authIdentifierLimiter.reset(address);

  return { role: await destinationFor() };
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const address = email?.trim().toLowerCase() ?? "";

  if (!EMAIL_PATTERN.test(address)) {
    return { error: "Enter a valid email address." };
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Passwords must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const limited = await limitAuth(address);
  if (limited) return { error: limited };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: address,
    password,
  });

  if (error) return { error: error.message };

  // Email confirmation on: no session yet.
  if (!data.session) return { needsConfirmation: true };

  return { role: "onboarding" };
}

export async function requestPasswordReset(
  email: string,
  origin: string
): Promise<{ error?: string; sent?: true }> {
  const address = email?.trim().toLowerCase() ?? "";

  if (!EMAIL_PATTERN.test(address)) {
    return { error: "Enter a valid email address." };
  }

  const ip = clientIpFrom(await headers());

  // Keyed on both, and tighter than sign-in: every accepted call sends an
  // email to an address the caller chose, so the abuse here is flooding
  // someone else's inbox rather than guessing a password.
  const byIp = await passwordResetLimiter.check(`ip:${ip}`);
  const byAddress = await passwordResetLimiter.check(`addr:${address}`);

  if (!byIp.ok || !byAddress.ok) {
    const retry = Math.max(byIp.retryAfterMs, byAddress.retryAfterMs);
    return { error: `Too many reset requests. ${retryAfterMessage(retry)}` };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(address, {
    redirectTo: `${origin}/reset-password`,
  });

  // Errors are swallowed on purpose. Reporting "no account with that email"
  // is the same account-existence oracle as above, just on a form that
  // doesn't even need a password to probe.
  if (error) {
    console.error("[auth] password reset failed", error.message);
  }

  return { sent: true };
}

/** Where to send someone once their session exists. */
async function destinationFor(): Promise<"onboarding" | "staff" | "admin"> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return "onboarding";

  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!employee) return "onboarding";
  return employee.role === "staff" ? "staff" : "admin";
}
