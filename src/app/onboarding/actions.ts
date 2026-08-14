"use server";

import { createClient } from "@/lib/supabase/server";
import { applyLevelPreset } from "@/app/admin/settings/org-levels-actions";
import { presetByKey } from "@/lib/org-levels";

/** Matches `employees.full_name`, which is `text not null`. */
const MAX_NAME_LENGTH = 120;

export async function provisionOrganization(
  orgName: string,
  adminName: string,
  /** Optional starting ladder. Omitted or unknown means no levels are seeded,
   *  which is the pre-hierarchy behaviour and stays fully supported. */
  presetKey?: string
) {
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

  // The ladder is seeded AFTER the RPC, in a separate call, deliberately.
  //
  // create_organization_for_self (0002) is SECURITY DEFINER and carries a
  // trap: it was edited to add a sixth defaulted parameter, and in Postgres
  // adding a parameter OVERLOADS rather than replaces — the GRANT at the
  // bottom of that file still names the five-argument signature. Touching it
  // to seed levels is more dangerous than it looks.
  //
  // A failure here is reported but not fatal: the organization exists and is
  // usable, and Settings offers the same presets. Rolling the org back because
  // a cosmetic ladder failed would be much worse than starting without one.
  if (presetKey && presetByKey(presetKey)) {
    const seeded = await applyLevelPreset(presetKey);
    if (seeded.error) {
      return {
        success: true as const,
        warning: `Your organization is ready, but the structure wasn't applied (${seeded.error}). You can set it from Settings.`,
      };
    }
  }

  return { success: true as const };
}
