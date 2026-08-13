/**
 * What is being built next, shown in-product on the admin and staff
 * dashboards.
 *
 * ── One list, not two ────────────────────────────────────────────────────
 *
 * Both dashboards read this module. Doc 17 recorded four independent copies
 * of LEAVE_TYPES in `src/` and parked it as a complaint; a roadmap shown on
 * two surfaces is exactly the shape that becomes a fifth. `audience` decides
 * who sees an item, so the two surfaces differ by a filter rather than by a
 * duplicate array.
 *
 * ── Say only what is being built ─────────────────────────────────────────
 *
 * Every item here is specced. Nothing goes on this list because it sounds
 * good — the landing page spent months advertising six features that were
 * never built, and this list is read by paying customers who will plan
 * around it. If an item is dropped, remove it; do not let it sit here
 * forever quietly meaning nothing.
 *
 * Pure and importing nothing, so `node --test` can load it — the same
 * constraint `notice-audience.ts` documents.
 */

export type RoadmapAudience = "admin" | "staff" | "both";

export type RoadmapItem = {
  title: string;
  /** One sentence, in the reader's terms, about what they will be able to do. */
  detail: string;
  audience: RoadmapAudience;
};

export const ROADMAP: readonly RoadmapItem[] = [
  {
    title: "Overtime rules",
    detail:
      "Set a weekly hours threshold and have anything above it flagged automatically on reports.",
    audience: "admin",
  },
  {
    title: "Shift swaps",
    detail:
      "Staff offer a shift to a colleague, and a supervisor approves the swap before the roster changes.",
    audience: "both",
  },
  {
    title: "Photo at clock-in",
    detail:
      "An optional photo taken at check-in, so presence can be confirmed when a shift is queried.",
    audience: "both",
  },
  {
    title: "Biometric terminals",
    detail:
      "Fingerprint and face terminals on site sending their scans straight into Activ-HR.",
    audience: "admin",
  },
  {
    title: "Android and iOS apps",
    detail:
      "The clock-in screen as an installable app. It already works in any phone browser today.",
    audience: "both",
  },
] as const;

/** Items relevant to one surface. `both` always shows. */
export function roadmapFor(audience: "admin" | "staff"): RoadmapItem[] {
  return ROADMAP.filter(
    (item) => item.audience === audience || item.audience === "both"
  );
}
