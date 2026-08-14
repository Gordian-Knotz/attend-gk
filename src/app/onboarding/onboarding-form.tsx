"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Crosshair } from "lucide-react";

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

  // The site's location. Required as of migration 0027: it used to default to
  // Nairobi at 150 m, so the first clock-in failed for every tenant based
  // anywhere else, with nothing on screen explaining why.
  const [siteName, setSiteName] = React.useState("Head Office");
  const [lat, setLat] = React.useState("");
  const [lng, setLng] = React.useState("");
  const [radius, setRadius] = React.useState("150");
  const [locating, setLocating] = React.useState(false);
  const [locateError, setLocateError] = React.useState<string | null>(null);

  const hasLocation = lat.trim() !== "" && lng.trim() !== "";

  function detectLocation() {
    setLocateError(null);

    if (!("geolocation" in navigator)) {
      setLocateError("This browser can't detect location. Type the coordinates in below.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Six decimals is ~0.1 m, far finer than any geofence needs, and it
        // keeps the field readable.
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        // Denied, unavailable or timed out — all the same instruction, and the
        // manual fields are always on screen so this is never a dead end.
        setLocateError(
          "Couldn't get your location. Allow it in your browser, or type the coordinates in below."
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }

  const selected = PRESETS.find((p) => p.key === presetKey) ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await provisionOrganization(
        orgName.trim(),
        fullName.trim(),
        {
          name: siteName.trim(),
          lat: Number(lat),
          lng: Number(lng),
          radiusM: Number(radius),
        },
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

      {/* The location is asked for here, not defaulted, because a wrong
          geofence does not fail at signup — it fails days later when a real
          employee cannot clock in, and the error they see is correct while the
          configuration is the lie. */}
      <div className="flex flex-col gap-3 rounded-sm border border-border p-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="siteName">Your first site</Label>
          <Input
            id="siteName"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            placeholder="Head Office"
            required
          />
        </div>

        <div>
          <p className="text-sm font-medium">Where is it?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Staff can only clock in within this many metres of the spot. Stand
            at the gate and detect it, or type the coordinates in. You can move
            it later from Settings.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={detectLocation}
          disabled={locating}
        >
          {locating ? <Loader2 className="animate-spin" /> : <Crosshair />}
          {hasLocation ? "Detect again" : "Use my current location"}
        </Button>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="lat">Latitude</Label>
            <Input
              id="lat"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              inputMode="decimal"
              placeholder="-1.2833"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lng">Longitude</Label>
            <Input
              id="lng"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              inputMode="decimal"
              placeholder="36.8167"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="radius">Radius (m)</Label>
            <Input
              id="radius"
              type="number"
              min={20}
              max={10000}
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              required
            />
          </div>
        </div>

        {locateError && (
          <p className="text-xs text-destructive">{locateError}</p>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="submit"
        disabled={
          loading || !orgName.trim() || !fullName.trim() || !hasLocation
        }
      >
        {loading && <Loader2 className="animate-spin" />}
        Create organization
      </Button>
    </form>
  );
}
