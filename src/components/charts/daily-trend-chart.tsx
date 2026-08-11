"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

import { ChartTooltip, AXIS_TICK } from "./chart-tooltip";

export type DailyPoint = {
  /** Short axis label, e.g. "12 Mar" */
  label: string;
  value: number;
};

/**
 * A labelled daily series with a running total and an empty state — the
 * shape shared by "new organizations per day" on `/super` and "punches per
 * day" on the tenant detail page.
 *
 * A separate component rather than a flag on `AttendanceTrendChart`: that
 * one is three fixed series with an "no attendance recorded" empty state,
 * and threading `hiddenSeries` through it to draw one line would leave both
 * charts harder to read than either is now. Same axis and tooltip
 * primitives, so they still look like one family.
 */
export function DailyTrendChart({
  data,
  label,
}: {
  data: DailyPoint[];
  /** Exact noun for the series as displayed, e.g. "Signups" or "Punches". */
  label: string;
}) {
  const total = data.reduce((n, d) => n + d.value, 0);

  if (total === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        No {label.toLowerCase()} recorded in this period.
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id={`${label}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={44}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--border)" }} />
          <Area
            type="monotone"
            dataKey="value"
            name={label}
            stroke="var(--primary)"
            strokeWidth={2}
            fill={`url(#${label}-fill)`}
            dot={false}
            activeDot={{ r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
