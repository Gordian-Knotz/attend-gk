"use server";

import { createClient } from "@/lib/supabase/server";
import { applyLevelPreset } from "@/app/admin/settings/org-levels-actions";
import { presetByKey } from "@/lib/org-levels";

/** Matches `employees.full_name`, which is `text not null`. */
const MAX_NAME_LENGTH = 120;

/** Sane bounds for a geofence, matching migration 0027's own check. */
const MIN_RADIUS_M = 20;
const MAX_RADIUS_M = 10_000;

function isCoord(value: unknown, max: number): value is number {
  // NaN and Infinity both survive a `number` annotation, and NaN makes every
  // distance comparison false — which is how an out-of-range punch gets
  // accepted. Same guard as lib/record-attendance.ts.
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= max;
}

export async function provisionOrganization(
  orgName: string,
  adminName: string,
  /** Where staff will clock in. Required: it used to default to Nairobi, so
   *  the first clock-in failed for every tenant based anywhere else. */
  site: { name: string; lat: number; lng: number; radiusM: number },
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

  if (!isCoord(site?.lat, 90) || !isCoord(site?.lng, 180)) {
    return {
      error:
        "We need the site's location. Use the button to detect it, or type the coordinates in.",
    };
  }

  const radiusM = Math.round(site.radiusM);
  if (!Number.isFinite(radiusM) || radiusM < MIN_RADIUS_M || radiusM > MAX_RADIUS_M) {
    return {
      error: `The radius must be between ${MIN_RADIUS_M} and ${MAX_RADIUS_M} metres.`,
    };
  }

  const siteName = site.name?.trim() || "Head Office";
  if (siteName.length > MAX_NAME_LENGTH) {
    return { error: `Keep names under ${MAX_NAME_LENGTH} characters.` };
  }

  const { error } = await supabase.rpc("create_organization_for_self", {
    org_name: org,
    // Passed explicitly so the roster shows a real name. The RPC used to
    // fall back to auth.users.email, which published the founder's private
    // address to everyone they later invited — see 0002 and 0027.
    admin_name: admin,
    // Required as of 0027. These used to default to Nairobi at 150 m, so a
    // tenant anywhere else got a site their staff were never inside and the
    // first clock-in always failed with nothing on screen explaining why.
    site_lat: site.lat,
    site_lng: site.lng,
    site_name: siteName,
    site_radius_m: radiusM,
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
