import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { chartColors, chartTooltipStyle } from "../lib/chart-theme";
import { formatCount, formatLatency, formatPercent } from "../lib/format";

export interface TimelinePoint {
  key: string;
  label: string;
  detail: string;
  up: number;
  degraded: number;
  down: number;
  latencyMs: number | null;
}

interface AvailabilityChartPoint extends TimelinePoint {
  upShare: number;
  degradedShare: number;
  downShare: number;
  noDataShare: number;
}

const axisTick = { fill: chartColors.muted, fontSize: 11 };

export function AvailabilityBars({
  points,
  showAxes,
}: {
  points: TimelinePoint[];
  showAxes: boolean;
}) {
  const chartPoints = points.map(availabilityPoint);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={chartPoints}
        barCategoryGap={showAxes ? "22%" : "14%"}
        margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
      >
        {showAxes ? (
          <CartesianGrid stroke={chartColors.grid} strokeDasharray="4 6" vertical={false} />
        ) : null}
        <XAxis
          dataKey="label"
          hide={!showAxes}
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          minTickGap={18}
        />
        <YAxis
          hide={!showAxes}
          domain={[0, 100]}
          ticks={[0, 50, 100]}
          unit="%"
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          width={48}
        />
        <Tooltip
          cursor={{ fill: chartColors.ink, fillOpacity: 0.05 }}
          content={<AvailabilityTooltip points={chartPoints} />}
        />
        <Bar
          dataKey="upShare"
          stackId="status"
          fill={chartColors.success}
          isAnimationActive={false}
        />
        <Bar
          dataKey="degradedShare"
          stackId="status"
          fill={chartColors.warning}
          isAnimationActive={false}
        />
        <Bar
          dataKey="downShare"
          stackId="status"
          fill={chartColors.danger}
          isAnimationActive={false}
        />
        <Bar
          dataKey="noDataShare"
          stackId="status"
          fill={chartColors.grid}
          fillOpacity={0.45}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LatencyArea({ points }: { points: TimelinePoint[] }) {
  const gradientId = `latency-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const sparse = points.filter((point) => point.latencyMs !== null).length < 3;
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
        <XAxis
          dataKey="label"
          scale="band"
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} unit="ms" width={48} />
        <Tooltip
          contentStyle={chartTooltipStyle}
          labelFormatter={(_, payload) => payload[0]?.payload.detail ?? ""}
          formatter={(value) => [
            formatLatency(typeof value === "number" ? value : null),
            "Response time",
          ]}
        />
        <Area
          type="monotone"
          dataKey="latencyMs"
          connectNulls
          dot={sparse ? { r: 3, fill: chartColors.lavender, strokeWidth: 0 } : false}
          stroke={chartColors.lavender}
          strokeWidth={2.5}
          fill={`url(#${gradientId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function availabilityPoint(point: TimelinePoint): AvailabilityChartPoint {
  const total = point.up + point.degraded + point.down;
  const share = (count: number) => (total ? (count / total) * 100 : 0);
  return {
    ...point,
    upShare: share(point.up),
    degradedShare: share(point.degraded),
    downShare: share(point.down),
    noDataShare: total ? 0 : 100,
  };
}

function AvailabilityTooltip({
  active,
  activeIndex,
  points,
}: Partial<Pick<TooltipContentProps, "active" | "activeIndex">> & {
  points: AvailabilityChartPoint[];
}) {
  const point = activeIndex == null ? undefined : points[Number(activeIndex)];
  if (!active || !point) return null;
  const total = point.up + point.degraded + point.down;
  return (
    <div style={chartTooltipStyle} className="min-w-40 px-3 py-2.5 text-xs">
      <p className="font-semibold text-ink">{point.detail}</p>
      {total ? (
        <>
          <p className="mt-1 font-display text-base font-bold text-ink">
            {formatPercent(((point.up + point.degraded) / total) * 100)}
          </p>
          <dl className="mt-1.5 space-y-0.5 text-muted">
            <TooltipRow color={chartColors.success} label="Up" value={point.up} />
            {point.degraded ? (
              <TooltipRow color={chartColors.warning} label="Degraded" value={point.degraded} />
            ) : null}
            {point.down ? (
              <TooltipRow color={chartColors.danger} label="Down" value={point.down} />
            ) : null}
          </dl>
        </>
      ) : (
        <p className="mt-1 text-muted">No results</p>
      )}
    </div>
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="flex items-center gap-1.5">
        <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </dt>
      <dd className="font-semibold text-ink">{formatCount(value, "result")}</dd>
    </div>
  );
}
