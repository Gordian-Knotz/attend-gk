/**
 * Liveness. "Is this process answering?" — nothing more.
 *
 * ── Deliberately checks nothing ──────────────────────────────────────────
 *
 * This is what Railway's healthcheck probes, and Railway restarts a container
 * that fails it. So it must depend on nothing external: if this checked
 * Supabase, a thirty-second Supabase blip would fail the probe, restart the
 * container, fail again on the way up, and turn a brief degradation into a
 * restart loop. That is the classic way a healthcheck makes an incident
 * worse. Dependency checking lives in ./ready, which nothing restarts.
 *
 * ── Deliberately says nothing ────────────────────────────────────────────
 *
 * No version, commit SHA, build time, environment name, uptime or dependency
 * list. This endpoint is unauthenticated and will be scraped; every one of
 * those is reconnaissance that helps somebody target a known CVE and helps
 * nobody diagnose an outage who could not already read the deploy logs.
 *
 * ── Must never be cached ─────────────────────────────────────────────────
 *
 * A cached 200 served while the process is dead is worse than having no
 * endpoint at all, because it converts an outage into a silent one. Hence
 * `force-dynamic` and `no-store` together: the first stops Next rendering
 * this at build time, the second stops anything downstream holding onto it.
 *
 * Reachable unauthenticated only because PUBLIC_API_PATHS in
 * src/lib/supabase/middleware.ts exempts it. Without that, /api is a
 * protected prefix and this would 307 to /login for every monitor.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store, no-cache, must-revalidate",
    },
  });
}
