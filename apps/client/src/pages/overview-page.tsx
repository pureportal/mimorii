import type { OverviewAnalytics, ResourceSummary } from "@mimorii/contracts";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, Clock3, Gauge, Plus, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ErrorState, LoadingState, StateArtwork } from "../components/page-state";
import { ResourceImage } from "../components/resource-image";
import { StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { api } from "../lib/api";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { chartColors, chartTooltipStyle } from "../lib/chart-theme";
import { formatLatency, formatPercent } from "../lib/format";
import { resourceOptionLabels } from "../lib/resource-option-labels";

export function OverviewPage() {
  const { activeTeam } = useAuth();
  const teamId = activeTeam!.id;
  const overview = useQuery({
    queryKey: ["overview", teamId],
    queryFn: () => api<OverviewAnalytics>(`/teams/${teamId}/analytics/overview`),
    refetchInterval: 30_000,
  });
  const resources = useQuery({
    queryKey: ["resources", teamId],
    queryFn: () => api<ResourceSummary[]>(`/teams/${teamId}/resources`),
    refetchInterval: 30_000,
  });

  if (overview.isLoading || resources.isLoading) return <LoadingState />;
  if (overview.isError || resources.isError || !overview.data)
    return (
      <ErrorState
        retry={() => {
          void overview.refetch();
          void resources.refetch();
        }}
      />
    );
  const data = overview.data;
  const resourceNames = resourceOptionLabels(resources.data ?? []);
  const attentionNeeded = data.warning + data.critical + data.down;
  const allGood = attentionNeeded === 0 && data.pending === 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      <section
        data-guide-page="overview-status"
        className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"
      >
        <div>
          <div className="flex items-center gap-2.5">
            <span
              className={`size-3 rounded-full ${allGood ? "bg-success shadow-[0_0_0_6px_rgba(53,186,134,.12)]" : "bg-danger shadow-[0_0_0_6px_rgba(217,74,101,.12)]"}`}
            />
            <h2 className="font-display text-xl font-black tracking-tight sm:text-3xl">
              {allGood
                ? "All systems operational"
                : data.openIncidents
                  ? `${data.openIncidents} active incident${data.openIncidents === 1 ? "" : "s"}`
                  : attentionNeeded
                    ? `${attentionNeeded} monitor${attentionNeeded === 1 ? " needs" : "s need"} attention`
                    : `${data.pending} monitor${data.pending === 1 ? " is" : "s are"} awaiting results`}
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted">{activeTeam?.name}</p>
        </div>
        <Button asChild variant="coral" size="sm" className="self-start sm:self-auto">
          <Link to={appRoutes.newResource}>
            <Plus /> Add resource
          </Link>
        </Button>
      </section>

      <section data-guide-page="overview-metrics" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric
          icon={Gauge}
          label="Uptime · 24h"
          value={formatPercent(data.uptime24h)}
          tone="mint"
        />
        <Metric
          icon={Clock3}
          label="Average latency"
          value={formatLatency(data.averageLatencyMs)}
          tone="lavender"
        />
        <Metric
          icon={Activity}
          label="Passing monitors"
          value={`${data.passing} / ${data.checks + data.heartbeats}`}
          tone="coral"
        />
        <Metric
          icon={TriangleAlert}
          label="Open incidents"
          value={String(data.openIncidents)}
          tone="warning"
        />
      </section>

      {data.activeMaintenance || data.breachedObjectives ? (
        <section className="flex flex-wrap gap-2">
          {data.activeMaintenance ? (
            <Button asChild variant="outline" size="sm">
              <Link to={appRoutes.maintenance}>{data.activeMaintenance} active maintenance</Link>
            </Button>
          ) : null}
          {data.breachedObjectives ? (
            <Button asChild variant="danger" size="sm">
              <Link to={appRoutes.serviceGoals}>{data.breachedObjectives} breached objectives</Link>
            </Button>
          ) : null}
        </section>
      ) : null}

      <section data-guide-page="overview-details" className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Card className="min-w-0">
          <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-3">
            <h3 className="font-display font-bold">Response time</h3>
            <Button asChild variant="ghost" size="sm">
              <Link to={appRoutes.reports}>
                Reports <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="h-56 px-2 pb-3 pt-0 sm:h-64 sm:px-4">
            {data.latencyTimeline.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data.latencyTimeline}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="latency" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor={chartColors.lavender} stopOpacity={0.38} />
                      <stop offset="1" stopColor={chartColors.lavender} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={chartColors.grid} strokeDasharray="4 6" vertical={false} />
                  <XAxis
                    dataKey="bucket"
                    tickFormatter={(value) =>
                      new Date(value).toLocaleTimeString([], { hour: "2-digit" })
                    }
                    tick={{ fill: chartColors.muted, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={30}
                  />
                  <YAxis
                    tick={{ fill: chartColors.muted, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    unit="ms"
                    width={48}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelFormatter={(value) =>
                      typeof value === "string" || typeof value === "number"
                        ? new Date(value).toLocaleString()
                        : ""
                    }
                    formatter={(value) => [
                      `${typeof value === "string" || typeof value === "number" ? value : "—"} ms`,
                      "Latency",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="latencyMs"
                    stroke={chartColors.lavender}
                    strokeWidth={2.5}
                    fill="url(#latency)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-1 text-sm text-muted">
                <StateArtwork illustration="analysis" />
                <span>Waiting for check results</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-3">
            <h3 className="font-display font-bold">Current state</h3>
            <Button asChild variant="ghost" size="sm">
              <Link to={appRoutes.resources}>
                View all <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-1 px-3 pb-3 pt-0 sm:p-5 sm:pt-2">
            {resources.data?.slice(0, 7).map((resource) => (
              <Link
                key={resource.id}
                to={appRoutes.resource(resource.id)}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-ink/4"
              >
                <ResourceImage
                  resource={resource}
                  className="size-9 bg-ink/5 text-muted"
                  iconClassName="size-4"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{resourceNames.get(resource.id)}</p>
                  <p className="truncate text-xs capitalize text-muted">{resource.kind}</p>
                </div>
                <StatusBadge status={resource.status} />
              </Link>
            ))}
            {!resources.data?.length ? (
              <div className="flex h-48 flex-col items-center justify-center gap-1 text-sm text-muted">
                <StateArtwork illustration="empty" className="h-20 w-24" />
                <span>No resources yet</span>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  tone: "mint" | "lavender" | "coral" | "warning";
}) {
  const colors = {
    mint: "bg-mint/20 text-success-strong",
    lavender: "bg-lavender-soft text-violet-strong",
    coral: "bg-coral/14 text-danger",
    warning: "bg-warning/16 text-warning-strong",
  };
  return (
    <Card className="min-w-0 p-4">
      <div className="flex items-center gap-3">
        <span className={`grid size-8 place-items-center rounded-lg ${colors[tone]}`}>
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 text-xs font-medium leading-4 text-muted">{label}</span>
      </div>
      <p className="mt-4 font-display text-[clamp(1.45rem,7vw,2rem)] font-black leading-none tracking-tight">
        {value}
      </p>
    </Card>
  );
}
