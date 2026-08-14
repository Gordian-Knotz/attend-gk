/**
 * Vocabulary for the per-organization hierarchy.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * Every tenant is currently forced into the same four-tier shape, because
 * `employee_role` (0001) is both the access ceiling AND the only description
 * of structure the product has. Real organizations differ: CEO → Head of
 * Department → Supervisor → Staff, or CEO → COO → Supervisor → Staff, or
 * just Owner + Staff.
 *
 * The model separates three things that a single tree would conflate:
 *
 *   access tier    `employees.role`   — unchanged, still the hard ceiling
 *   rank           `org_levels.rank`  — an ordered ladder, no parent column
 *   reporting line `employees.reports_to_employee_id` — the tree, between PEOPLE
 *
 * ── One copy of each list ────────────────────────────────────────────────
 *
 * Doc 17 found four independent copies of LEAVE_TYPES in `src/` and parked it
 * as a complaint. This module is the single source for the hierarchy's value
 * lists so there is never a second one.
 *
 * Pure and importing nothing, so `node --test` can load it without a bundler
 * — the same constraint `notice-audience.ts` documents.
 */

/** Narrowest to widest. The order is meaningful — see `scopeReachesBeyondTier`. */
export const VISIBILITY_SCOPES = ["self", "team", "site", "org"] as const;
export type VisibilityScope = (typeof VISIBILITY_SCOPES)[number];

/**
 * Tiers a tenant may attach to one of its own levels.
 *
 * `super_admin` is absent deliberately: it is the vendor's role, it sits
 * outside org scoping entirely (that was the whole point of 0003), and a
 * CHECK constraint refuses it at the database as well. A tenant must not be
 * able to mint platform administrators by naming a level.
 */
export const ASSIGNABLE_TIERS = ["staff", "manager", "org_admin"] as const;
export type AssignableTier = (typeof ASSIGNABLE_TIERS)[number];

/** How far each tier can already see, before any narrowing. */
const TIER_REACH: Record<AssignableTier, VisibilityScope> = {
  staff: "self",
  manager: "site",
  org_admin: "org",
};

/**
 * True when `scope` asks for more than `tier` already grants.
 *
 * A level may only ever SUBTRACT from its tier. Narrowing is enforced with
 * restrictive RLS policies, which combine with AND and therefore cannot
 * widen — so a level configured beyond its tier would silently do nothing.
 *
 * This is a UI validation that stops an admin configuring a no-op, **not** a
 * security control. The security comes from `employees.role`, which nothing
 * here writes.
 */
export function scopeReachesBeyondTier(
  scope: VisibilityScope,
  tier: AssignableTier
): boolean {
  return (
    VISIBILITY_SCOPES.indexOf(scope) > VISIBILITY_SCOPES.indexOf(TIER_REACH[tier])
  );
}
