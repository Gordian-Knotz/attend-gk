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
  className,
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value * 10) / 10}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn("h-1.5 w-full overflow-hidden rounded-sm bg-primary/15", className)}
    >
      <div
        className="h-full rounded-sm bg-primary transition-[width]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
