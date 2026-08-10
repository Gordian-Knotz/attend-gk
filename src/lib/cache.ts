import { cache } from "react";
import { unstable_cache } from "next/cache";

/**
 * Caching policy for database reads.
 *
 * ── The rule that matters ────────────────────────────────────────────────
 *
 * Almost nothing in this app may go in a shared cache. Every query runs as
 * the signed-in user and RLS decides what comes back, so two callers issuing
 * an identical query legitimately receive different rows. A cache keyed on
 * the query — which is what `unstable_cache` keys on — would serve one
 * tenant's rows to another. That is not a performance regression, it is a
 * data breach with a fast response time.
 *
 * So there are exactly two tools here, and they are not interchangeable:
 *
 *  1. `perRequest` — React's `cache()`. Deduplicates within a single render
 *     pass and is discarded when the response is sent. Never crosses a
 *     request, therefore never crosses a user. Safe by construction.
 *
 *  2. `cachePlatformAggregate` — `unstable_cache`, for platform-wide numbers
 *     on `/super` that are identical for every viewer *because* the only
 *     viewers are super_admins seeing the whole platform. Nothing
 *     org-scoped may use this.
 *
 * If you find yourself wanting a third, the answer is almost certainly
 * `perRequest`.
 */

/**
 * Deduplicate a function for the lifetime of one request.
 *
 * `getEmployeeContext()` is the motivating case: the admin layout calls it,
 * then the page calls it, then the sidebar calls it — three identical
 * round trips per navigation, all inside one render.
 */
export const perRequest = cache;

/** Cache tags, so a write can invalidate the aggregate it affects. */
export const CACHE_TAGS = {
  platformOverview: "platform-overview",
} as const;

/**
 * Time-based cache for platform-wide aggregates.
 *
 * Only for data with no tenant dimension at all. The keyParts must fully
 * describe the result: anything the query varies on and the key doesn't is
 * a cross-contamination bug waiting to happen.
 */
export function cachePlatformAggregate<T>(
  fn: () => Promise<T>,
  keyParts: string[],
  { revalidateSeconds = 60, tags = [] as string[] } = {}
) {
  return unstable_cache(fn, ["platform", ...keyParts], {
    revalidate: revalidateSeconds,
    tags: [CACHE_TAGS.platformOverview, ...tags],
  });
}
