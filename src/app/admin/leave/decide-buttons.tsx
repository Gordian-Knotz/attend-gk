"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { decideLeaveRequest } from "./actions";

/**
 * Approve / reject for one request.
 *
 * Follows `org-name-form.tsx`: loading, error, and a `try/catch/finally` so a
 * rejected promise cannot leave both buttons spinning for ever.
 */
export function DecideButtons({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<null | "approved" | "rejected">(null);
  const [error, setError] = React.useState<string | null>(null);

  const decide = async (decision: "approved" | "rejected") => {
    setPending(decision);
    setError(null);
    try {
      const result = await decideLeaveRequest({ requestId, decision });
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending !== null}
          onClick={() => decide("rejected")}
        >
          {pending === "rejected" ? "Rejecting…" : "Reject"}
        </Button>
        <Button size="sm" disabled={pending !== null} onClick={() => decide("approved")}>
          {pending === "approved" ? "Approving…" : "Approve"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
