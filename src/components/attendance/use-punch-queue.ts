"use client";

import * as React from "react";

import { haversineMeters } from "@/lib/geo";

/**
 * The offline check-in queue, shared by `/dashboard` and `/checkin`.
 *
 * Those two carried byte-identical copies of this logic and differed only
 * in their JSX. That is a bad thing to duplicate — it is the offline punch
 * ledger, so the copies drifting apart means one surface loses or
 * double-counts attendance. They now share this hook and own only layout.
 *
 * The server action is injected because the two routes revalidate
 * different paths; everything else is identical.
 */

const QUEUE_KEY = "attendpac:offline-queue";

export type QueuedEvent = {
  eventType: "check_in" | "check_out";
  occurredAt: string;
  lat: number;
  lng: number;
  source: "mobile";
  /** Stamped when the punch is taken so a replay whose first response was
   *  lost is de-duplicated server-side (unique index, migration 0008)
   *  rather than landing twice. */
  clientEventId: string;
};

export type Geofence = {
  lat: number;
  lng: number;
  radiusM: number;
} | null;

type RecordAttendance = (
  input: QueuedEvent
) => Promise<
  { error?: string; retryable?: boolean; success?: true } | undefined
>;

function newEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Older WebViews on shared kiosk hardware. Must still be UUID-shaped:
  // the column is `uuid`, and the server discards anything that isn't,
  // which would silently disable de-duplication for those devices.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function readQueue(): QueuedEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
    // Anything else under this key — an object, a number, null from an
    // older build — would reach the flush loop and throw on iteration,
    // wedging the queue permanently.
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedEvent[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

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

export function usePunchQueue({
  geofence,
  initialLastEvent,
  recordAttendance,
}: {
  geofence: Geofence;
  initialLastEvent: "check_in" | "check_out" | null;
  recordAttendance: RecordAttendance;
}) {
  const [lastEvent, setLastEvent] = React.useState(initialLastEvent);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [distanceM, setDistanceM] = React.useState<number | null>(null);
  const [queueLength, setQueueLength] = React.useState(0);
  const [justSynced, setJustSynced] = React.useState(false);

  const nextAction: "check_in" | "check_out" =
    lastEvent === "check_in" ? "check_out" : "check_in";

  // `online` can fire while the mount-time flush is still awaiting, and
  // both runs would replay the same items against a queue neither has
  // written back yet.
  const flushing = React.useRef(false);
  const recordRef = React.useRef(recordAttendance);
  recordRef.current = recordAttendance;

  const flushQueue = React.useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;

    try {
      const queue = readQueue();
      if (queue.length === 0) return;

      let index = 0;
      for (; index < queue.length; index++) {
        const result = await recordRef.current(queue[index]);
        if (result?.error) {
          // Stop rather than skip. Punches are an ordered ledger, and
          // continuing past a failure would upload later items while an
          // earlier one is still pending — so a check-out could land
          // before its own check-in.
          break;
        }
      }

      // Re-read: a punch may have been appended while we were awaiting
      // above, and writing our stale copy back would silently delete it.
      const current = readQueue();
      const remaining = [...queue.slice(index), ...current.slice(queue.length)];

      writeQueue(remaining);
      setQueueLength(remaining.length);

      if (index > 0) {
        // Without this, `lastEvent` stays whatever it was before the flush
        // (often `null` on a fresh reload), so `nextAction` can still offer
        // "check in" to someone whose queued check-in just replayed — the
        // button would ask them to do the opposite of what they just did.
        setLastEvent(queue[index - 1].eventType);
        setJustSynced(true);
        window.setTimeout(() => setJustSynced(false), 3000);
      }
    } finally {
      flushing.current = false;
    }
  }, []);

  React.useEffect(() => {
    setQueueLength(readQueue().length);
    window.addEventListener("online", flushQueue);
    // Attempt a flush on mount too, in case we came back online while the
    // tab was closed.
    if (navigator.onLine) flushQueue();
    return () => window.removeEventListener("online", flushQueue);
  }, [flushQueue]);

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
        clientEventId: newEventId(),
      };

      // Queue instead of submitting directly whenever there's already a
      // backlog or a flush is running. Submitting straight through here
      // regardless of queue state let a fresh punch reach the server ahead
      // of older queued ones — a check-out could land before its own
      // check-in. Queueing preserves order; the serial flush (which
      // re-reads the queue) is what actually drains it.
      const queueBeforeSubmit = readQueue();
      if (!navigator.onLine || queueBeforeSubmit.length > 0 || flushing.current) {
        queueBeforeSubmit.push(payload);
        writeQueue(queueBeforeSubmit);
        setQueueLength(queueBeforeSubmit.length);
        setLastEvent(nextAction); // optimistic
        if (navigator.onLine) {
          // There's a backlog but we're online — don't make this punch
          // wait for the next 'online' event or a reload. flushQueue's own
          // in-flight guard makes this safe to call even if one is already
          // running (it becomes a no-op in that case).
          flushQueue();
        }
        return;
      }

      const result = await recordAttendance(payload);

      if (result?.error) {
        if (result.retryable) {
          // Transient (rate limit, a DB hiccup) — exactly what the offline
          // queue exists for. Discarding it here would silently drop a real
          // punch instead of retrying it. Queue it with its clientEventId so
          // the eventual replay is deduplicated rather than double-recorded.
          const queue = readQueue();
          queue.push(payload);
          writeQueue(queue);
          setQueueLength(queue.length);
          setLastEvent(nextAction); // optimistic, same as the offline path
          return;
        }
        // A validation failure (outside the geofence, unassigned site, …)
        // will fail identically on replay, so show it instead of queueing
        // a punch that can never succeed.
        setError(result.error);
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

  return {
    lastEvent,
    busy,
    error,
    distanceM,
    queueLength,
    justSynced,
    nextAction,
    handlePress,
  };
}
