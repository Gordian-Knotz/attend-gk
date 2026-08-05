"use client";

import * as React from "react";
import { LogIn, LogOut, MapPin, Loader2, WifiOff, CheckCircle2 } from "lucide-react";

import { recordAttendance } from "./actions";
import { haversineMeters } from "@/lib/geo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Callout } from "@/components/callout";

const QUEUE_KEY = "attendpac:offline-queue";

type QueuedEvent = {
  eventType: "check_in" | "check_out";
  occurredAt: string;
  lat: number;
  lng: number;
  source: "mobile";
};

type Geofence = {
  lat: number;
  lng: number;
  radiusM: number;
} | null;

function readQueue(): QueuedEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedEvent[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function CheckInClient({
  siteName,
  geofence,
  initialLastEvent,
}: {
  siteName: string | null;
  geofence: Geofence;
  initialLastEvent: "check_in" | "check_out" | null;
}) {
  const [lastEvent, setLastEvent] = React.useState(initialLastEvent);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [distanceM, setDistanceM] = React.useState<number | null>(null);
  const [queueLength, setQueueLength] = React.useState(0);
  const [justSynced, setJustSynced] = React.useState(false);

  const nextAction: "check_in" | "check_out" =
    lastEvent === "check_in" ? "check_out" : "check_in";

  const flushQueue = React.useCallback(async () => {
    const queue = readQueue();
    if (queue.length === 0) return;

    const remaining: QueuedEvent[] = [];
    for (const item of queue) {
      const result = await recordAttendance(item);
      if (result?.error) {
        remaining.push(item);
      }
    }
    writeQueue(remaining);
    setQueueLength(remaining.length);
    if (remaining.length < queue.length) {
      setJustSynced(true);
      window.setTimeout(() => setJustSynced(false), 3000);
    }
  }, []);

  React.useEffect(() => {
    setQueueLength(readQueue().length);
    window.addEventListener("online", flushQueue);
    // attempt a flush on mount too, in case we came back online while the
    // tab was closed
    if (navigator.onLine) flushQueue();
    return () => window.removeEventListener("online", flushQueue);
  }, [flushQueue]);

  function getPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("This browser doesn't support location services."));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
      });
    });
  }

  async function handlePress() {
    setError(null);
    setBusy(true);

    try {
      const position = await getPosition();
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      if (geofence) {
        setDistanceM(haversineMeters(geofence.lat, geofence.lng, lat, lng));
      }

      const payload: QueuedEvent = {
        eventType: nextAction,
        occurredAt: new Date().toISOString(),
        lat,
        lng,
        source: "mobile",
      };

      if (!navigator.onLine) {
        const queue = readQueue();
        queue.push(payload);
        writeQueue(queue);
        setQueueLength(queue.length);
        setLastEvent(nextAction); // optimistic
        setBusy(false);
        return;
      }

      const result = await recordAttendance(payload);

      if (result?.error) {
        setError(result.error);
        setBusy(false);
        return;
      }

      setLastEvent(nextAction);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't get your location. Check location permissions and try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col items-center gap-6 py-10 text-center">
          <div>
            <div className="font-label text-muted-foreground">Site</div>
            <div className="mt-1 font-serif text-2xl">
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
