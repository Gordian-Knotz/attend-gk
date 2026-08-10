"use server";

import { createClient } from "@/lib/supabase/server";

/** Matches `employees.full_name`, which is `text not null`. */
const MAX_NAME_LENGTH = 120;

export async function provisionOrganization(orgName: string, adminName: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not signed in." };
  }

  const org = orgName.trim();
  const admin = adminName.trim();

  if (!org) {
    return { error: "Enter a name for your organization." };
  }
  if (!admin) {
    return { error: "Enter your name." };
  }
  if (org.length > MAX_NAME_LENGTH || admin.length > MAX_NAME_LENGTH) {
    return { error: `Keep names under ${MAX_NAME_LENGTH} characters.` };
  }

  const { error } = await supabase.rpc("create_organization_for_self", {
    org_name: org,
    // Passed explicitly so the roster shows a real name. The RPC used to
    // fall back to auth.users.email, which published the founder's private
    // address to everyone they later invited — see 0002.
    admin_name: admin,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true as const };
}
