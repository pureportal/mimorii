import { logLevels, type LogLevel, type LogVolume } from "@mimorii/contracts";
import { memo, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { chartColors, chartTooltipStyle } from "../../lib/chart-theme";
import { cn } from "../../lib/cn";
import { logLevelPresentation } from "../../lib/log-display";

interface VolumePoint extends Partial<Record<LogLevel, number>> {
  key: string;
  total: number;
}

const axisTick = { fill: chartColors.muted, fontSize: 11 };
const dayFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const compactFormat = new Intl.NumberFormat(undefined, { notation: "compact" });

export const LogVolumeChart = memo(function LogVolumeChart({
  volume,
  selectedLevels,
  onToggleLevel,
  onZoom,
}: {
  volume: LogVolume;
  selectedLevels: LogLevel[];
  onToggleLevel: (level: LogLevel) => void;
  onZoom: (from: Date, to: Date) => void;
}) {
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const points = useMemo<VolumePoint[]>(
    () =>
      volume.buckets.map((bucket) => ({
        key: bucket.start,
        total: bucket.total,
        ...bucket.levels,
      })),
    [volume]
  );
  const presentLevels = logLevels.filter((level) => volume.levels[level]);
  const legendLevels = logLevels.filter(
    (level) => volume.levels[level] || selectedLevels.includes(level)
  );
  const multiDay = Date.parse(volume.to) - Date.parse(volume.from) > 86_400_000;

  function finishSelection() {
    if (!selection) return;
    const first = Math.min(selection.start, selection.end);
    const last = Math.max(selection.start, selection.end);
    setSelection(null);
    const start = points[first];
    const end = points[last];
    if (!start || !end) return;
    onZoom(new Date(start.key), new Date(Date.parse(end.key) + volume.stepSeconds * 1_000));
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Levels">
        {legendLevels.map((level) => {
          const active = selectedLevels.includes(level);
          const dimmed = selectedLevels.length > 0 && !active;
          return (
            <button
              key={level}
              type="button"
              aria-pressed={active}
              onClick={() => onToggleLevel(level)}
              className={cn(
                "inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-xs font-semibold transition hover:bg-ink/5",
                active ? "border-lavender bg-lavender-soft text-ink" : "border-line text-muted",
                dimmed && "opacity-60"
              )}
            >
              <span
                aria-hidden="true"
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: logLevelPresentation[level].color }}
              />
              {logLevelPresentation[level].label}
              <span className="font-mono text-[11px] font-medium text-muted">
                {(volume.levels[level] ?? 0).toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>
      <div className="h-36 select-none" aria-label="Log volume" role="img">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={points}
            barCategoryGap="12%"
            margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
            onMouseDown={(state) => {
              const index = Number(state.activeTooltipIndex);
              if (Number.isInteger(index)) setSelection({ start: index, end: index });
            }}
            onMouseMove={(state) => {
              const index = Number(state.activeTooltipIndex);
              if (selection && Number.isInteger(index)) setSelection({ ...selection, end: index });
            }}
            onMouseUp={finishSelection}
            onMouseLeave={() => setSelection(null)}
            style={{ cursor: "crosshair" }}
          >
            <CartesianGrid stroke={chartColors.grid} strokeDasharray="4 6" vertical={false} />
            <XAxis
              dataKey="key"
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              minTickGap={28}
              tickFormatter={(value: string) => formatTick(value, multiDay)}
            />
            <YAxis
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              width={44}
              allowDecimals={false}
              tickFormatter={(value: number) => compactNumber(value)}
            />
            <Tooltip
              cursor={{ fill: "var(--color-ink)", fillOpacity: 0.05 }}
              content={<VolumeTooltip points={points} stepSeconds={volume.stepSeconds} />}
            />
            {presentLevels.map((level) => (
              <Bar
                key={level}
                dataKey={level}
                stackId="volume"
                fill={logLevelPresentation[level].color}
                stroke="var(--color-surface)"
                strokeWidth={1}
                isAnimationActive={false}
              />
            ))}
            {selection && selection.start !== selection.end ? (
              <ReferenceArea
                x1={points[Math.min(selection.start, selection.end)]?.key}
                x2={points[Math.max(selection.start, selection.end)]?.key}
                fill="var(--color-lavender)"
                fillOpacity={0.16}
                stroke="var(--color-lavender)"
                strokeOpacity={0.5}
              />
            ) : null}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

function VolumeTooltip({
  active,
  activeIndex,
  points,
  stepSeconds,
}: Partial<Pick<TooltipContentProps, "active" | "activeIndex">> & {
  points: VolumePoint[];
  stepSeconds: number;
}) {
  const point = active ? points[Number(activeIndex)] : undefined;
  if (!point) return null;
  const label = point.key;
  const end = new Date(Date.parse(label) + stepSeconds * 1_000);
  return (
    <div style={chartTooltipStyle} className="min-w-44 px-3 py-2.5 text-xs">
      <p className="font-semibold text-ink">
        {new Date(label).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })}
      </p>
      <p className="text-muted">to {end.toLocaleTimeString(undefined, { timeStyle: "medium" })}</p>
      <div className="mt-2 grid gap-1">
        {logLevels
          .filter((level) => point[level])
          .map((level) => (
            <div key={level} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-muted">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-sm"
                  style={{ backgroundColor: logLevelPresentation[level].color }}
                />
                {logLevelPresentation[level].label}
              </span>
              <span className="font-mono text-ink">{point[level]!.toLocaleString()}</span>
            </div>
          ))}
        <div className="mt-1 flex justify-between gap-4 border-t border-line pt-1.5 font-semibold">
          <span>Total</span>
          <span className="font-mono">{point.total.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

function formatTick(value: string, multiDay: boolean): string {
  const date = new Date(value);
  return multiDay
    ? `${dayFormat.format(date)} ${timeFormat.format(date)}`
    : timeFormat.format(date);
}

function compactNumber(value: number): string {
  return compactFormat.format(value);
}
