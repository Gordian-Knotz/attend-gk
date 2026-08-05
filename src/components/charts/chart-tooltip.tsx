"use client";

type Payload = {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
};

/**
 * Recharts' default tooltip is a white box with a grey border — it survives
 * neither the paper palette nor dark mode. This matches the card surface
 * and the mono label convention used everywhere else in the app.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: Payload[];
  label?: string | number;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-sm border border-border bg-popover px-3 py-2 shadow-lg">
      <div className="font-label text-muted-foreground">{label}</div>
      <div className="mt-1.5 flex flex-col gap-1">
        {payload.map((entry) => (
          <div
            key={String(entry.dataKey ?? entry.name)}
            className="flex items-center gap-2 text-sm"
          >
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-[1px]"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-mono text-xs">
              {entry.value}
              {unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const AXIS_TICK = {
  fill: "var(--muted-foreground)",
  fontSize: 11,
  fontFamily: "var(--font-plex-mono)",
} as const;
