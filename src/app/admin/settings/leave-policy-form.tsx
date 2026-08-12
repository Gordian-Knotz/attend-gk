"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";

import { upsertLeavePolicy } from "./actions";
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

/**
 * The full set of leave types a policy row can exist for — mirrors 0014's
 * check constraint on `leave_policies.leave_type`. Used only to make sure
 * every type gets a row in this form even when the org has never set a
 * policy for it yet; nothing here decides whether a type is budgeted.
 */
const LEAVE_TYPES = ["annual", "sick", "compassionate", "unpaid"] as const;

export type LeavePolicyValue = {
  leaveType: string;
  annualDays: number;
  carryOverMax: number;
  /**
   * `annual` — the whole allowance exists from 1 January. `monthly` — one
   * twelfth per completed month, so a balance grows through the year.
   */
  accrualMode: "annual" | "monthly";
};

/** One row per leave type, each saving independently. */
function PolicyRow({ policy }: { policy: LeavePolicyValue }) {
  const router = useRouter();
  const [annualDays, setAnnualDays] = React.useState(String(policy.annualDays));
  const [carryOverMax, setCarryOverMax] = React.useState(
    String(policy.carryOverMax)
  );
  const [accrualMode, setAccrualMode] = React.useState(policy.accrualMode);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const dirty =
    Number(annualDays) !== policy.annualDays ||
    Number(carryOverMax) !== policy.carryOverMax ||
    accrualMode !== policy.accrualMode;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);

    try {
      const result = await upsertLeavePolicy({
        leaveType: policy.leaveType,
        annualDays: Number(annualDays),
        carryOverMax: Number(carryOverMax),
        accrualMode,
      });

      if (result?.error) {
        setError(result.error);
        return;
      }

      setSaved(true);
      router.refresh();
    } catch {
      // A rejected server action (network drop, deploy mid-request) would
      // otherwise leave the button spinning forever with nothing said.
      setError("Couldn't save just now. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 border-b border-border py-3 last:border-0"
    >
      <span className="min-w-24 flex-1 basis-32 self-center font-medium capitalize">
        {policy.leaveType}
      </span>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`annual-${policy.leaveType}`} className="text-xs">
          Annual days
        </Label>
        <Input
          id={`annual-${policy.leaveType}`}
          type="number"
          min={0}
          max={365}
          step="0.5"
          className="w-24"
          value={annualDays}
          onChange={(e) => {
            setAnnualDays(e.target.value);
            setSaved(false);
          }}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`carry-${policy.leaveType}`} className="text-xs">
          Carry-over max
        </Label>
        <Input
          id={`carry-${policy.leaveType}`}
          type="number"
          min={0}
          max={365}
          step="0.5"
          className="w-24"
          value={carryOverMax}
          onChange={(e) => {
            setCarryOverMax(e.target.value);
            setSaved(false);
          }}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`accrual-${policy.leaveType}`} className="text-xs">
          Accrual
        </Label>
        <Select
          value={accrualMode}
          onValueChange={(v) => {
            setAccrualMode(v as "annual" | "monthly");
            setSaved(false);
          }}
        >
          <SelectTrigger id={`accrual-${policy.leaveType}`} className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="annual">All at once</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2 self-center">
        <Button type="submit" size="sm" variant="outline" disabled={loading || !dirty}>
          {loading && <Loader2 className="animate-spin" />}
          Save
        </Button>
        {saved && !dirty && (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Check className="size-4 text-primary" /> Saved
          </span>
        )}
      </div>

      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}

/**
 * `policies` is whatever the org already has in `leave_policies` — possibly
 * nothing at all. Every leave type still gets a row here, defaulted to 0/0,
 * so an admin can grant a first-time policy rather than needing one to
 * already exist.
 */
export function LeavePolicyForm({ policies }: { policies: LeavePolicyValue[] }) {
  const byType = new Map(policies.map((p) => [p.leaveType, p]));

  const rows: LeavePolicyValue[] = LEAVE_TYPES.map(
    (leaveType) =>
      byType.get(leaveType) ?? {
        leaveType,
        annualDays: 0,
        carryOverMax: 0,
        accrualMode: "annual" as const,
      }
  );

  return (
    <div className="flex flex-col">
      {rows.map((row) => (
        <PolicyRow key={row.leaveType} policy={row} />
      ))}
    </div>
  );
}
