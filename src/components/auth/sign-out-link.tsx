"use client";

import { useSignOut } from "@/components/auth/use-sign-out";

/** Text-style sign-out, for pages with no chrome to hang a button on. */
export function SignOutLink() {
  const { signOut, signingOut, error } = useSignOut();

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={signOut}
        disabled={signingOut}
        className="font-label rounded-sm text-muted-foreground underline transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
