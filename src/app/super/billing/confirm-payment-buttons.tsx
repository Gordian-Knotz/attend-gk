"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { decidePayment } from "./actions";

/** Structurally the same as admin/leave/decide-buttons.tsx: approve/reject
 * becomes confirm/fail, over a different table, under the same trigger-backs-RLS
 * shape. */
export function ConfirmPaymentButtons({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<null | "confirmed" | "failed">(null);
  const [error, setError] = React.useState<string | null>(null);

  const decide = async (outcome: "confirmed" | "failed") => {
    setPending(outcome);
    setError(null);
    try {
      const result = await decidePayment(paymentId, outcome);
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
          onClick={() => decide("failed")}
        >
          {pending === "failed" ? "Marking…" : "Mark failed"}
        </Button>
        <Button size="sm" disabled={pending !== null} onClick={() => decide("confirmed")}>
          {pending === "confirmed" ? "Confirming…" : "Confirm"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
