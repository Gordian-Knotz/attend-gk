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

// ── Presets ────────────────────────────────────────────────────────────────

export type PresetLevel = {
  name: string;
  /** 1 = most senior. */
  rank: number;
  suggestedTier: AssignableTier;
  visibilityScope: VisibilityScope;
};

export type Preset = {
  key: string;
  label: string;
  /** One line, in the buyer's terms, about which organizations this fits. */
  description: string;
  levels: readonly PresetLevel[];
};

/**
 * Starting ladders offered at onboarding.
 *
 * A preset rather than a blank builder because a new tenant has no reason to
 * design an org chart in the first two minutes of using the product, and
 * "customise later from Settings" is the honest default.
 *
 * The Head of Department row in `standard` is the case that motivated the
 * whole feature: `org_admin` tier so they can run HR functions, `team` scope so
 * they see their own people rather than the entire company. That combination is
 * impossible with the four-tier enum alone — at a single-site organization a
 * `manager`-tier HOD sees everyone.
 */
export const PRESETS: readonly Preset[] = [
  {
    key: "flat",
    label: "Flat",
    description: "An owner and their staff. Nothing in between.",
    levels: [
      { name: "Owner", rank: 1, suggestedTier: "org_admin", visibilityScope: "org" },
      { name: "Staff", rank: 2, suggestedTier: "staff", visibilityScope: "self" },
    ],
  },
  {
    key: "small",
    label: "Owner, supervisor, staff",
    description: "One owner, supervisors who run a shift, and staff.",
    levels: [
      { name: "Owner", rank: 1, suggestedTier: "org_admin", visibilityScope: "org" },
      { name: "Supervisor", rank: 2, suggestedTier: "manager", visibilityScope: "team" },
      { name: "Staff", rank: 3, suggestedTier: "staff", visibilityScope: "self" },
    ],
  },
  {
    key: "standard",
    label: "CEO, heads of department, supervisors",
    description:
      "Departments with their own head, each running supervisors and staff.",
    levels: [
      { name: "CEO", rank: 1, suggestedTier: "org_admin", visibilityScope: "org" },
      {
        name: "Head of Department",
        rank: 2,
        suggestedTier: "org_admin",
        visibilityScope: "team",
      },
      { name: "Supervisor", rank: 3, suggestedTier: "manager", visibilityScope: "team" },
      { name: "Staff", rank: 4, suggestedTier: "staff", visibilityScope: "self" },
    ],
  },
  {
    key: "multi_site",
    label: "Regions and sites",
    description: "Several sites, a manager at each, grouped under regions.",
    levels: [
      { name: "CEO", rank: 1, suggestedTier: "org_admin", visibilityScope: "org" },
      {
        name: "Regional Manager",
        rank: 2,
        suggestedTier: "org_admin",
        visibilityScope: "team",
      },
      { name: "Site Manager", rank: 3, suggestedTier: "manager", visibilityScope: "site" },
      { name: "Staff", rank: 4, suggestedTier: "staff", visibilityScope: "self" },
    ],
  },
] as const;

export function presetByKey(key: string): Preset | null {
  return PRESETS.find((p) => p.key === key) ?? null;
}

/** How a scope reads on screen. The stored value is never shown raw. */
export const SCOPE_LABELS: Record<VisibilityScope, string> = {
  self: "Only themselves",
  team: "Their own team",
  site: "Their whole site",
  org: "The whole organization",
};

/** How a tier reads on screen. */
export const TIER_LABELS: Record<AssignableTier, string> = {
  staff: "Staff",
  manager: "Manager",
  org_admin: "Administrator",
};
