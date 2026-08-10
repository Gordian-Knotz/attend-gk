import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { authCookieOptions } from "./cookies";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // PKCE rather than the implicit flow: the authorization code is
        // exchanged against a verifier this client holds, so a code
        // intercepted from a redirect URL (browser history, referrer
        // header, a proxy log) can't be redeemed on its own. It is also
        // what the /reset-password recovery exchange relies on.
        flowType: "pkce",
        autoRefreshToken: true,
        persistSession: true,
        // The server never parses tokens out of a URL fragment; middleware
        // owns session refresh. Leaving this on makes the server client
        // race the middleware for the same cookie.
        detectSessionInUrl: false,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, authCookieOptions(options))
            );
          } catch {
            // `setAll` was called from a Server Component — safe to ignore
            // as long as middleware.ts is refreshing the session (it is).
          }
        },
      },
    }
  );
}
