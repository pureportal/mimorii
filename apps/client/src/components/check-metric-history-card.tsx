import type { CheckSummary } from "@mimorii/contracts";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { checkMetricThresholds, createCheckMetricChartPoints } from "../lib/check-chart";
import { checkMetricScale, formatCheckMetric, type CheckHistorySeries } from "../lib/check-health";
import { chartColors, chartTooltipStyle } from "../lib/chart-theme";
import {
  AlarmMarker,
  formatChartDate,
  formatChartTime,
  ThresholdBoundaryDots,
  ThresholdLine,
  ThresholdRanges,
  thresholdName,
  visibleThresholds,
} from "./check-chart-elements";

export function CheckMetricHistoryCard({
  check,
  series,
}: {
  check: CheckSummary;
  series: CheckHistorySeries;
}) {
  const thresholds = checkMetricThresholds(check, series.key);
  const points = createCheckMetricChartPoints(series.points, thresholds);
  const displayedThresholds = points.some(
    (point) => point.warningValue !== null || point.criticalValue !== null
  )
    ? thresholds
    : [];
  const latest = points.at(-1)?.value ?? null;
  const scale = checkMetricScale(series.key);

  return (
    <div className="h-52 rounded-2xl border border-line p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-semibold">{series.label}</h4>
        <span className="text-sm font-bold">
          {latest === null ? "—" : formatCheckMetric(series.key, latest)}
        </span>
      </div>
      <div className="mt-2 h-40">
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <LineChart data={points} margin={{ top: 18, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid
              yAxisId={scale}
              stroke={chartColors.grid}
              strokeDasharray="4 6"
              vertical={false}
            />
            <XAxis
              dataKey="checkedAt"
              tickFormatter={formatChartTime}
              tick={{ fill: chartColors.muted, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              minTickGap={30}
            />
            <YAxis
              yAxisId={scale}
              tick={{ fill: chartColors.muted, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => formatCheckMetric(series.key, value)}
              domain={scale === "percent" ? [0, 100] : ["auto", "auto"]}
              width={56}
            />
            <Tooltip
              labelFormatter={formatChartDate}
              formatter={(value) => [
                typeof value === "number" ? formatCheckMetric(series.key, value) : "—",
                series.label,
              ]}
              contentStyle={chartTooltipStyle}
            />
            <ThresholdRanges thresholds={displayedThresholds} yAxisId={scale} showAreas />
            {visibleThresholds(displayedThresholds).map((threshold) => (
              <ThresholdLine
                key={`${threshold.comparison}-${threshold.value}`}
                threshold={threshold}
                yAxisId={scale}
                label={`${thresholdName(threshold)} ${formatCheckMetric(series.key, threshold.value)}`}
              />
            ))}
            <Line
              type="linear"
              dataKey="value"
              name={series.label}
              yAxisId={scale}
              stroke={chartColors.lavender}
              strokeWidth={2.25}
              dot={points.length === 1}
            />
            <Line
              type="linear"
              dataKey="warningValue"
              yAxisId={scale}
              stroke={chartColors.warning}
              strokeWidth={3}
              dot={false}
              activeDot={false}
              connectNulls={false}
              tooltipType="none"
            />
            <Line
              type="linear"
              dataKey="criticalValue"
              yAxisId={scale}
              stroke={chartColors.danger}
              strokeWidth={3}
              dot={false}
              activeDot={false}
              connectNulls={false}
              tooltipType="none"
            />
            <ThresholdBoundaryDots metricKey={series.key} points={points} yAxisId={scale} />
            {points.flatMap((point) =>
              point.triggeredIncidentId
                ? [
                    <AlarmMarker
                      key={point.triggeredIncidentId}
                      point={{
                        checkedAt: point.checkedAt,
                        value: point.value,
                        scale,
                        incidentId: point.triggeredIncidentId,
                      }}
                    />,
                  ]
                : []
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
