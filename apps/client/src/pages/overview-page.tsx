import type {
  CheckSummary,
  IncidentSummary,
  OverviewAnalytics,
  ResourceSummary,
} from "@mimorii/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  CalendarClock,
  Clock3,
  Gauge,
  Plus,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ErrorState, LoadingState, StateArtwork } from "../components/page-state";
import { ResourceImage } from "../components/resource-image";
import { Sparkline } from "../components/sparkline";
import { AvailabilityBars, LatencyArea, type TimelinePoint } from "../components/timeline-charts";
import { StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { api } from "../lib/api";
import { StatusReason, resourceReason } from "../components/status-reason";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { expiringChecks } from "../lib/expiring-checks";
import { monitorStatusPriority } from "../lib/monitor-status";
import { formatDuration, formatLatency, formatPercent } from "../lib/format";
import { resourceKindLabels, resourceOptionLabels } from "../lib/resource-option-labels";

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
  const activeIncidents = useQuery({
    queryKey: ["incidents", teamId, "active"],
    queryFn: () => api<IncidentSummary[]>(`/teams/${teamId}/incidents?status=active&limit=5`),
    refetchInterval: 30_000,
  });
  const checks = useQuery({
    queryKey: ["checks", teamId],
    queryFn: () => api<CheckSummary[]>(`/teams/${teamId}/checks`),
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
  const timeline = lastDayTimeline(data, Date.now());
  const attentionFirst = (resources.data ?? []).toSorted(
    (left, right) => monitorStatusPriority[left.status] - monitorStatusPriority[right.status]
  );
  const monitors = data.checks + data.heartbeats;
  const expiring = expiringChecks(checks.data ?? []).slice(0, 6);
  const incidents = activeIncidents.data ?? [];
  const uptimeTrend = timeline.map((point) => {
    const total = point.up + point.degraded + point.down;
    return total ? ((point.up + point.degraded) / total) * 100 : null;
  });
  const uptimeFloor = Math.min(
    99,
    ...uptimeTrend.filter((value): value is number => value !== null)
  );

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
          to={appRoutes.reports}
        >
          <Sparkline values={uptimeTrend} domain={[uptimeFloor, 100]} />
        </Metric>
        <Metric
          icon={Clock3}
          label="Average latency"
          value={formatLatency(data.averageLatencyMs)}
          tone="lavender"
          to={appRoutes.reports}
        >
          <Sparkline values={timeline.map((point) => point.latencyMs)} />
        </Metric>
        <Metric
          icon={Activity}
          label="Passing monitors"
          value={`${data.passing} / ${monitors}`}
          tone="coral"
          to={appRoutes.checks}
        >
          {monitors ? (
            <div
              role="meter"
              aria-label="Passing monitors"
              aria-valuemin={0}
              aria-valuemax={monitors}
              aria-valuenow={data.passing}
              className="h-2 overflow-hidden rounded-full bg-success/15"
            >
              <div
                className="h-full rounded-full bg-success"
                style={{ width: `${(data.passing / monitors) * 100}%` }}
              />
            </div>
          ) : null}
        </Metric>
        <Metric
          icon={TriangleAlert}
          label="Open incidents"
          value={String(data.openIncidents)}
          tone="warning"
          to={appRoutes.incidents}
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
        <Card className="flex min-w-0 flex-col">
          <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-3">
            <h3 className="font-display font-bold">Last 24 hours</h3>
            <Button asChild variant="ghost" size="sm">
              <Link to={appRoutes.reports}>
                Reports <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4 px-2 pb-3 pt-0 sm:px-4">
            {data.statusTimeline.length || data.latencyTimeline.length ? (
              <>
                <div>
                  <p className="mb-1.5 px-2 text-xs font-medium text-muted">Availability</p>
                  <div className="h-12 pl-12">
                    <AvailabilityBars points={timeline} showAxes={false} />
                  </div>
                </div>
                {data.latencyTimeline.length ? (
                  <div className="flex flex-1 flex-col">
                    <p className="mb-1.5 px-2 text-xs font-medium text-muted">Response time</p>
                    <div className="min-h-44 flex-1">
                      <LatencyArea points={timeline} />
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex h-56 flex-col items-center justify-center gap-1 text-sm text-muted sm:h-64">
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
            {attentionFirst.slice(0, 7).map((resource) => (
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
                  {resourceReason(resource) ? (
                    <StatusReason reason={resourceReason(resource)} status={resource.status} />
                  ) : (
                    <p className="truncate text-xs text-muted">
                      {resourceKindLabels[resource.kind]}
                    </p>
                  )}
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

      {incidents.length || expiring.length ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {incidents.length ? (
            <Card className="min-w-0">
              <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-3">
                <h3 className="font-display font-bold">Active incidents</h3>
                <Button asChild variant="ghost" size="sm">
                  <Link to={appRoutes.incidents}>
                    View all <ArrowRight />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-1 px-3 pb-3 pt-0 sm:p-5 sm:pt-2">
                {incidents.map((incident) => (
                  <Link
                    key={incident.id}
                    to={appRoutes.incidents}
                    className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-ink/4"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-danger/10 text-danger">
                      <TriangleAlert className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{incident.title}</p>
                      <p className="truncate text-xs text-muted">
                        {[
                          incident.resources
                            .map((resource) => resourceNames.get(resource.id) ?? resource.name)
                            .join(", "),
                          formatDuration(incident.durationSeconds),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <StatusBadge status={incident.status} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}
          {expiring.length ? (
            <Card className="min-w-0">
              <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-3">
                <h3 className="font-display font-bold">Expiring soon</h3>
              </CardHeader>
              <CardContent className="space-y-1 px-3 pb-3 pt-0 sm:p-5 sm:pt-2">
                {expiring.map(({ check, subject, daysRemaining }) => {
                  const Icon = subject === "Domain" ? CalendarClock : ShieldCheck;
                  return (
                    <Link
                      key={check.id}
                      to={appRoutes.check(check.id)}
                      className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-ink/4"
                    >
                      <span
                        className={`grid size-9 shrink-0 place-items-center rounded-xl ${daysRemaining < 0 ? "bg-danger/10 text-danger" : "bg-warning/16 text-warning-strong"}`}
                      >
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{check.name}</p>
                        <p className="truncate text-xs text-muted">
                          {subject} · {resourceNames.get(check.resourceId)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold">
                        {daysRemaining < 0
                          ? "Expired"
                          : daysRemaining === 0
                            ? "Today"
                            : `${daysRemaining} d`}
                      </span>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

const HOUR_MS = 3_600_000;

function lastDayTimeline(data: OverviewAnalytics, now: number): TimelinePoint[] {
  const currentHour = Math.floor(now / HOUR_MS) * HOUR_MS;
  const statuses = new Map(data.statusTimeline.map((entry) => [entry.bucket, entry]));
  const latencies = new Map(data.latencyTimeline.map((entry) => [entry.bucket, entry.latencyMs]));
  return Array.from({ length: 24 }, (_, index) => {
    const start = new Date(currentHour - (23 - index) * HOUR_MS);
    const key = start.toISOString();
    const status = statuses.get(key);
    return {
      key,
      label: start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      detail: start.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }),
      up: status?.up ?? 0,
      degraded: status?.degraded ?? 0,
      down: status?.down ?? 0,
      latencyMs: latencies.get(key) ?? null,
    };
  });
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
  to,
  children,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  tone: "mint" | "lavender" | "coral" | "warning";
  to: string;
  children?: ReactNode;
}) {
  const colors = {
    mint: "bg-mint/20 text-success-strong",
    lavender: "bg-lavender-soft text-violet-strong",
    coral: "bg-coral/14 text-danger",
    warning: "bg-warning/16 text-warning-strong",
  };
  return (
    <Link
      to={to}
      className="block min-w-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-coral-strong"
    >
      <Card className="flex h-full min-w-0 flex-col p-4 transition hover:border-lavender">
        <div className="flex items-center gap-3">
          <span className={`grid size-8 place-items-center rounded-lg ${colors[tone]}`}>
            <Icon className="size-4" />
          </span>
          <span className="min-w-0 text-xs font-medium leading-4 text-muted">{label}</span>
        </div>
        <p className="mt-4 font-display text-[clamp(1.45rem,7vw,2rem)] font-black leading-none tracking-tight">
          {value}
        </p>
        {children ? <div className="mt-auto pt-3">{children}</div> : null}
      </Card>
    </Link>
  );
}
