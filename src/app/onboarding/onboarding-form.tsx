"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { provisionOrganization } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OnboardingForm() {
  const router = useRouter();
  const [orgName, setOrgName] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await provisionOrganization(orgName.trim(), fullName.trim());

      if (result?.error) {
        setError(result.error);
        return;
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
