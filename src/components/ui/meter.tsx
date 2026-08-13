import { cn } from "@/lib/utils";

/**
 * A single ratio against a limit — "14 of 21 days taken" — not a chart.
 * `bg-primary/15` for the track is the same soft-orange treatment
 * `month-calendar.tsx` already uses for a leave-day badge: a lighter step of
 * the same hue rather than a second color, so the fill is what draws the eye.
 *
 * `rounded-sm`, not `rounded-full` — this codebase standardized on that
 * radius (see the commit "Use the Select primitive that already existed,
 * and the radius the codebase uses"); a pill-shaped meter would be the same
 * mistake again.
 */
export function Meter({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  /** Accessible name — a screen reader announces "progressbar" with no name
   *  otherwise. Optional because most callers already print the same value
   *  as visible text next to the meter, which the label would only repeat. */
  label?: string;
  className?: string;
}) {
  // A meter with nothing to be a ratio of has no valid range to report —
  // `aria-valuemax` of 0 (or less) is an invalid range, not a 0% one.
  const hasRange = max > 0;
  const pct = hasRange ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const valueNow = hasRange ? Math.min(max, Math.max(0, Math.round(value * 10) / 10)) : 0;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={hasRange ? valueNow : undefined}
      aria-valuemin={0}
      aria-valuemax={hasRange ? max : undefined}
      className={cn("h-1.5 w-full overflow-hidden rounded-sm bg-primary/15", className)}
    >
      <div
        className="h-full rounded-sm bg-primary transition-[width]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
