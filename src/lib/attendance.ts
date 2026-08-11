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
/**
 * The late cutoff itself, exported so anything that displays it — currently
 * `/admin/settings`'s "Time & cutoffs" card — reads the value this function
 * actually enforces instead of a copy typed in separately, which can drift.
 */
export const LATE_CUTOFF_HOUR = 7;
export const LATE_CUTOFF_MINUTE = 15;

export function classifyCheckIn(
  occurredAtIso: string,
  cutoffHour = LATE_CUTOFF_HOUR,
  cutoffMinute = LATE_CUTOFF_MINUTE,
  timeZone: string = ORG_TIME_ZONE
): "present" | "late" {
  const { hour, minute } = wallClockIn(new Date(occurredAtIso), timeZone);
  const minutes = hour * 60 + minute;
  const cutoff = cutoffHour * 60 + cutoffMinute;
  return minutes > cutoff ? "late" : "present";
}
