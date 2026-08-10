import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { authCookieOptions } from "./cookies";

const PROTECTED_PATHS = ["/admin", "/dashboard", "/onboarding", "/checkin", "/api"];

/**
 * Segment-aware prefix match. A plain `startsWith("/admin")` also matches
 * `/admin-preview`, so a route added later under a similar name would be
 * silently unprotected.
 */
function isProtectedPath(pathname: string) {
  return PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function updateSession(request: NextRequest) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    // Fails CLOSED in production. This used to pass every request through,
    // which meant a single missing or misspelled environment variable on a
    // deploy silently turned /admin into a public page — the auth layer
    // disabling itself exactly when it is most needed. Locally it still
    // passes through so the marketing page runs without Supabase.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Supabase environment variables are missing; refusing to serve requests unauthenticated."
      );
    }
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        flowType: "pkce",
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          // Middleware is where the refreshed session cookie is actually
          // written on most requests, so the policy has to be applied here
          // too — not just in the server client.
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, authCookieOptions(options))
          );
        },
      },
    }
  );

  // IMPORTANT: do not run any code between createServerClient and
  // getUser() — this refreshes the session token and must happen on
  // every request for SSR auth to keep working.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Section 06: "middleware.ts guarding every /admin/* and /api/* route
  // server-side rather than relying on UI-only checks."
  const isProtected = isProtectedPath(request.nextUrl.pathname);

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
