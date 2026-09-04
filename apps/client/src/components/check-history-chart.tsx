import type { CheckResult, CheckSummary } from "@mimorii/contracts";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  checkMetricThresholds,
  createCheckMetricChartPoints,
  type CheckMetricChartPoint,
  type CheckMetricThreshold,
} from "../lib/check-chart";
import {
  checkMetricScale,
  createCheckHistorySeries,
  formatCheckMetric,
  prioritizeCheckHistorySeries,
  type CheckHistorySeries,
  type CheckMetricScale,
} from "../lib/check-health";
import { chartColors, chartTooltipStyle } from "../lib/chart-theme";
import {
  AlarmMarker,
  type ChartAlarmPoint,
  formatChartDate,
  formatChartTime,
  ThresholdBoundaryDots,
  ThresholdLine,
  ThresholdRanges,
  thresholdName,
  visibleThresholds,
} from "./check-chart-elements";

interface CheckHistoryChartProps {
  check: CheckSummary;
  results: CheckResult[];
}

interface SeriesChart {
  series: CheckHistorySeries;
  thresholds: CheckMetricThreshold[];
  points: CheckMetricChartPoint[];
  scale: CheckMetricScale;
}

interface CombinedThreshold {
  threshold: CheckMetricThreshold;
  metricKey: string;
  labels: string[];
  scale: CheckMetricScale;
  appliesToWholeScale: boolean;
}

