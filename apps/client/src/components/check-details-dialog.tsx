import type { CheckResult, CheckSummary } from "@mimorii/contracts";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  checkPassingLabel,
  checkMetricLabel,
  createCheckHistorySeries,
  formatCheckMetric,
  prioritizeCheckHistorySeries,
} from "../lib/check-health";
import { formatPercent, formatRelative } from "../lib/format";
import { CheckHealthSummary } from "./check-health-summary";
import { CheckMetricHistoryCard } from "./check-metric-history-card";
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
  const historySeries = check
    ? prioritizeCheckHistorySeries(check, createCheckHistorySeries(check.type, results))
    : [];
  const latestMetrics = latestResult?.metrics ?? check?.latestMetrics ?? {};
  const currentCheck = check
    ? {
        type: check.type,
        config: check.config,
        timeoutMs: check.timeoutMs,
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
              <Detail label={`${checkPassingLabel(check.type)} · 24h`}>
                {formatPercent(check.passing24h)}
              </Detail>
              <Detail label="Last run">{formatRelative(check.lastCheckedAt)}</Detail>
            </div>

            <section>
              <h3 className="mb-3 text-sm font-semibold">Current metrics</h3>
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
                    <CheckMetricHistoryCard key={series.key} check={check} series={series} />
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
