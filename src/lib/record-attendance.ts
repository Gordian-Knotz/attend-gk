import { createClient } from "@/lib/supabase/server";
import { haversineMeters } from "@/lib/geo";
import { attendanceLimiter, retryAfterMessage } from "@/lib/rate-limit";

/**
 * The single server-side punch path.
 *
 * `/dashboard` and `/checkin` previously each carried their own byte-for-byte
 * copy of this logic. That is a poor place for a duplicate: it is the
 * geofence check, so the two copies drifting apart means one surface quietly
 * stops enforcing it. They now share this module and differ only in which
 * route they revalidate.
 *
 * This is fast, specific feedback ("you're 240m away"), not the enforcement
 * point. Enforcement lives in the BEFORE INSERT trigger from 0007/0008, which
 * also covers PowerSync, the future Expo app and the biometric bridge — none
 * of which call this function.
 */

export type RecordAttendanceInput = {
  eventType: "check_in" | "check_out";
  /** Client-authoritative timestamp (ISO string) — per Section 04, trusted
   *  over server-arrival time for ordering, since offline-queued events
   *  can land long after they actually happened. */
  occurredAt: string;
  lat: number;
  lng: number;
  source?: "mobile" | "kiosk_qr";
  /** Stamped by the client when the punch is taken, so replaying a queued
   *  item whose response was lost collides on the unique index from 0008
   *  instead of writing the punch twice. */
  clientEventId?: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Clock skew we'll tolerate on a device that is a little ahead of us. */
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

/** Oldest punch the offline queue is expected to replay. */
const MAX_QUEUE_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const EVENT_TYPES = ["check_in", "check_out"] as const;

/** Sources a staff client may write; 'manual'/'biometric' are admin-only
 *  and, as of 0008, rejected by RLS for anyone else. */
const CLIENT_SOURCES = ["mobile", "kiosk_qr"] as const;

function isCoord(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= max;
}

/**
 * Optional siblings on both members so callers can read `result.error`
 * directly, which is how every existing call site is written.
 *
 * `retryable` distinguishes a transient failure (rate limit, a DB hiccup)
 * from a validation failure (outside the geofence, unassigned site, bad
 * input). The offline queue (`use-punch-queue.ts`) uses it to decide whether
 * to hold onto a punch for a later replay or show the error and drop it —
 * a validation failure will fail identically next time, so queueing it
 * would just make the punch fail again on every future flush.
 */
export type RecordAttendanceResult =
  | { error: string; retryable?: boolean; success?: undefined }
  | { error?: undefined; retryable?: undefined; success: true };

export async function recordAttendanceFor(
  input: RecordAttendanceInput
): Promise<RecordAttendanceResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not signed in." };
  }

  // Keyed on the user, not the IP: a whole site's staff can share one
  // connection, and a per-IP cap would throttle a shift change. Generous
  // enough for an offline queue draining a backlog.
  const punchQuota = await attendanceLimiter.check(user.id);
  if (!punchQuota.ok) {
    return {
      error: `Too many check-ins in a short time. ${retryAfterMessage(punchQuota.retryAfterMs)}`,
      retryable: true,
    };
  }

  if (!EVENT_TYPES.includes(input.eventType)) {
    return { error: "Unrecognised check-in type." };
  }

  const source = input.source ?? "mobile";
  if (!CLIENT_SOURCES.includes(source)) {
    return { error: "Unrecognised check-in source." };
  }

  // NaN and Infinity both survive a `number` type annotation and would reach
  // haversine, which returns NaN — and `NaN > radius` is false, so an
  // out-of-range punch would have been *accepted*.
  if (!isCoord(input.lat, 90) || !isCoord(input.lng, 180)) {
    return { error: "Location unavailable — enable GPS and try again." };
  }

  // occurredAt is client-authoritative by design, but "trusted for ordering"
  // is not the same as "unbounded". Without a sanity window a client could
  // backdate a punch to any date in history or park one in the future.
  const occurredAt = new Date(input.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    return { error: "That check-in has an invalid timestamp." };
  }

  const now = Date.now();
  if (occurredAt.getTime() > now + MAX_FUTURE_SKEW_MS) {
    return { error: "That check-in is dated in the future — check the device clock." };
  }
  if (occurredAt.getTime() < now - MAX_QUEUE_AGE_MS) {
    return { error: "That check-in is too old to submit. Ask your manager to record it." };
  }

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id, org_id, site_id")
    .eq("id", user.id)
    .single();

  if (employeeError || !employee) {
    return {
      error: "Your account isn't linked to an organization yet — ask your admin to add you.",
    };
  }

  // As of 0008 the trigger rejects a GPS-bearing punch with no site rather
  // than waving it through, so say so here instead of surfacing a raised
  // Postgres exception.
  if (!employee.site_id) {
    return {
      error: "You're not assigned to a site yet — ask your admin to assign one.",
    };
  }

  const { data: site, error: siteError } = await supabase
    .from("sites")
    .select("geofence_lat, geofence_lng, geofence_radius_m")
    .eq("id", employee.site_id)
    .single();

  // Previously a failed lookup fell through and inserted with no geofence
  // check at all — a transient error became a silent bypass.
  if (siteError || !site) {
    return {
      error: "Couldn't verify your site right now — try again in a moment.",
      retryable: true,
    };
  }

  if (
    site.geofence_lat === null ||
    site.geofence_lng === null ||
    site.geofence_radius_m === null
  ) {
    return { error: "Your site has no geofence configured — ask your admin to set one." };
  }

  const distanceM = haversineMeters(
    site.geofence_lat,
    site.geofence_lng,
    input.lat,
    input.lng
  );

  if (!Number.isFinite(distanceM)) {
    return {
      error: "Couldn't work out your distance from the site — try again.",
      retryable: true,
    };
  }

  if (distanceM > site.geofence_radius_m) {
    return {
      error: `You're ${Math.round(distanceM)}m from the site — outside the ${site.geofence_radius_m}m geofence. Move closer and try again.`,
    };
  }

  // A present-but-malformed id used to be silently coerced to null, which
  // disables idempotency for that punch — exactly the guarantee the offline
  // queue relies on to avoid double-recording. Absent is fine (older client
  // build, or a caller that doesn't queue); malformed means something is
  // wrong and the write should fail rather than proceed unprotected.
  if (input.clientEventId !== undefined && !UUID_PATTERN.test(input.clientEventId)) {
    return { error: "That check-in has a corrupted identifier — please try again." };
  }
  const clientEventId = input.clientEventId ?? null;

  const { error: insertError } = await supabase.from("attendance_events").insert({
    employee_id: employee.id,
    org_id: employee.org_id,
    site_id: employee.site_id,
    source,
    event_type: input.eventType,
    occurred_at: occurredAt.toISOString(),
    gps_lat: input.lat,
    gps_lng: input.lng,
    // Recomputed by the trigger regardless; sent so the row is complete if
    // the trigger is ever disabled on a scratch database.
    distance_m: distanceM,
    client_event_id: clientEventId,
  });

  if (insertError) {
    // 23505 means *some* unique constraint was violated, and this table has
    // more than one. Only treat it as a benign duplicate when it's the
    // client_event_id index from migration 0008 — any other unique
    // violation is a real conflict, not a replay of this exact punch.
    if (
      insertError.code === "23505" &&
      clientEventId &&
      insertError.message.includes("attendance_events_client_event_id_key")
    ) {
      return { success: true as const };
    }
    // PostgREST messages name tables, columns and constraints — fine to log,
    // not fine to hand to a client. src/app/contact-actions.ts does the same
    // split for the same reason.
    console.error("[attendance] insert failed", insertError.message);
    return {
      error: "Couldn't record that check-in — try again in a moment.",
      retryable: true,
    };
  }

  return { success: true as const };
}
