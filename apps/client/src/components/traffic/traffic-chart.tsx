import type { TrafficReport } from "@mimorii/contracts";
import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { chartColors, chartTooltipStyle } from "../../lib/chart-theme";

const axisTick = { fill: chartColors.muted, fontSize: 11 };

export function TrafficChart({ report }: { report: TrafficReport }) {
  const gradientId = `traffic-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const hourly = report.granularity === "hour";
  const points = report.series.map((point) => {
    const date = new Date(point.bucket);
    return {
      ...point,
      label: hourly
        ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : date.toLocaleDateString([], { month: "short", day: "numeric" }),
      detail: hourly
        ? date.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })
        : date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }),
    };
  });
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={chartColors.lavender} stopOpacity={0.38} />
            <stop offset="1" stopColor={chartColors.lavender} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={chartColors.grid} strokeDasharray="4 6" vertical={false} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
        <Tooltip
          contentStyle={chartTooltipStyle}
          labelFormatter={(_, payload) => payload[0]?.payload.detail ?? ""}
          formatter={(value, name) => [
            typeof value === "number" ? value.toLocaleString() : "0",
            name === "visitors" ? "Visitors" : "Pageviews",
          ]}
        />
        <Area
          type="monotone"
          dataKey="pageviews"
          stroke={chartColors.coral}
          strokeWidth={1.5}
          strokeDasharray="4 4"
          fill="none"
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="visitors"
          stroke={chartColors.lavender}
          strokeWidth={2.5}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
