"use client";

import { LogIn, LogOut, MapPin, Loader2, WifiOff, CheckCircle2 } from "lucide-react";

import { recordAttendance } from "./actions";
import {
  usePunchQueue,
  type Geofence,
} from "@/components/attendance/use-punch-queue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Callout } from "@/components/callout";

export function CheckInClient({
  siteName,
  geofence,
  initialLastEvent,
}: {
  siteName: string | null;
  geofence: Geofence;
  initialLastEvent: "check_in" | "check_out" | null;
}) {
  const {
    lastEvent,
    busy,
    error,
    distanceM,
    queueLength,
    justSynced,
    nextAction,
    handlePress,
  } = usePunchQueue({ geofence, initialLastEvent, recordAttendance });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col items-center gap-6 py-10 text-center">
          <div>
            <div className="font-label text-muted-foreground">Site</div>
            <div className="mt-1 font-display text-2xl">
              {siteName ?? "No site assigned"}
            </div>
          </div>

          <Badge variant={lastEvent === "check_in" ? "attention" : "outline"}>
            {lastEvent === "check_in" ? "Currently clocked in" : "Currently clocked out"}
          </Badge>

          <Button
            size="lg"
            variant={nextAction === "check_in" ? "default" : "outline"}
            className="h-16 w-full max-w-xs text-base"
            disabled={busy}
            onClick={handlePress}
          >
            {busy ? (
              <Loader2 className="animate-spin" />
            ) : nextAction === "check_in" ? (
              <LogIn />
            ) : (
              <LogOut />
            )}
            {busy
              ? "Getting your location…"
              : nextAction === "check_in"
                ? "Clock in"
                : "Clock out"}
          </Button>

          {distanceM !== null && geofence && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3.5" />
              {Math.round(distanceM)}m from site
              {distanceM > geofence.radiusM ? " — outside geofence" : ""}
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Callout variant="critical" label="Couldn't record that">
          {error}
        </Callout>
      )}

      {queueLength > 0 && (
        <Callout variant="note" label="Queued offline">
          <span className="inline-flex items-center gap-1.5">
            <WifiOff className="size-3.5" />
            {queueLength} check-{queueLength === 1 ? "in/out" : "ins/outs"}{" "}
            waiting to sync — this happens automatically once you&apos;re back
            online.
          </span>
        </Callout>
      )}

      {justSynced && (
        <Callout variant="status" label="Synced">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5" />
            Queued check-ins synced.
          </span>
        </Callout>
      )}
    </div>
  );
}
