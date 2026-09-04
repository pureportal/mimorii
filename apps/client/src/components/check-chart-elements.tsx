import { ReferenceArea, ReferenceDot, ReferenceLine } from "recharts";
import type { CheckMetricChartPoint, CheckMetricThreshold } from "../lib/check-chart";
import type { CheckMetricScale } from "../lib/check-health";
import { chartColors } from "../lib/chart-theme";

export interface ChartAlarmPoint {
  checkedAt: string;
  value: number;
  scale: CheckMetricScale;
  incidentId: string;
}

export function ThresholdRanges({
  thresholds,
  yAxisId,
  showAreas,
}: {
  thresholds: CheckMetricThreshold[];
  yAxisId?: CheckMetricScale;
  showAreas: boolean;
}) {
  if (!showAreas) return null;
  const visible = visibleThresholds(thresholds);
  const warning = visible.find((threshold) => threshold.severity === "warning");
  const critical = visible.find((threshold) => threshold.severity === "critical");
  const higherIsWorse = (critical ?? warning)?.comparison.startsWith("greater") ?? true;

  return (
    <>
      {warning ? (
        <ReferenceArea
          yAxisId={yAxisId}
          {...(higherIsWorse
            ? critical
              ? { y1: warning.value, y2: critical.value }
              : { y2: warning.value }
            : critical
              ? { y1: critical.value, y2: warning.value }
              : { y1: warning.value })}
          fill={chartColors.warning}
          fillOpacity={0.09}
          stroke="none"
          ifOverflow="extendDomain"
          zIndex={50}
        />
      ) : null}
      {critical ? (
        <ReferenceArea
          yAxisId={yAxisId}
          {...(higherIsWorse ? { y2: critical.value } : { y1: critical.value })}
          fill={chartColors.danger}
          fillOpacity={0.08}
          stroke="none"
          ifOverflow="extendDomain"
          zIndex={50}
        />
      ) : null}
    </>
  );
}

export function ThresholdLine({
  threshold,
  yAxisId,
  label,
}: {
  threshold: CheckMetricThreshold;
  yAxisId?: CheckMetricScale;
  label: string;
}) {
  const color = threshold.severity === "critical" ? chartColors.danger : chartColors.warningStrong;
  return (
    <ReferenceLine
      y={threshold.value}
      yAxisId={yAxisId}
      stroke={color}
      strokeOpacity={0.85}
      strokeDasharray="3 4"
      ifOverflow="extendDomain"
      label={{ value: label, position: "insideTopRight", fill: color, fontSize: 9 }}
      zIndex={200}
    />
  );
}

export function ThresholdBoundaryDots({
  metricKey,
  points,
  yAxisId,
}: {
  metricKey: string;
  points: CheckMetricChartPoint[];
  yAxisId: CheckMetricScale;
}) {
  return points.flatMap((point) =>
    (["warning", "critical"] as const).flatMap((severity) => {
      if (!point[`${severity}Boundary`]) return [];
      return [
        <ReferenceDot
          key={`${metricKey}-${severity}-${point.checkedAt}`}
          x={point.checkedAt}
          y={point.value}
          yAxisId={yAxisId}
          r={2.75}
          fill={severity === "critical" ? chartColors.danger : chartColors.warning}
          stroke={chartColors.surface}
          strokeWidth={1.25}
          zIndex={500}
        />,
      ];
    })
  );
}

export function AlarmMarker({ point }: { point: ChartAlarmPoint }) {
  const label = `Incident alarm at ${new Date(point.checkedAt).toLocaleString()}`;
  return (
    <ReferenceDot
      x={point.checkedAt}
      y={point.value}
      yAxisId={point.scale}
      r={7}
      fill={chartColors.danger}
      stroke={chartColors.surface}
      strokeWidth={2}
      label={{ value: "!", position: "center", fill: chartColors.surface, fontSize: 9 }}
      role="img"
      aria-label={label}
      name={label}
      zIndex={600}
    />
  );
}

export function visibleThresholds(thresholds: CheckMetricThreshold[]): CheckMetricThreshold[] {
  const visible = new Map<string, CheckMetricThreshold>();
  for (const threshold of thresholds) {
    const key = `${threshold.comparison}:${threshold.value}`;
    const current = visible.get(key);
    if (!current || threshold.severity === "critical") visible.set(key, threshold);
  }
  return [...visible.values()];
}

export function thresholdName(threshold: CheckMetricThreshold): "Critical" | "Warning" {
  return threshold.severity === "critical" ? "Critical" : "Warning";
}

export function formatChartTime(value: string | number): string {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatChartDate(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? new Date(value).toLocaleString()
    : "";
}
