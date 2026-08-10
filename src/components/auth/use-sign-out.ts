"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

/**
 * Shared by the three sign-out buttons (`/admin` topbar, `/dashboard`,
 * `/checkin`), which each had their own copy.
 *
 * Two things the copies got wrong:
 *
 *  - the result of `signOut()` was discarded, so a failed sign-out still
 *    navigated to /login and told the user they were signed out while the
 *    session cookie was still live. On a shared kiosk that hands the next
 *    person an authenticated session.
 *  - the default scope is 'global', which revokes every refresh token the
 *    user holds — signing them out of their phone because they closed the
 *    kiosk tab. 'local' ends this session only.
 */
export function useSignOut() {
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function signOut() {
    setSigningOut(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: signOutError } = await supabase.auth.signOut({
        scope: "local",
      });

      if (signOutError) {
        setError(signOutError.message);
        return;
      }

      router.push("/login");
      router.refresh();
    } catch {
      setError("Couldn't sign out. Check your connection and try again.");
    } finally {
      setSigningOut(false);
    }
  }

  return { signOut, signingOut, error };
}
