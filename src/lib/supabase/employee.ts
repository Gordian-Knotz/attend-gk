import { createClient } from "@/lib/supabase/server";
import { perRequest } from "@/lib/cache";

export type EmployeeContext = {
  id: string;
  fullName: string;
  role: "staff" | "manager" | "org_admin" | "super_admin";
  orgId: string;
  orgName: string;
  siteId: string | null;
  siteName: string | null;
  /** Set by a super_admin from /super. Non-null means locked out. */
  orgSuspendedAt: string | null;
  orgSuspendedReason: string | null;
};

/** Returns null if the signed-in user has no employees row yet (fresh
 *  signup that hasn't completed onboarding) or isn't signed in at all.
 *
 *  Throws — rather than returning null — when the lookup itself fails.
 *  Callers treat null as "needs onboarding" and redirect there, so
 *  swallowing a transient database error used to walk an established admin
 *  into the create-an-organization flow.
 *
 *  Wrapped in `perRequest` (React `cache`): the admin layout, the page and
 *  the sidebar each call this, so one navigation used to make three
 *  identical `auth.getUser()` + employees round trips. The cache is
 *  per-render and discarded with the response, so it can never serve one
 *  user's context to another — which a shared cache absolutely would. */
export const getEmployeeContext = perRequest(async function getEmployeeContext(): Promise<EmployeeContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("employees")
    .select(
      "id, full_name, role, org_id, site_id, organizations(name, suspended_at, suspended_reason), sites(name)"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load employee context: ${error.message}`);
  }

  if (!data) return null;

  const org = Array.isArray(data.organizations)
    ? data.organizations[0]
    : data.organizations;
  const site = Array.isArray(data.sites) ? data.sites[0] : data.sites;

  return {
    id: data.id,
    fullName: data.full_name,
    role: data.role,
    orgId: data.org_id,
    orgName: org?.name ?? "Your organization",
    siteId: data.site_id,
    siteName: site?.name ?? null,
    orgSuspendedAt: org?.suspended_at ?? null,
    orgSuspendedReason: org?.suspended_reason ?? null,
  };
});
