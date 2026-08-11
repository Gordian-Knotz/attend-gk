/**
 * Rate limiting.
 *
 * ── Why in-memory ────────────────────────────────────────────────────────
 *
 * This deploys to Railway, which runs a long-lived Node process, so a Map
 * in module scope survives between requests and a counter in it actually
 * counts. On a serverless host it would not: each request can land on a
 * cold, separate instance, every bucket would start empty, and the limiter
 * would be decorative.
 *
 * ── The caveat that matters ──────────────────────────────────────────────
 *
 * Buckets are per *process*. Scale to N replicas and each one enforces the
 * limit independently, so the real ceiling is N × the configured limit.
 * That is fine for one container and wrong for four.
 *
 * When you scale out, implement `RateLimitStore` against Redis and pass it
 * to `createLimiter`. Nothing at the call sites changes — that is the whole
 * reason the store is an interface rather than a Map used directly.
 *
 * ── Algorithm ────────────────────────────────────────────────────────────
 *
 * Sliding window over timestamps rather than a fixed window. A fixed window
 * lets someone spend the full allowance at 0:59 and again at 1:01, which is
 * double the intended rate at exactly the moment an attacker cares about.
 */

export type RateLimitResult = {
  ok: boolean;
  /** Requests still available in the current window. */
  remaining: number;
  /** When the oldest hit expires and capacity frees up. */
  retryAfterMs: number;
};

export interface RateLimitStore {
  /** Record a hit for `key` and report whether it was within the limit. */
  hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}

/**
 * Process-local store. Timestamps per key, pruned on read.
 *
 * `MAX_KEYS` is a memory bound, not a tuning knob: keys are derived from
 * client IPs, so without it an attacker rotating source addresses turns the
 * limiter into an unbounded allocation. When full, the oldest-touched keys
 * are dropped — an eviction can only ever *forgive* a caller, never block
 * one that should be allowed.
 */
class MemoryStore implements RateLimitStore {
  private hits = new Map<string, number[]>();
  private readonly maxKeys: number;

  constructor(maxKeys = 20_000) {
    this.maxKeys = maxKeys;
  }

  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const cutoff = now - windowMs;

    const timestamps = (this.hits.get(key) ?? []).filter((t) => t > cutoff);

    if (timestamps.length >= limit) {
      // Delete first: `set` on an existing key keeps its original position,
      // so only a delete-then-set moves it to the end of the iterator. A
      // rejected request still touches the key — an attacker who only ever
      // gets rejected must not be exempt from eviction, or sustained
      // rejected traffic from rotating IPs would grow `hits` unbounded.
      this.hits.delete(key);
      this.hits.set(key, timestamps);
      this.evictIfNeeded();
      const oldest = timestamps[0];
      return {
        ok: false,
        remaining: 0,
        retryAfterMs: Math.max(0, oldest + windowMs - now),
      };
    }

    timestamps.push(now);
    this.hits.delete(key);
    this.hits.set(key, timestamps);
    this.evictIfNeeded();

    return {
      ok: true,
      remaining: limit - timestamps.length,
      retryAfterMs: 0,
    };
  }

  async reset(key: string): Promise<void> {
    this.hits.delete(key);
  }

  private evictIfNeeded() {
    if (this.hits.size <= this.maxKeys) return;
    // Map iterates in insertion order, and `set` above re-inserts on every
    // touch, so the front of the iterator is the least recently used.
    const excess = this.hits.size - this.maxKeys;
    let removed = 0;
    for (const key of this.hits.keys()) {
      this.hits.delete(key);
      if (++removed >= excess) break;
    }
  }
}

/** Module-scope singleton: one bucket set per process, not per request. */
const defaultStore: RateLimitStore = new MemoryStore();

export type LimiterConfig = {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
  /** Prefix so two limiters can't collide on the same identifier. */
  name: string;
};

export type Limiter = {
  check(identifier: string): Promise<RateLimitResult>;
  reset(identifier: string): Promise<void>;
};

export function createLimiter(
  config: LimiterConfig,
  store: RateLimitStore = defaultStore
): Limiter {
  return {
    check: (identifier) =>
      store.hit(`${config.name}:${identifier}`, config.limit, config.windowMs),
    reset: (identifier) => store.reset(`${config.name}:${identifier}`),
  };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * The limits themselves.
 *
 * Auth is deliberately tight and keyed two ways — see `limitAuthAttempt`.
 * Supabase applies its own limits upstream, but those protect Supabase, not
 * this application, and they can't see a per-IP pattern across accounts.
 */
export const authIpLimiter = createLimiter({
  name: "auth:ip",
  limit: 20,
  windowMs: 15 * MINUTE,
});

export const authIdentifierLimiter = createLimiter({
  name: "auth:id",
  limit: 6,
  windowMs: 15 * MINUTE,
});

/** Password reset sends an email, so the abuse is inbox flooding. */
export const passwordResetLimiter = createLimiter({
  name: "auth:reset",
  limit: 3,
  windowMs: HOUR,
});

/**
 * Attendance. A human clocks in and out a handful of times a day; this is
 * loose enough for an offline queue draining a backlog and tight enough to
 * stop a script writing thousands of events.
 */
export const attendanceLimiter = createLimiter({
  name: "attendance",
  limit: 60,
  windowMs: 10 * MINUTE,
});

/** Public and unauthenticated, so keyed on IP only. */
export const contactLimiter = createLimiter({
  name: "contact",
  limit: 3,
  windowMs: HOUR,
});

/**
 * Best-effort client IP.
 *
 * Behind Railway's proxy the socket address is the proxy's, so the client
 * address comes from `x-forwarded-for`. That header is a comma-separated
 * list that any client can send with arbitrary content, and Railway's proxy
 * *appends* the address it actually saw rather than replacing the header —
 * so the rightmost entry is the one hop we control, and the leftmost is
 * whatever the caller put there. Reading the leftmost entry let anyone
 * rotate it to defeat the limiter entirely.
 *
 * This assumes exactly one proxy hop between the client and this process —
 * true for Railway's current single-container setup. If a second proxy
 * (a CDN, a load balancer we don't control) is ever added in front of this,
 * the trustworthy entry moves one further left and this must change with it.
 */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    const trusted = hops[hops.length - 1];
    if (trusted) return trusted;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export function retryAfterMessage(retryAfterMs: number): string {
  const seconds = Math.ceil(retryAfterMs / 1000);
  if (seconds <= 90) return `Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`;
  const minutes = Math.ceil(seconds / 60);
  return `Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
