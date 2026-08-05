"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

import { ChartTooltip, AXIS_TICK } from "./chart-tooltip";

export type SitePoint = {
  label: string;
  /** Attendance rate for the period, 0–100. */
  rate: number;
};

export function SiteAttendanceChart({ data }: { data: SitePoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        No sites to compare yet.
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            interval={0}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            domain={[0, 100]}
            width={44}
          />
          <Tooltip
            content={<ChartTooltip unit="%" />}
            cursor={{ fill: "var(--secondary)" }}
          />
          <Bar
            dataKey="rate"
            name="Attendance"
            fill="var(--primary)"
            radius={[2, 2, 0, 0]}
            maxBarSize={56}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
