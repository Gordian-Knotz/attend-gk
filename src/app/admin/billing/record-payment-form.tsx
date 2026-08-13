"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { recordPayment } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Callout } from "@/components/callout";

/**
 * Follows `org-name-form.tsx`: loading/error state, a `try/catch/finally` so
 * a rejected promise cannot leave the button spinning forever, and
 * `router.refresh()` on success rather than local optimistic state — the
 * invoice list is what proves the payment was recorded.
 */
export function RecordPaymentForm({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [payerPhone, setPayerPhone] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await recordPayment({ invoiceId, payerPhone, reference });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setPayerPhone("");
      setReference("");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Callout variant="note" label="Nothing is charged from this form">
        This records that you paid over M-Pesa — it does not move any money
        itself. We confirm the transaction code and mark the invoice paid.
      </Callout>

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="payer-phone" className="text-xs">
            Phone number
          </Label>
          <Input
            id="payer-phone"
            type="tel"
            placeholder="07XXXXXXXX"
            className="w-40"
            value={payerPhone}
            onChange={(e) => setPayerPhone(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reference" className="text-xs">
            M-Pesa transaction code
          </Label>
          <Input
            id="reference"
            placeholder="e.g. QGH7K2LMNP"
            className="w-48"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            required
          />
        </div>

        <Button type="submit" className="self-end" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />}
          Record payment
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
