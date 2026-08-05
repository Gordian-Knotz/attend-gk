/**
 * Placeholder "late" rule for the demo dashboard — a real implementation
 * should compare against each employee's scheduled shift start (once the
 * `shifts` table / scheduling module is built), not a fixed org-wide cutoff.
 */
export function classifyCheckIn(
  occurredAtIso: string,
  cutoffHour = 7,
  cutoffMinute = 15
): "present" | "late" {
  const d = new Date(occurredAtIso);
  const minutes = d.getHours() * 60 + d.getMinutes();
  const cutoff = cutoffHour * 60 + cutoffMinute;
  return minutes > cutoff ? "late" : "present";
}
