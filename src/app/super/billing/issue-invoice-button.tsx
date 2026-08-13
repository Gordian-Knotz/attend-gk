"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { issueInvoice } from "./actions";
import type { BillingPeriod } from "@/lib/billing";

export function IssueInvoiceButton({
  orgId,
  period,
}: {
  orgId: string;
  period: BillingPeriod;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const result = await issueInvoice(orgId, period);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" onClick={handleClick} disabled={loading}>
        {loading && <Loader2 className="animate-spin" />}
        Issue invoice
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
