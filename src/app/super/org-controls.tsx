"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Ban, RotateCcw } from "lucide-react";

import { setOrgSuspension, updateOrgBilling, updateOrgPlan } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

const PLAN_TIERS = ["starter", "growth", "enterprise"] as const;
const BILLING_STATUSES = ["trialing", "active", "past_due", "canceled"] as const;

/** Sentence case for display; the stored values stay snake_case. */
function label(value: string) {
  return value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function PlanSelect({
  orgId,
  value,
}: {
  orgId: string;
  value: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function onChange(next: string) {
    if (next === value) return;
    setPending(true);
    try {
      const result = await updateOrgPlan(orgId, next);
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    } catch {
      window.alert("Couldn't change the plan. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Select value={value} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="h-8 w-[9.5rem]" aria-label="Plan tier">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PLAN_TIERS.map((tier) => (
          <SelectItem key={tier} value={tier}>
            {label(tier)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function BillingSelect({
  orgId,
  value,
}: {
  orgId: string;
  value: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function onChange(next: string) {
    if (next === value) return;
    setPending(true);
    try {
      const result = await updateOrgBilling(orgId, next);
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    } catch {
      window.alert("Couldn't change billing status. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Select value={value} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="h-8 w-[9.5rem]" aria-label="Billing status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {BILLING_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            {label(status)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SuspensionButton({
  orgId,
  orgName,
  suspended,
}: {
  orgId: string;
  orgName: string;
  suspended: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function apply(next: boolean) {
    setPending(true);
    setError(null);
    try {
      const result = await setOrgSuspension(orgId, next, reason);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setReason("");
      router.refresh();
    } catch {
      setError("Couldn't apply that. Please try again.");
    } finally {
      setPending(false);
    }
  }

  // Lifting a suspension needs no reason, so it doesn't need the dialog.
  if (suspended) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => apply(false)}
        aria-label={`Restore ${orgName}`}
      >
        {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
        Restore
      </Button>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Suspend ${orgName}`}>
          <Ban /> Suspend
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suspend {orgName}?</DialogTitle>
          <DialogDescription>
            Everyone in this organization is locked out of the dashboard until
            you restore it. Nothing is deleted — their attendance history,
            staff and sites all stay exactly as they are.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="reason">Reason</Label>
          <Input
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Invoice 42 unpaid since 1 July"
            maxLength={280}
          />
          <p className="text-xs text-muted-foreground">
            Shown to their administrators, so write it for them to read.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button
            variant="destructive"
            disabled={pending || !reason.trim()}
            onClick={() => apply(true)}
          >
            {pending && <Loader2 className="animate-spin" />}
            Suspend organization
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
