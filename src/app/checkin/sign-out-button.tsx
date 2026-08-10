"use client";

import { useSignOut } from "@/components/auth/use-sign-out";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const { signOut, signingOut, error } = useSignOut();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="ghost" size="sm" onClick={signOut} disabled={signingOut}>
        {signingOut ? "Signing out…" : "Sign out"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
