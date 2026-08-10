"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";

import { updateOrganizationName } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OrgNameForm({ currentName }: { currentName: string }) {
  const router = useRouter();
  const [name, setName] = React.useState(currentName);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const dirty = name.trim() !== currentName && name.trim().length > 0;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);

    try {
      const result = await updateOrganizationName({ name });

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="orgName">Organization name</Label>
        <Input
          id="orgName"
          name="orgName"
          value={name}
          maxLength={120}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          required
        />
        <p className="text-xs text-muted-foreground">
          Shown to everyone in your organization, and on invitation emails.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={loading || !dirty}>
          {loading && <Loader2 className="animate-spin" />}
          Save changes
        </Button>
        {saved && !dirty && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Check className="size-4 text-primary" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}