export function CheckHistoryChart({ check, results }: CheckHistoryChartProps) {
  const charts = createSeriesCharts(check, results).slice(0, 2);
  const axes = charts.reduce<Array<{ scale: CheckMetricScale; metricKey: string; index: number }>>(
    (items, chart, index) => {
      if (!items.some((item) => item.scale === chart.scale)) {
        items.push({ scale: chart.scale, metricKey: chart.series.key, index });
      }
      return items;
    },
    []
  );
  const pointsBySeries = charts.map(
    (chart) => new Map(chart.points.map((point) => [point.checkedAt, point]))
  );
  const data = results.map((result) => ({
    checkedAt: result.checkedAt,
    ...Object.fromEntries(
      charts.flatMap((_, index) => {
        const point = pointsBySeries[index]?.get(result.checkedAt);
        return [
          [`metric${index}`, point?.value ?? null],
          [`warning${index}`, point?.warningValue ?? null],
          [`critical${index}`, point?.criticalValue ?? null],
        ];
      })
    ),
  }));
  const thresholds = combinedThresholds(charts);
  const alarms = alarmPoints(results, charts, pointsBySeries);

  if (!charts.length) return null;

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
      <LineChart data={data} margin={{ top: 18, right: 0, left: 0, bottom: 0 }}>
        <CartesianGrid
          yAxisId={axes[0]?.scale}
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
          minTickGap={35}
        />
        {axes.map((axis, axisIndex) => (
          <YAxis
            key={axis.scale}
            yAxisId={axis.scale}
            orientation={axisIndex === 0 ? "left" : "right"}
            tick={{
              fill:
                axes.length === 1
                  ? chartColors.muted
                  : axis.index === 0
                    ? chartColors.lavender
                    : chartColors.coral,
              fontSize: 10,
            }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: number) => formatCheckMetric(axis.metricKey, value)}
            domain={axis.scale === "percent" ? [0, 100] : ["auto", "auto"]}
            width={56}
          />
        ))}
        <Tooltip
          labelFormatter={formatChartDate}
          formatter={(value, name) => {
            const chart = charts.find((item) => item.series.label === name);
            return [
              typeof value === "number" && chart ? formatCheckMetric(chart.series.key, value) : "—",
              name,
            ];
          }}
          contentStyle={chartTooltipStyle}
        />
        {charts.map((chart) => (
          <ThresholdRanges
            key={`range-${chart.series.key}`}
            thresholds={chart.thresholds}
            yAxisId={chart.scale}
            showAreas={charts.filter((item) => item.scale === chart.scale).length === 1}
          />
        ))}
        {thresholds.map((item) => (
          <ThresholdLine
            key={`${item.scale}-${item.threshold.comparison}-${item.threshold.value}`}
            threshold={item.threshold}
            yAxisId={item.scale}
            label={`${item.appliesToWholeScale ? "" : `${item.labels.join(", ")} `}${thresholdName(item.threshold)} ${formatCheckMetric(item.metricKey, item.threshold.value)}`}
          />
        ))}
        {charts.map((chart, index) => (
          <Line
            key={chart.series.key}
            type="linear"
            dataKey={`metric${index}`}
            name={chart.series.label}
            yAxisId={chart.scale}
            stroke={index === 0 ? chartColors.lavender : chartColors.coral}
            strokeWidth={2.5}
            dot={false}
            connectNulls={false}
          />
        ))}
        {charts.flatMap((chart, index) => [
          <Line
            key={`warning-line-${chart.series.key}`}
            type="linear"
            dataKey={`warning${index}`}
            yAxisId={chart.scale}
            stroke={chartColors.warning}
            strokeWidth={3}
            dot={false}
            activeDot={false}
            connectNulls={false}
            tooltipType="none"
          />,
          <Line
            key={`critical-line-${chart.series.key}`}
            type="linear"
            dataKey={`critical${index}`}
            yAxisId={chart.scale}
            stroke={chartColors.danger}
            strokeWidth={3}
            dot={false}
            activeDot={false}
            connectNulls={false}
            tooltipType="none"
          />,
        ])}
        {charts.map((chart) => (
          <ThresholdBoundaryDots
            key={`boundary-${chart.series.key}`}
            metricKey={chart.series.key}
            points={chart.points}
            yAxisId={chart.scale}
          />
        ))}
        {alarms.map((alarm) => (
          <AlarmMarker key={alarm.incidentId} point={alarm} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function createSeriesCharts(check: CheckSummary, results: CheckResult[]): SeriesChart[] {
  return prioritizeCheckHistorySeries(check, createCheckHistorySeries(check.type, results)).map(
    (series) => {
      const configuredThresholds = checkMetricThresholds(check, series.key);
      const points = createCheckMetricChartPoints(series.points, configuredThresholds);
      return {
        series,
        thresholds: points.some(
          (point) => point.warningValue !== null || point.criticalValue !== null
        )
          ? configuredThresholds
          : [],
        points,
        scale: checkMetricScale(series.key),
      };
    }
  );
}

function combinedThresholds(charts: SeriesChart[]): CombinedThreshold[] {
  const groups = new Map<
    string,
    Omit<CombinedThreshold, "appliesToWholeScale"> & { metricKeys: string[] }
  >();
  for (const chart of charts) {
    for (const threshold of visibleThresholds(chart.thresholds)) {
      const key = `${chart.scale}:${threshold.comparison}:${threshold.value}`;
      const current = groups.get(key);
      if (current) {
        current.labels.push(chart.series.label);
        current.metricKeys.push(chart.series.key);
        if (threshold.severity === "critical") current.threshold = threshold;
      } else {
        groups.set(key, {
          threshold,
          metricKey: chart.series.key,
          metricKeys: [chart.series.key],
          labels: [chart.series.label],
          scale: chart.scale,
        });
      }
    }
  }
  return [...groups.values()].map(({ metricKeys, ...group }) => ({
    ...group,
    appliesToWholeScale:
      metricKeys.length === charts.filter((chart) => chart.scale === group.scale).length,
  }));
}

function alarmPoints(
  results: CheckResult[],
  charts: SeriesChart[],
  pointsBySeries: Array<Map<string, CheckMetricChartPoint>>
): ChartAlarmPoint[] {
  return results.flatMap((result) => {
    if (!result.triggeredIncidentId) return [];
    const candidates = charts.flatMap((chart, index) => {
      const point = pointsBySeries[index]?.get(result.checkedAt);
      return point ? [{ chart, point }] : [];
    });
    const selected = candidates.find(({ point }) => point.criticalValue !== null) ?? candidates[0];
    return selected
      ? [
          {
            checkedAt: selected.point.checkedAt,
            value: selected.point.value,
            scale: selected.chart.scale,
            incidentId: result.triggeredIncidentId,
          },
        ]
      : [];
  });
}
