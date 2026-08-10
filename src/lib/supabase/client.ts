import { createBrowserClient } from "@supabase/ssr";

import { authCookieOptions } from "./cookies";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Must match the server client, or the recovery-code exchange on
        // /reset-password fails: the verifier is written by one and read by
        // the other.
        flowType: "pkce",
        autoRefreshToken: true,
        persistSession: true,
        // On, unlike the server client — this is where the recovery code
        // from a password-reset email is actually picked up.
        detectSessionInUrl: true,
      },
      cookieOptions: authCookieOptions({}),
    }
  );
}
