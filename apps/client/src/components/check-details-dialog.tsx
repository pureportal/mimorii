import type { CheckResult, CheckSummary } from "@mimorii/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../lib/api";
import {
  checkMetricLabel,
  createCheckHistorySeries,
  formatCheckMetric,
  type CheckHistorySeries,
} from "../lib/check-health";
import { chartColors, chartTooltipStyle } from "../lib/chart-theme";
import { formatPercent, formatRelative } from "../lib/format";
import { CheckHealthSummary } from "./check-health-summary";
import { StatusBadge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";

export function CheckDetailsDialog({
  open,
  onOpenChange,
  teamId,
  check,
  resourceName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  check: CheckSummary | null;
  resourceName?: string;
}) {
  const history = useQuery({
    queryKey: ["check-details", teamId, check?.id],
    queryFn: () => api<CheckResult[]>(`/teams/${teamId}/checks/${check!.id}/history?limit=500`),
    enabled: open && Boolean(check),
    refetchInterval: open ? 30_000 : false,
  });
  const results = (history.data ?? []).toReversed();
  const latestResult = history.data?.[0];
  const historySeries = check ? createCheckHistorySeries(check.type, results) : [];
  const latestMetrics = latestResult?.metrics ?? check?.latestMetrics ?? {};
  const currentCheck = check
    ? {
        type: check.type,
        lastLatencyMs: latestResult?.latencyMs ?? check.lastLatencyMs,
        latestMetrics,
      }
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader title={check?.name ?? "Check details"}>
          {check ? [check.type.toUpperCase(), resourceName].filter(Boolean).join(" · ") : undefined}
        </DialogHeader>

        {check ? (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <Detail label="State">
                <StatusBadge status={check.status} />
              </Detail>
              <Detail label="Uptime · 24h">{formatPercent(check.uptime24h)}</Detail>
              <Detail label="Last run">{formatRelative(check.lastCheckedAt)}</Detail>
            </div>

            <section>
              <h3 className="mb-3 text-sm font-semibold">Current health</h3>
              <div className="rounded-2xl border border-line p-4">
                <CheckHealthSummary check={currentCheck!} className="max-w-xl" />
              </div>
              {latestResult?.message ? (
                <p className="mt-2 text-sm text-muted">{latestResult.message}</p>
              ) : null}
            </section>

            {history.isLoading ? (
              <div className="grid h-52 place-items-center text-sm text-muted">
                Loading history…
              </div>
            ) : history.isError ? (
              <div className="flex h-40 flex-col items-center justify-center gap-3 text-sm text-muted">
                <span>Check history could not be loaded.</span>
                <Button variant="outline" size="sm" onClick={() => void history.refetch()}>
                  Try again
                </Button>
              </div>
            ) : historySeries.length ? (
              <section>
                <h3 className="mb-3 text-sm font-semibold">History</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {historySeries.map((series) => (
                    <MetricChart key={series.key} series={series} />
                  ))}
                </div>
              </section>
            ) : (
              <div className="grid h-28 place-items-center text-sm text-muted">
                No metric history yet
              </div>
            )}

            {Object.keys(latestMetrics).length ? (
              <section>
                <h3 className="mb-3 text-sm font-semibold">Latest metrics</h3>
                <dl className="grid gap-x-6 gap-y-3 rounded-2xl border border-line p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(latestMetrics)
                    .toSorted(([left], [right]) =>
                      checkMetricLabel(left).localeCompare(checkMetricLabel(right))
                    )
                    .map(([metric, value]) => (
                      <div key={metric} className="min-w-0">
                        <dt className="text-xs text-muted">{checkMetricLabel(metric)}</dt>
                        <dd className="mt-0.5 truncate text-sm font-medium" title={String(value)}>
                          {formatCheckMetric(metric, value)}
                        </dd>
                      </div>
                    ))}
                </dl>
              </section>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line p-4">
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-2 font-display text-lg font-bold">{children}</div>
    </div>
  );
}

function MetricChart({ series }: { series: CheckHistorySeries }) {
  const latest = series.points.at(-1)?.value ?? null;
  const percent = series.key.toLowerCase().includes("percent");
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
          <LineChart data={series.points} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid stroke={chartColors.grid} strokeDasharray="4 6" vertical={false} />
            <XAxis
              dataKey="checkedAt"
              tickFormatter={(value) =>
                new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              }
              tick={{ fill: chartColors.muted, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              minTickGap={30}
            />
            <YAxis
              tick={{ fill: chartColors.muted, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              domain={percent ? [0, 100] : ["auto", "auto"]}
              unit={percent ? "%" : undefined}
            />
            <Tooltip
              labelFormatter={(value) =>
                typeof value === "string" || typeof value === "number"
                  ? new Date(value).toLocaleString()
                  : ""
              }
              formatter={(value) => [
                typeof value === "number" ? formatCheckMetric(series.key, value) : "—",
                series.label,
              ]}
              contentStyle={chartTooltipStyle}
            />
            <Line
              type="monotone"
              dataKey="value"
              name={series.label}
              stroke={chartColors.lavender}
              strokeWidth={2.25}
              dot={series.points.length === 1}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
