import type { CookieOptions } from "@supabase/ssr";

/**
 * Cookie policy for the Supabase auth cookies.
 *
 * `@supabase/ssr` supplies sensible defaults, but it does not know whether
 * you are behind TLS, and defaults are not a policy — they are whatever the
 * library shipped with. These are set explicitly so the intent is in the
 * repository and a library upgrade can't quietly relax them.
 *
 * ── httpOnly is deliberately NOT forced ──────────────────────────────────
 *
 * It would be the obvious hardening, and it breaks this app. The browser
 * Supabase client reads the session from `document.cookie` to keep client
 * components authenticated and to refresh tokens; making the cookie
 * httpOnly leaves it unable to see a session that exists. The mitigation
 * for XSS reading the token is therefore not the cookie flag — it is that
 * nothing renders untrusted HTML (no `dangerouslySetInnerHTML` anywhere in
 * `src/`, checked during the 10 Aug audit) and that tokens are short-lived.
 *
 * Whoever revisits this: making these httpOnly requires moving *all* auth
 * reads server-side first. Don't flip the flag on its own and assume it
 * worked — check that a client component still sees a session.
 */
export function authCookieOptions(options: CookieOptions): CookieOptions {
  return {
    ...options,

    // Sent to this site only. The auth cookie has no cross-site use, and
    // 'lax' still survives a top-level navigation back from the Supabase
    // password-recovery email, which 'strict' would break.
    sameSite: "lax",

    // Never over plain HTTP outside local development. Local dev is
    // http://localhost, where a Secure cookie is dropped and nobody can
    // sign in, so it is opt-out rather than production-only — an HTTPS
    // preview or staging deploy has `NODE_ENV !== "production"` too, and
    // keying off that alone would silently drop Secure there as well.
    secure: process.env.NODE_ENV !== "development",

    // Scoped to the whole app, not the path that happened to set it.
    path: "/",
  };
}
