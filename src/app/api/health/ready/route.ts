/**
 * Readiness. "Could this process actually serve a request?"
 *
 * Answers the failure ../route.ts cannot see: the app is up, answering, and
 * unable to reach its database — so every page renders a fail-closed empty
 * state and liveness still says ok.
 *
 * ── Nothing restarts on this ─────────────────────────────────────────────
 *
 * This is for the uptime monitor and the dashboard, not for Railway's
 * healthcheck. Wiring an orchestrator's restart decision to a dependency
 * check is how a short Supabase degradation becomes a restart loop. See
 * ../route.ts.
 *
 * ── A raw fetch, not the Supabase client ─────────────────────────────────
 *
 * The server client in src/lib/supabase/server.ts reads cookies and carries
 * session machinery, none of which a health probe wants — and a probe that
 * can fail for session reasons is measuring the wrong thing.
 *
 * ── Why this URL, and what it costs ──────────────────────────────────────
 *
 * A single row selected from `organizations` with the anon key. RLS filters
 * it to `[]`, which is the point: a 200 with an empty body proves the whole
 * chain — network, PostgREST, Postgres, and the schema cache — while reading
 * nobody's data.
 *
 * The REST root (`/rest/v1/`) was tried first and returns **401 even with a
 * valid anon key**, so a probe against it reports degraded forever. A
 * permanently-failing health check is worse than none: it gets muted, and
 * then it misses the outage it existed for. Verified, not assumed.
 *
 * The schema cache is the reason this probes REST rather than
 * `/auth/v1/health`, which is simpler but only proves GoTrue is up. Every
 * migration in this repo ends with `notify pgrst, 'reload schema'` because
 * a stale cache 404s new columns while everything else looks healthy.
 *
 * COUPLING TO KNOW ABOUT: this depends on `organizations` existing and on
 * anon holding a table-level SELECT grant (Supabase's default; RLS is what
 * actually withholds the rows). If a hardening pass ever revokes that grant,
 * this probe starts reporting degraded and must be repointed — it is not
 * telling you the database is down.
 *
 * ── The response is bare, on purpose ─────────────────────────────────────
 *
 * "degraded" and nothing else. No status code from upstream, no error
 * message, no timing. This endpoint is unauthenticated, and the difference
 * between "database unreachable", "credentials rejected" and "schema cache
 * cold" is reconnaissance for anyone probing, while being no help at all to
 * an operator who can read the logs.
 */
export const dynamic = "force-dynamic";

/** Long enough for a slow round trip, short enough that a monitor doesn't hang. */
const PROBE_TIMEOUT_MS = 3000;

function respond(status: "ready" | "degraded", httpStatus: number) {
  return new Response(JSON.stringify({ status }), {
    status: httpStatus,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store, no-cache, must-revalidate",
    },
  });
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Missing configuration is not "ready". The middleware already refuses to
  // serve production without these (fails closed since the audit); saying
  // ok here would contradict that.
  if (!url || !key) return respond("degraded", 503);

  try {
    const res = await fetch(`${url}/rest/v1/organizations?select=id&limit=1`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: "no-store",
    });

    return res.ok ? respond("ready", 200) : respond("degraded", 503);
  } catch {
    // Timeout, DNS failure, TLS failure, connection refused — all the same
    // answer to the caller. The detail goes to the log, not the response.
    console.error("[health] readiness probe failed");
    return respond("degraded", 503);
  }
}
