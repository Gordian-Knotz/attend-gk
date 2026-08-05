"use server";

import { createClient } from "@/lib/supabase/server";

export async function provisionOrganization(orgName: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not signed in." };
  }

  const { error } = await supabase.rpc("create_organization_for_self", {
    org_name: orgName,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true as const };
}
