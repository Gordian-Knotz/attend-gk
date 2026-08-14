"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { provisionOrganization } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRESETS, TIER_LABELS, SCOPE_LABELS } from "@/lib/org-levels";

export function OnboardingForm() {
  const router = useRouter();
  const [orgName, setOrgName] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  // Defaults to the shape most tenants turn out to have, and every option is
  // editable afterwards, so this is a starting point rather than a commitment.
  const [presetKey, setPresetKey] = React.useState("small");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selected = PRESETS.find((p) => p.key === presetKey) ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await provisionOrganization(
        orgName.trim(),
        fullName.trim(),
        presetKey
      );

      if (result?.error) {
        setError(result.error);
        return;
      }

      // The org exists but the ladder didn't seed. Surface it and continue —
      // Settings offers the same presets, so this is recoverable.
      if (result?.warning) {
        setError(result.warning);
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setError("We couldn't create the organization. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="orgName">Organization name</Label>
        <Input
          id="orgName"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="Alpha Pride Security"
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="fullName">Your name</Label>
        <Input
          id="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Amina Otieno"
          autoComplete="name"
          required
        />
        <p className="text-xs text-muted-foreground">
          Shown on the staff roster. Previously this defaulted to your email
          address, which everyone you invited could then see.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="preset">How your team is structured</Label>
        <div className="flex flex-col gap-2">
          {PRESETS.map((preset) => (
            <label
              key={preset.key}
              className="flex cursor-pointer items-start gap-3 rounded-sm border border-border p-3 transition-colors hover:bg-secondary/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name="preset"
                value={preset.key}
                checked={presetKey === preset.key}
                onChange={() => setPresetKey(preset.key)}
                className="mt-1 accent-[var(--pac-orange)]"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{preset.label}</span>
                <span className="text-xs text-muted-foreground">
                  {preset.description}
                </span>
              </span>
            </label>
          ))}
        </div>

        {/* Shown rather than described: the levels are the thing being chosen,
            and a list of four names is easier to judge than a sentence about
            them. */}
        {selected && (
          <dl className="mt-1 rounded-sm border border-border bg-secondary/30 p-3 text-xs">
            {selected.levels.map((level) => (
              <div key={level.name} className="flex flex-wrap justify-between gap-2 py-1">
                <dt className="font-medium">
                  {level.rank}. {level.name}
                </dt>
                <dd className="text-muted-foreground">
                  {TIER_LABELS[level.suggestedTier]} ·{" "}
                  {SCOPE_LABELS[level.visibilityScope].toLowerCase()}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <p className="text-xs text-muted-foreground">
          Rename these, add levels or remove them from Settings at any time.
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        We&apos;ll set you up with a default site (&quot;Head Office&quot;) —
        you can rename it and set its real geofence location from Settings
        afterwards.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="submit"
        disabled={loading || !orgName.trim() || !fullName.trim()}
      >
        {loading && <Loader2 className="animate-spin" />}
        Create organization
      </Button>
    </form>
  );
}
