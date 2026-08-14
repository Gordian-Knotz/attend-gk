"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";
import {
  ASSIGNABLE_TIERS,
  VISIBILITY_SCOPES,
  presetByKey,
  scopeReachesBeyondTier,
  type AssignableTier,
  type VisibilityScope,
} from "@/lib/org-levels";

/**
 * The org's rank ladder — read by Settings and seeded at onboarding.
 *
 * Nothing here writes `employees.role`. A level carries a *suggested* tier that
 * the UI pre-fills; the database never lets the level grant a tier, because
 * BEFORE-row trigger ordering would let a sync overwrite what
 * `guard_employee_role` (0011) had just validated. See migration 0023.
 *
 * So these actions cannot escalate anyone: they write `org_levels`, which no
 * RLS policy reads. The role checks below exist to produce a sentence a human
 * can act on rather than an opaque policy failure — the real gate is the
 * `"levels: admins manage"` policy from 0023.
 */

const MAX_NAME_LENGTH = 60;
const MAX_RANK = 50;

function validateLevelInput(input: {
  name: string;
  rank: number;
  suggestedTier: string;
  visibilityScope: string;
}) {
  const name = input.name?.trim() ?? "";

  if (!name) return { error: "Give the level a name." };
  if (name.length > MAX_NAME_LENGTH) {
    return { error: `Level names must be under ${MAX_NAME_LENGTH} characters.` };
  }
  if (
    typeof input.rank !== "number" ||
    !Number.isInteger(input.rank) ||
    input.rank < 1 ||
    input.rank > MAX_RANK
  ) {
    return { error: `Rank must be a whole number between 1 and ${MAX_RANK}.` };
  }
  // Allow-listed, not passed through. A server action is a public HTTP
  // endpoint, so the TypeScript signature is documentation, not a control.
  if (!(ASSIGNABLE_TIERS as readonly string[]).includes(input.suggestedTier)) {
    return { error: "Choose a valid access level." };
  }
  if (!(VISIBILITY_SCOPES as readonly string[]).includes(input.visibilityScope)) {
    return { error: "Choose a valid visibility scope." };
  }

  const tier = input.suggestedTier as AssignableTier;
  const scope = input.visibilityScope as VisibilityScope;

  // Refused rather than silently accepted: narrowing is restrictive-only, so a
  // scope wider than the tier would do nothing at all and read as a bug.
  if (scopeReachesBeyondTier(scope, tier)) {
    return {
      error:
        "That visibility is wider than the access level allows, so it would have no effect. Raise the access level or narrow the visibility.",
    };
  }

  return { name, rank: input.rank, tier, scope };
}

async function requireOrgAdmin() {
  const employee = await getEmployeeContext();
  if (!employee || !["org_admin", "super_admin"].includes(employee.role)) {
    return null;
  }
  return employee;
}

function done() {
  revalidatePath("/admin/settings");
  revalidatePath("/admin");
}

/**
 * Seeds a starting ladder. Called from Settings and, at signup, from
 * `provisionOrganization`.
 *
 * Refuses when levels already exist rather than replacing them: `employees`
 * rows point at levels with `on delete restrict`, so a "replace" would either
 * fail halfway or need to reassign people first. Deleting deliberately, one at
 * a time, is the honest path.
 */
export async function applyLevelPreset(presetKey: string) {
  const employee = await requireOrgAdmin();
  if (!employee) {
    return { error: "Only org admins can set up the organization structure." };
  }

  const preset = presetByKey(presetKey);
  if (!preset) return { error: "Choose one of the listed structures." };

  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from("org_levels")
    .select("id", { count: "exact", head: true })
    .eq("org_id", employee.orgId);

  if (countError) return { error: countError.message };
  if ((count ?? 0) > 0) {
    return {
      error:
        "This organization already has levels. Edit or remove them individually instead.",
    };
  }

  const { error } = await supabase.from("org_levels").insert(
    preset.levels.map((level) => ({
      org_id: employee.orgId,
      name: level.name,
      rank: level.rank,
      suggested_tier: level.suggestedTier,
      visibility_scope: level.visibilityScope,
    }))
  );

  if (error) return { error: error.message };

  done();
  return { success: true as const, created: preset.levels.length };
}

export async function addLevel(input: {
  name: string;
  rank: number;
  suggestedTier: string;
  visibilityScope: string;
}) {
  const employee = await requireOrgAdmin();
  if (!employee) {
    return { error: "Only org admins can change the organization structure." };
  }

  const validated = validateLevelInput(input);
  if ("error" in validated) return validated;

  const supabase = await createClient();
  const { error } = await supabase.from("org_levels").insert({
    // Forced from the session, never taken from the payload.
    org_id: employee.orgId,
    name: validated.name,
    rank: validated.rank,
    suggested_tier: validated.tier,
    visibility_scope: validated.scope,
  });

  if (error) {
    // 23505 is the unique (org_id, name) constraint from 0023.
    if (error.code === "23505") {
      return { error: "There's already a level with that name." };
    }
    return { error: error.message };
  }

  done();
  return { success: true as const };
}

export async function updateLevel(
  levelId: string,
  input: {
    name: string;
    rank: number;
    suggestedTier: string;
    visibilityScope: string;
  }
) {
  const employee = await requireOrgAdmin();
  if (!employee) {
    return { error: "Only org admins can change the organization structure." };
  }

  const validated = validateLevelInput(input);
  if ("error" in validated) return validated;

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("org_levels")
    .update(
      {
        name: validated.name,
        rank: validated.rank,
        suggested_tier: validated.tier,
        visibility_scope: validated.scope,
      },
      { count: "exact" }
    )
    .eq("id", levelId)
    .eq("org_id", employee.orgId);

  if (error) {
    if (error.code === "23505") {
      return { error: "There's already a level with that name." };
    }
    return { error: error.message };
  }
  // Zero rows and no error means RLS filtered it. Reporting success would tell
  // an admin they had renamed something they had not.
  if (!count) return { error: "That level no longer exists." };

  done();
  return { success: true as const };
}

export async function deleteLevel(levelId: string) {
  const employee = await requireOrgAdmin();
  if (!employee) {
    return { error: "Only org admins can change the organization structure." };
  }

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("org_levels")
    .delete({ count: "exact" })
    .eq("id", levelId)
    .eq("org_id", employee.orgId);

  if (error) {
    // 23503 is employees_org_level_fk, which is `on delete restrict` on
    // purpose: deleting a narrow level would silently widen access for
    // everyone who was on it. Say who is in the way instead of the raw error.
    if (error.code === "23503") {
      return {
        error:
          "Some people are still on this level. Move them to another level first, then remove it.",
      };
    }
    return { error: error.message };
  }
  if (!count) return { error: "That level no longer exists." };

  done();
  return { success: true as const };
}
