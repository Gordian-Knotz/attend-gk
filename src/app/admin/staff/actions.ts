"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";

/**
 * Service-role client: bypasses RLS entirely. Everything it touches has to
 * be checked in this file, because the database will not check it for us.
 */
function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const INVITABLE_ROLES = ["staff", "manager"] as const;
type InvitableRole = (typeof INVITABLE_ROLES)[number];

const MAX_NAME_LENGTH = 120;

/** Deliberately permissive; Supabase Auth does the authoritative check. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AdminUser = { id: string; email?: string | null };

/**
 * `listUsers()` returns one page (50 by default), so a straight `.find()`
 * silently missed existing accounts once an org grew past that — and then
 * tried to re-invite an address that already had a login.
 */
async function findAuthUserByEmail(
  admin: ReturnType<typeof serviceClient>,
  email: string
): Promise<{ user: AdminUser | null; error: string | null }> {
  const target = email.toLowerCase();
  const perPage = 200;

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return { user: null, error: error.message };

    const users: AdminUser[] = data?.users ?? [];
    const match = users.find((u) => u.email?.toLowerCase() === target);
    if (match) return { user: match, error: null };

    if (users.length < perPage) return { user: null, error: null };
  }
}

export async function inviteStaff(input: {
  email: string;
  fullName: string;
  role: "staff" | "manager";
  siteId: string | null;
}) {
  const employee = await getEmployeeContext();
  if (!employee || !["org_admin", "super_admin"].includes(employee.role)) {
    return { error: "Only org admins can add staff." };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      error:
        "SUPABASE_SERVICE_ROLE_KEY isn't set in .env.local — needed to create staff logins.",
    };
  }

  // ── Input validation ──────────────────────────────────────────────────
  // These values reach a service-role write, so the TypeScript signature
  // is not a control: a server action is a public HTTP endpoint and the
  // caller chooses the payload.
  const email = input.email?.trim().toLowerCase() ?? "";
  const fullName = input.fullName?.trim() ?? "";

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (!fullName) {
    return { error: "Enter the person's full name." };
  }
  if (fullName.length > MAX_NAME_LENGTH) {
    return { error: `Names must be under ${MAX_NAME_LENGTH} characters.` };
  }
  if (!INVITABLE_ROLES.includes(input.role as InvitableRole)) {
    // Without this, the payload could ask for org_admin or super_admin.
    return { error: "Staff can only be invited as staff or manager." };
  }

  const admin = serviceClient();

  // The site must belong to the inviter's own org. `siteId` was previously
  // written straight through the service client, so an org admin could
  // attach a new hire to another tenant's site.
  if (input.siteId) {
    const { data: site, error: siteError } = await admin
      .from("sites")
      .select("id")
      .eq("id", input.siteId)
      .eq("org_id", employee.orgId)
      .maybeSingle();

    if (siteError) return { error: siteError.message };
    if (!site) return { error: "That site isn't part of your organization." };
  }

  const { user: existingAuthUser, error: lookupError } =
    await findAuthUserByEmail(admin, email);
  if (lookupError) return { error: lookupError };

  let authUser: AdminUser | null = existingAuthUser;

  if (!authUser) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
    });
    if (error) {
      return {
        error: `Couldn't send invite (${error.message}). Check that email sending is configured for your Supabase project, or ask them to sign up themselves via /login and re-add them here afterwards.`,
      };
    }
    authUser = data.user;
  }

  if (!authUser) {
    return { error: "Something went wrong creating that account." };
  }

  // An upsert on a primary key is an overwrite. Without this check, adding
  // an address that already belongs to another tenant would move that
  // person — and their attendance history — into this org.
  const { data: existing, error: existingError } = await admin
    .from("employees")
    .select("org_id, role")
    .eq("id", authUser.id)
    .maybeSingle();

  if (existingError) return { error: existingError.message };
  if (existing && existing.org_id !== employee.orgId) {
    return { error: "That account already belongs to another organization." };
  }

  // The upsert below runs through the SERVICE client, and guard_employee_role
  // (0011) returns early when auth.uid() is null — so the database's protection
  // against role tampering is NOT in play on this path.
  //
  // Without this check, an org_admin could invite an existing super_admin's
  // address as 'staff' and the upsert would demote them: exactly what 0011's
  // own comment says it prevents ("an org_admin could strip the only
  // super_admin in their org and take the seat on the next pass"). Confirmed
  // reachable in production — super_admin rows do live inside orgs that have
  // their own separate org_admin.
  //
  // An invite may create a staff/manager row, or re-invite one. It may never
  // rewrite an administrative one.
  if (existing && !INVITABLE_ROLES.includes(existing.role as InvitableRole)) {
    return {
      error:
        "That account already has an administrative role — change it from the staff list instead.",
    };
  }

  const { error: upsertError } = await admin.from("employees").upsert({
    id: authUser.id,
    org_id: employee.orgId,
    site_id: input.siteId,
    full_name: fullName,
    role: input.role,
  });

  if (upsertError) return { error: upsertError.message };

  revalidatePath("/admin/staff");
  revalidatePath("/admin");
  return { success: true as const };
}

export async function removeStaff(employeeId: string) {
  const employee = await getEmployeeContext();
  if (!employee || !["org_admin", "super_admin"].includes(employee.role)) {
    return { error: "Only org admins can remove staff." };
  }

  if (employeeId === employee.id) {
    return { error: "You can't remove your own account." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("employees").delete().eq("id", employeeId);

  if (error) return { error: error.message };

  revalidatePath("/admin/staff");
  revalidatePath("/admin");
  return { success: true as const };
}
