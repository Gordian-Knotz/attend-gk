import { ORG_TIME_ZONE, wallClockIn } from "@/lib/timezone";

/**
 * Placeholder "late" rule for the demo dashboard — a real implementation
 * should compare against each employee's scheduled shift start (once the
 * `shifts` table / scheduling module is built), not a fixed org-wide cutoff.
 *
 * The hour is read in the organization's timezone, not the server's.
 * `Date.getHours()` returns whatever zone the rendering process is in, so
 * the same punch classified as present locally and late on a US-hosted
 * deploy — and this feeds the trend chart, the reports table and the CSV.
 */
export function classifyCheckIn(
  occurredAtIso: string,
  cutoffHour = 7,
  cutoffMinute = 15,
  timeZone: string = ORG_TIME_ZONE
): "present" | "late" {
  const { hour, minute } = wallClockIn(new Date(occurredAtIso), timeZone);
  const minutes = hour * 60 + minute;
  const cutoff = cutoffHour * 60 + cutoffMinute;
  return minutes > cutoff ? "late" : "present";
}
