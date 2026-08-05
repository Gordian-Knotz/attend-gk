"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
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

  const admin = serviceClient();

  const { data: userList, error: listError } = await admin.auth.admin.listUsers();
  if (listError) return { error: listError.message };

  let authUser = userList.users.find((u) => u.email === input.email);

  if (!authUser) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
      data: { full_name: input.fullName },
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

  const { error: upsertError } = await admin.from("employees").upsert({
    id: authUser.id,
    org_id: employee.orgId,
    site_id: input.siteId,
    full_name: input.fullName,
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
