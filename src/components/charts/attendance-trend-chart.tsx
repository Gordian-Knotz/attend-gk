"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

import { ChartTooltip, AXIS_TICK } from "./chart-tooltip";

export type TrendPoint = {
  /** Short axis label, e.g. "12 Mar" */
  label: string;
  present: number;
  late: number;
  absent: number;
};

export function AttendanceTrendChart({ data }: { data: TrendPoint[] }) {
  const isEmpty = data.every((d) => d.present + d.late + d.absent === 0);

  if (isEmpty) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        No attendance recorded in this period yet.
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
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
          <Legend
            iconType="square"
            iconSize={8}
            wrapperStyle={{
              fontSize: 11,
              fontFamily: "var(--font-plex-mono)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              paddingTop: 8,
            }}
          />
          <Line
            type="monotone"
            dataKey="present"
            name="Present"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="late"
            name="Late"
            stroke="var(--pac-orange-light)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="absent"
            name="Absent"
            stroke="var(--muted-foreground)"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            dot={false}
            activeDot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
