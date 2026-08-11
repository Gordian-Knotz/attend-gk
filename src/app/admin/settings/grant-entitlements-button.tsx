"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { grantEntitlements } from "./actions";
import { Button } from "@/components/ui/button";

/**
 * Materialises `year`'s entitlements from the current policy. Safe to press
 * more than once: `ensure_leave_entitlements` is `on conflict do nothing`, so
 * a second press cannot overwrite an entitlement someone has since adjusted
 * by hand — it only fills in whatever is still missing.
 */
export function GrantEntitlementsButton({ year }: { year: number }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const result = await grantEntitlements(year);

      if (result?.error) {
        setError(result.error);
        return;
      }

      const created = result.created ?? 0;
      setMessage(
        created === 0
          ? "Nothing to create — everyone already has this year's."
          : `Created ${created} entitlement${created === 1 ? "" : "s"}.`
      );
      router.refresh();
    } catch {
      // A rejected server action (network drop, deploy mid-request) would
      // otherwise leave the button spinning forever with nothing said.
      setError("Couldn't grant just now. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleClick}
          disabled={loading}
        >
          {loading && <Loader2 className="animate-spin" />}
          Grant {year} entitlements
        </Button>
        {message && (
          <span className="text-sm text-muted-foreground">{message}</span>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <p className="text-xs text-muted-foreground">
        Safe to press twice — this only fills in employees who don&apos;t
        already have a {year} entitlement. It never overwrites one someone
        has adjusted by hand.
      </p>
    </div>
  );
}
