"use client";

import * as React from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import {
  PRESETS,
  ASSIGNABLE_TIERS,
  VISIBILITY_SCOPES,
  TIER_LABELS,
  SCOPE_LABELS,
  scopeReachesBeyondTier,
  type AssignableTier,
  type VisibilityScope,
} from "@/lib/org-levels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { applyLevelPreset, addLevel, deleteLevel } from "./org-levels-actions";

export type OrgLevel = {
  id: string;
  name: string;
  rank: number;
  suggested_tier: AssignableTier;
  visibility_scope: VisibilityScope;
  /** How many people are currently on this level. */
  memberCount: number;
};

/**
 * The organization's rank ladder.
 *
 * Two states: unconfigured, which offers the same presets as onboarding, and
 * configured, which lists the ladder with add and remove.
 *
 * Editing an existing level in place is deliberately not here yet — remove and
 * re-add covers it, and an inline edit form per row is a lot of surface for a
 * first pass. `updateLevel` exists in the actions file for when it is added.
 */
export function OrgLevelsForm({ levels }: { levels: OrgLevel[] }) {
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const [rank, setRank] = React.useState(String(levels.length + 1));
  const [tier, setTier] = React.useState<AssignableTier>("staff");
  const [scope, setScope] = React.useState<VisibilityScope>("self");

  // Mirrors the server's refusal so the reason appears before submitting
  // rather than after. The server check is the one that counts.
  const scopeTooWide = scopeReachesBeyondTier(scope, tier);

  async function run(label: string, fn: () => Promise<{ error?: string }>) {
    setPending(label);
    setError(null);
    setNotice(null);
    try {
      const result = await fn();
      if (result?.error) setError(result.error);
      return !result?.error;
    } catch {
      setError("Something went wrong. Reload and try again.");
      return false;
    } finally {
      setPending(null);
    }
  }

  if (levels.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Your organization has no levels yet, so everyone is described only by
          their access role. Pick a starting structure — you can rename, add or
          remove levels afterwards.
        </p>

        <div className="flex flex-col gap-2">
          {PRESETS.map((preset) => (
            <div
              key={preset.key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{preset.label}</p>
                <p className="text-xs text-muted-foreground">
                  {preset.levels.map((l) => l.name).join(" → ")}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={pending !== null}
                onClick={() =>
                  run(preset.key, async () => {
                    const r = await applyLevelPreset(preset.key);
                    if (!r.error) setNotice(`Added ${r.created} levels.`);
                    return r;
                  })
                }
              >
                {pending === preset.key && <Loader2 className="animate-spin" />}
                Use this
              </Button>
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <dl className="border-t-2 border-foreground/80">
        {levels.map((level) => (
          <div
            key={level.id}
            className="flex flex-wrap items-center gap-3 border-b border-border py-3 last:border-0"
          >
            <dt className="flex min-w-0 flex-1 items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {level.rank}
              </span>
              <span className="text-sm font-medium">{level.name}</span>
            </dt>

            <dd className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{TIER_LABELS[level.suggested_tier]}</Badge>
              <span className="text-xs text-muted-foreground">
                Sees: {SCOPE_LABELS[level.visibility_scope].toLowerCase()}
              </span>
              <span className="text-xs text-muted-foreground">
                {level.memberCount === 0
                  ? "nobody yet"
                  : level.memberCount === 1
                    ? "1 person"
                    : `${level.memberCount} people`}
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove ${level.name}`}
                disabled={pending !== null}
                onClick={() => run(level.id, () => deleteLevel(level.id))}
              >
                {pending === level.id ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </Button>
            </dd>
          </div>
        ))}
      </dl>

      {adding ? (
        <div className="flex flex-col gap-3 rounded-sm border border-border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="level-name">Name</Label>
              <Input
                id="level-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Head of Department"
                maxLength={60}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="level-rank">Rank (1 is most senior)</Label>
              <Input
                id="level-rank"
                type="number"
                min={1}
                max={50}
                value={rank}
                onChange={(e) => setRank(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="level-tier">Access level</Label>
              <select
                id="level-tier"
                value={tier}
                onChange={(e) => setTier(e.target.value as AssignableTier)}
                className="h-9 rounded-sm border border-border bg-background px-3 text-sm"
              >
                {ASSIGNABLE_TIERS.map((t) => (
                  <option key={t} value={t}>
                    {TIER_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="level-scope">Can see</Label>
              <select
                id="level-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as VisibilityScope)}
                className="h-9 rounded-sm border border-border bg-background px-3 text-sm"
              >
                {VISIBILITY_SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {SCOPE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {scopeTooWide && (
            <p className="text-sm text-destructive">
              {SCOPE_LABELS[scope]} is wider than {TIER_LABELS[tier]} allows, so
              it would have no effect. Raise the access level or narrow what
              they can see.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pending !== null || !name.trim() || scopeTooWide}
              onClick={async () => {
                const ok = await run("add", () =>
                  addLevel({
                    name,
                    rank: Number(rank),
                    suggestedTier: tier,
                    visibilityScope: scope,
                  })
                );
                if (ok) {
                  setName("");
                  setAdding(false);
                }
              }}
            >
              {pending === "add" && <Loader2 className="animate-spin" />}
              Add level
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          onClick={() => {
            setRank(String(levels.length + 1));
            setAdding(true);
          }}
        >
          <Plus className="size-4" />
          Add a level
        </Button>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}

      {/* This text was "levels don't change anyone's access", which was true
          until the restrictive policies landed. Visibility is now enforced by
          the database, so the copy has to say so. */}
      <p className="text-xs text-muted-foreground">
        Visibility is enforced. Someone on a level set to{" "}
        <em>their own team</em> sees records only for the people who report to
        them, however wide their access level is. It can only narrow: the access
        level on each person&apos;s record remains the ceiling.
      </p>
    </div>
  );
}
