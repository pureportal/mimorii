import type {
  AgentSummary,
  AgentKind,
  CheckResult,
  CheckSummary,
  HeartbeatMonitorSummary,
  HostSnapshot,
  ResourceAlertMetric,
  ResourceAlertOperator,
  ResourceAlertRuleSummary,
  ResourceMetricSeries,
  ResourceSummary,
  TechnologyObservation,
} from "@mimorii/contracts";
import { resourceAlertOperators } from "@mimorii/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  Battery,
  Bell,
  Cpu,
  Database,
  Eye,
  Gauge,
  ImageIcon,
  MemoryStick,
  Network,
  Pencil,
  Radio,
  Trash2,
  Container,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckDetailsDialog } from "../components/check-details-dialog";
import { CheckHealthSummary } from "../components/check-health-summary";
import { ErrorState, LoadingState, StateArtwork } from "../components/page-state";
import { ResourceImage } from "../components/resource-image";
import { ResourceImageDialog } from "../components/resource-image-dialog";
import { StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { ConfirmationDialog } from "../components/ui/confirmation-dialog";
import { Dialog, DialogContent, DialogHeader } from "../components/ui/dialog";
import { Field, FieldError, FieldLabel } from "../components/ui/field";
import { Input, Select, Textarea } from "../components/ui/input";
import { api, jsonBody } from "../lib/api";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { chartColors, chartTooltipStyle } from "../lib/chart-theme";
import {
  createCheckHistorySeries as createTypedCheckHistorySeries,
  formatCheckMetric as formatTypedCheckMetric,
} from "../lib/check-health";
import { formatBytes, formatCount, formatPercent, formatRelative } from "../lib/format";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function ResourceDetailPage() {
  const { id = "" } = useParams();
  const { activeTeam } = useAuth();
  const teamId = activeTeam!.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null);
  const [detailsCheck, setDetailsCheck] = useState<CheckSummary | null>(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<ResourceAlertRuleSummary | null>(null);
  const resource = useQuery({
    queryKey: ["resource", teamId, id],
    queryFn: () => api<ResourceSummary>(`/teams/${teamId}/resources/${id}`),
    refetchInterval: 30_000,
  });
  const checks = useQuery({
    queryKey: ["checks", teamId, id],
    queryFn: () => api<CheckSummary[]>(`/teams/${teamId}/checks?resourceId=${id}`),
    refetchInterval: 30_000,
  });
  const heartbeats = useQuery({
    queryKey: ["heartbeats", teamId, id],
    queryFn: () => api<HeartbeatMonitorSummary[]>(`/teams/${teamId}/heartbeats?resourceId=${id}`),
    refetchInterval: 30_000,
  });
  const agents = useQuery({
    queryKey: ["agents", teamId],
    queryFn: () => api<AgentSummary[]>(`/teams/${teamId}/agents`),
  });
  const activeCheckId = selectedCheckId ?? checks.data?.[0]?.id ?? null;
  const history = useQuery({
    queryKey: ["history", teamId, activeCheckId],
    queryFn: () => api<CheckResult[]>(`/teams/${teamId}/checks/${activeCheckId}/history?limit=500`),
    enabled: Boolean(activeCheckId),
    refetchInterval: 30_000,
  });
  const snapshots = useQuery({
    queryKey: ["snapshots", teamId, resource.data?.agent?.id],
    queryFn: () =>
      api<HostSnapshot[]>(
        `/teams/${teamId}/agents/${resource.data!.agent!.id}/snapshots?limit=200`
      ),
    enabled: resource.data?.agent?.kind === "desktop",
    refetchInterval: 30_000,
  });
  const metrics = useQuery({
    queryKey: ["resource-metrics", teamId, id],
    queryFn: () => {
      const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
      return api<ResourceMetricSeries[]>(
        `/teams/${teamId}/resources/${id}/metrics?from=${encodeURIComponent(from)}`
      );
    },
    refetchInterval: 30_000,
  });
  const alerts = useQuery({
    queryKey: ["resource-alerts", teamId, id],
    queryFn: () => api<ResourceAlertRuleSummary[]>(`/teams/${teamId}/resources/${id}/alerts`),
    enabled: Boolean(resource.data?.agent),
    refetchInterval: 30_000,
  });
  const technologies = useQuery({
    queryKey: ["technologies", teamId, id],
    queryFn: () => api<TechnologyObservation[]>(`/teams/${teamId}/resources/${id}/technologies`),
    refetchInterval: 60_000,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["resource", teamId, id] }),
      queryClient.invalidateQueries({ queryKey: ["resources", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["checks", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["heartbeats", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["overview", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["resource-alerts", teamId, id] }),
    ]);
  };

  if (resource.isLoading || checks.isLoading || heartbeats.isLoading) return <LoadingState />;
  if (resource.isError || checks.isError || heartbeats.isError || !resource.data)
    return (
      <ErrorState
        retry={() => {
          void resource.refetch();
          void checks.refetch();
          void heartbeats.refetch();
        }}
      />
    );
  const currentSnapshot = snapshots.data?.[0];
  const primaryStorage = currentSnapshot?.disks
    .filter((disk) => disk.totalBytes > 0 && disk.usedBytes <= disk.totalBytes)
    .toSorted(
      (left, right) => right.usedBytes / right.totalBytes - left.usedBytes / left.totalBytes
    )[0];
  const currentAgent = agents.data?.find((agent) => agent.id === resource.data.agent?.id);
  const deviceStatus = currentAgent?.deviceStatus;
  const chartData = (history.data ?? []).toReversed();
  const activeCheck = checks.data?.find((check) => check.id === activeCheckId);
  const primaryHistorySeries = activeCheck
    ? createTypedCheckHistorySeries(activeCheck.type, chartData).slice(0, 2)
    : [];
  const primaryHistoryData = chartData.map((result) => ({
    checkedAt: result.checkedAt,
    ...Object.fromEntries(
      primaryHistorySeries.map((series, index) => [
        `metric${index}`,
        series.points.find((point) => point.checkedAt === result.checkedAt)?.value ?? null,
      ])
    ),
  }));
  const checkMetricSeries = createCheckMetricSeries(chartData);

  async function removeResource() {
    setDeleting(true);
    try {
      await api(`/teams/${teamId}/resources/${id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["resources", teamId] });
      void navigate(appRoutes.resources);
      toast.success("Resource deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Resource could not be deleted");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  return (
    <div className="space-y-6">
      <div
        data-guide-page="resource-heading"
        className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"
      >
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2">
            <Link to={appRoutes.resources}>
              <ArrowLeft /> Resources
            </Link>
          </Button>
          <div className="flex items-start gap-4">
            <ResourceImage
              resource={resource.data}
              className="size-16 rounded-2xl"
              iconClassName="size-7"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-display text-3xl font-black tracking-tight">
                  {resource.data.name}
                </h2>
                <StatusBadge status={resource.data.status} />
                {resource.data.inMaintenance ? <StatusBadge status="maintenance" /> : null}
              </div>
              <p className="mt-2 text-sm capitalize text-muted">
                {resource.data.agent?.platform ?? resource.data.kind}
              </p>
              {resource.data.description ? (
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                  {resource.data.description}
                </p>
              ) : null}
              {resource.data.tags.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {resource.data.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-lg bg-ink/5 px-2 py-1 text-[11px] font-medium text-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImageOpen(true)}>
            <ImageIcon /> Change image
          </Button>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil /> Edit
          </Button>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            <Trash2 /> Delete
          </Button>
        </div>
      </div>

      {currentSnapshot ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <HostMetric icon={Cpu} label="CPU" value={`${currentSnapshot.cpuPercent.toFixed(1)}%`} />
          <HostMetric
            icon={MemoryStick}
            label="Memory"
            value={`${percentage(currentSnapshot.memoryUsedBytes, currentSnapshot.memoryTotalBytes)}%`}
            detail={`${formatBytes(currentSnapshot.memoryUsedBytes)} / ${formatBytes(currentSnapshot.memoryTotalBytes)}`}
          />
          <HostMetric icon={Activity} label="Load" value={currentSnapshot.loadAverage.toFixed(2)} />
          <HostMetric
            icon={Database}
            label="Disk"
            value={
              primaryStorage
                ? `${((primaryStorage.usedBytes / primaryStorage.totalBytes) * 100).toFixed(1)}%`
                : "—"
            }
            detail={primaryStorage?.mount}
          />
          <HostMetric
            icon={Gauge}
            label="Swap"
            value={`${percentage(currentSnapshot.swapUsedBytes, currentSnapshot.swapTotalBytes)}%`}
            detail={`${formatBytes(currentSnapshot.swapUsedBytes)} / ${formatBytes(currentSnapshot.swapTotalBytes)}`}
          />
          <HostMetric
            icon={Network}
            label="Network"
            value={formatBytes(
              currentSnapshot.networkReceivedBytes + currentSnapshot.networkTransmittedBytes
            )}
            detail={formatCount(currentSnapshot.processCount, "process", "processes")}
          />
        </section>
      ) : null}

      {deviceStatus ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <HostMetric
            icon={Battery}
            label="Battery"
            value={
              deviceStatus.battery.percent == null
                ? "—"
                : `${deviceStatus.battery.percent.toFixed(0)}%`
            }
          />
          <HostMetric
            icon={MemoryStick}
            label="Memory"
            value={`${percentage(deviceStatus.memory.totalBytes - deviceStatus.memory.availableBytes, deviceStatus.memory.totalBytes)}%`}
          />
          <HostMetric
            icon={Database}
            label="Storage"
            value={`${percentage(deviceStatus.storage.totalBytes - deviceStatus.storage.availableBytes, deviceStatus.storage.totalBytes)}%`}
          />
          <HostMetric
            icon={Network}
            label="Internet"
            value={deviceStatus.connectivity.internetValidated ? "Available" : "Unavailable"}
          />
        </section>
      ) : null}

      {metrics.data?.some((series) => series.points.length) ? (
        <section className="grid gap-4 lg:grid-cols-2">
          {metrics.data
            .filter((series) => series.points.length)
            .map((series) => (
              <MetricHistory key={series.metric} series={series} />
            ))}
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card data-guide-page="resource-history">
          <CardHeader>
            <div>
              <h3 className="font-display font-bold">History</h3>
              <p className="mt-1 text-xs text-muted">
                {activeCheckId
                  ? checks.data?.find((check) => check.id === activeCheckId)?.name
                  : "No check selected"}
              </p>
            </div>
            {checks.data?.length ? (
              <Select
                value={activeCheckId ?? ""}
                onChange={(event) => setSelectedCheckId(event.target.value)}
                className="h-9 w-44 text-xs"
              >
                {checks.data.map((check) => (
                  <option key={check.id} value={check.id}>
                    {check.name}
                  </option>
                ))}
              </Select>
            ) : null}
          </CardHeader>
          <CardContent className="h-72 pl-1 sm:pl-3">
            {history.isLoading ? (
              <LoadingState />
            ) : primaryHistorySeries.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={primaryHistoryData}
                  margin={{ top: 8, right: 12, left: -18, bottom: 0 }}
                >
                  <CartesianGrid stroke={chartColors.grid} strokeDasharray="4 6" vertical={false} />
                  <XAxis
                    dataKey="checkedAt"
                    tickFormatter={(value) =>
                      new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    }
                    tick={{ fill: chartColors.muted, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={35}
                  />
                  <YAxis
                    tick={{ fill: chartColors.muted, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                    unit={
                      primaryHistorySeries.every((series) =>
                        series.key.toLowerCase().includes("percent")
                      )
                        ? "%"
                        : undefined
                    }
                  />
                  <Tooltip
                    labelFormatter={(value) =>
                      typeof value === "string" || typeof value === "number"
                        ? new Date(value).toLocaleString()
                        : ""
                    }
                    formatter={(value, name) => {
                      const series = primaryHistorySeries.find((item) => item.label === name);
                      return [
                        typeof value === "number" && series
                          ? formatTypedCheckMetric(series.key, value)
                          : "—",
                        name,
                      ];
                    }}
                    contentStyle={chartTooltipStyle}
                  />
                  {primaryHistorySeries.map((series, index) => (
                    <Line
                      key={series.key}
                      type="monotone"
                      dataKey={`metric${index}`}
                      name={series.label}
                      stroke={index === 0 ? chartColors.lavender : chartColors.coral}
                      strokeWidth={2.5}
                      dot={false}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-1 text-sm text-muted">
                <StateArtwork illustration="analysis" />
                <span>Waiting for results</span>
              </div>
            )}
          </CardContent>
        </Card>

        <div data-guide-page="resource-monitors" className="space-y-6">
          <Card>
            <CardHeader>
              <h3 className="font-display font-bold">Checks</h3>
              <Button asChild variant="ghost" size="sm">
                <Link to={appRoutes.checksForResource(id)}>Manage checks</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {checks.data?.map((check) => (
                <div key={check.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
                      <Activity className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{check.name}</p>
                      <p className="text-xs text-muted">
                        {checkExecutionLabel(check.execution, agents.data ?? [])} ·{" "}
                        {formatPercent(check.uptime24h)}
                      </p>
                    </div>
                    <StatusBadge status={check.status} />
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Show details"
                      aria-label={`Show details for ${check.name}`}
                      onClick={() => setDetailsCheck(check)}
                    >
                      <Eye />
                    </Button>
                  </div>
                  <CheckHealthSummary check={check} className="mt-3" />
                  <div className="mt-2 flex justify-between text-[11px] text-muted">
                    <span>{check.intervalSeconds}s interval</span>
                    <span>{formatRelative(check.lastCheckedAt)}</span>
                  </div>
                </div>
              ))}
              {!checks.data?.length ? (
                <div className="grid h-40 place-items-center text-sm text-muted">No checks</div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="font-display font-bold">Heartbeats</h3>
              <Button asChild variant="ghost" size="sm">
                <Link to={appRoutes.heartbeatsForResource(id)}>Manage heartbeats</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {heartbeats.data?.map((heartbeat) => (
                <div key={heartbeat.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-xl bg-mint/20 text-success-strong">
                      <Radio className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{heartbeat.name}</p>
                      <p className="text-xs text-muted">
                        {formatPercent(heartbeat.successRate30d)} ·{" "}
                        {formatRelative(heartbeat.lastPingAt)}
                      </p>
                    </div>
                    <StatusBadge status={heartbeat.status} />
                  </div>
                </div>
              ))}
              {!heartbeats.data?.length ? (
                <div className="grid h-24 place-items-center text-sm text-muted">No heartbeats</div>
              ) : null}
            </CardContent>
          </Card>
          {resource.data.agent ? (
            <Card>
              <CardHeader>
                <h3 className="font-display font-bold">Alerts</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedAlert(null);
                    setAlertOpen(true);
                  }}
                >
                  <Bell /> Add alert
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {alerts.data?.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center gap-3 rounded-xl border border-line p-3"
                  >
                    <StatusBadge status={alert.active ? "down" : alert.enabled ? "up" : "paused"} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{alert.name}</p>
                      <p className="text-xs text-muted">
                        {metricLabel(alert.metric)} {alertOperatorSymbol(alert.operator)}{" "}
                        {String(alert.threshold)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit ${alert.name}`}
                      onClick={() => {
                        setSelectedAlert(alert);
                        setAlertOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete ${alert.name}`}
                      onClick={async () => {
                        try {
                          await api(`/teams/${teamId}/resources/${id}/alerts/${alert.id}`, {
                            method: "DELETE",
                          });
                          await alerts.refetch();
                        } catch (error) {
                          toast.error(
                            error instanceof Error ? error.message : "Alert could not be deleted"
                          );
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                {!alerts.data?.length ? (
                  <div className="grid h-24 place-items-center text-sm text-muted">No alerts</div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </section>

      {checkMetricSeries.length ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {checkMetricSeries.map((series) => (
            <CheckMetricHistory key={series.metric} series={series} />
          ))}
        </section>
      ) : null}

      {currentSnapshot?.disks.length ? (
        <Card>
          <CardHeader>
            <h3 className="font-display font-bold">Volumes</h3>
            <span className="text-xs text-muted">{formatRelative(currentSnapshot.observedAt)}</span>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {currentSnapshot.disks.map((disk) => {
              const percent =
                disk.totalBytes > 0 && disk.usedBytes <= disk.totalBytes
                  ? (disk.usedBytes / disk.totalBytes) * 100
                  : null;
              return (
                <div key={disk.mount} className="rounded-xl border border-line p-4">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold">{disk.mount}</span>
                    <span className="text-muted">
                      {percent === null ? "—" : `${percent.toFixed(1)}%`}
                    </span>
                  </div>
                  {percent === null ? null : (
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/6">
                      <div
                        className={`h-full rounded-full ${percent >= 90 ? "bg-danger" : percent >= 80 ? "bg-warning" : "bg-success"}`}
                        style={{ width: `${Math.min(percent, 100)}%` }}
                      />
                    </div>
                  )}
                  <p className="mt-2 text-xs text-muted">
                    {formatBytes(disk.usedBytes)} / {formatBytes(disk.totalBytes)}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {currentSnapshot?.containerRuntime?.containers.length ? (
        <Card>
          <CardHeader>
            <h3 className="font-display font-bold">Containers</h3>
            <span className="text-xs text-muted">
              Docker {currentSnapshot.containerRuntime.engineVersion}
            </span>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {currentSnapshot.containerRuntime.containers.map((container) => (
              <div key={container.id} className="rounded-xl border border-line p-4">
                <div className="flex items-center gap-3">
                  <Container className="size-4 text-violet-strong" />
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold">{container.name}</p>
                  <StatusBadge
                    status={
                      container.state === "running" && container.health !== "unhealthy"
                        ? "up"
                        : "down"
                    }
                  />
                </div>
                <p className="mt-2 truncate text-xs text-muted">{container.image}</p>
                {container.composeProject || container.composeService ? (
                  <p className="mt-1 truncate text-xs text-muted">
                    {[container.composeProject, container.composeService]
                      .filter(Boolean)
                      .join(" / ")}
                  </p>
                ) : null}
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <ContainerMetric label="CPU" value={container.cpuPercent.toFixed(1) + "%"} />
                  <ContainerMetric
                    label="Memory"
                    value={
                      container.memoryLimitBytes
                        ? percentage(container.memoryUsedBytes, container.memoryLimitBytes) + "%"
                        : formatBytes(container.memoryUsedBytes)
                    }
                  />
                  <ContainerMetric
                    label="Network"
                    value={[
                      formatBytes(container.networkReceivedBytes),
                      formatBytes(container.networkTransmittedBytes),
                    ].join(" / ")}
                  />
                  <ContainerMetric
                    label="Disk I/O"
                    value={[
                      formatBytes(container.blockReadBytes),
                      formatBytes(container.blockWrittenBytes),
                    ].join(" / ")}
                  />
                  <ContainerMetric
                    label="Restarts"
                    value={container.restartCount.toLocaleString()}
                  />
                  <ContainerMetric label="Health" value={container.health} />
                </dl>
                {container.ports.length ? (
                  <p className="mt-3 break-words font-mono text-[11px] text-muted">
                    {container.ports.join(", ")}
                  </p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {technologies.data?.length ? (
        <Card>
          <CardHeader>
            <h3 className="font-display font-bold">Technology stack</h3>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {technologies.data.map((technology) => (
              <div
                key={technology.id}
                className="flex items-center justify-between rounded-xl border border-line p-4"
              >
                <div>
                  <p className="text-sm font-semibold">{technology.name}</p>
                  <p className="mt-1 text-xs capitalize text-muted">{technology.category}</p>
                </div>
                {technology.version ? (
                  <span className="font-mono text-xs text-muted">{technology.version}</span>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <EditResourceDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        resource={resource.data}
        onSaved={refresh}
      />
      <AlertRuleDialog
        open={alertOpen}
        onOpenChange={setAlertOpen}
        teamId={teamId}
        resourceId={id}
        rule={selectedAlert}
        metrics={availableAlertMetrics(resource.data.agent?.kind)}
        onSaved={async () => {
          await alerts.refetch();
        }}
      />
      <ResourceImageDialog
        open={imageOpen}
        onOpenChange={setImageOpen}
        resource={resource.data}
        onSaved={refresh}
      />
      <CheckDetailsDialog
        open={Boolean(detailsCheck)}
        onOpenChange={(open) => {
          if (!open) setDetailsCheck(null);
        }}
        teamId={teamId}
        check={detailsCheck}
        resourceName={resource.data.name}
      />
      <ConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${resource.data.name}?`}
        description="Its monitoring history will also be deleted."
        confirmLabel="Delete resource"
        pending={deleting}
        onConfirm={() => void removeResource()}
      />
    </div>
  );
}

function percentage(used: number, total: number): string {
  return (total ? (used / total) * 100 : 0).toFixed(1);
}

function checkExecutionLabel(execution: CheckSummary["execution"], agents: AgentSummary[]): string {
  if (execution.kind === "direct") return "Direct";
  return agents.find((agent) => agent.id === execution.agentId)?.resourceName ?? "Agent";
}

function HostMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3 text-sm text-muted">
        <span className="grid size-9 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
          <Icon className="size-4" />
        </span>
        {label}
      </div>
      <p className="mt-4 font-display text-2xl font-black">{value}</p>
      {detail ? <p className="mt-1 truncate text-xs text-muted">{detail}</p> : null}
    </Card>
  );
}

function MetricHistory({ series }: { series: ResourceMetricSeries }) {
  return (
    <Card className="h-64 p-5">
      <h3 className="font-display font-bold">{metricLabel(series.metric)}</h3>
      <ResponsiveContainer width="100%" height="85%">
        <LineChart data={series.points} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke={chartColors.grid} strokeDasharray="4 6" vertical={false} />
          <XAxis
            dataKey="observedAt"
            tickFormatter={(value) => new Date(value).toLocaleDateString()}
            tick={{ fill: chartColors.muted, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            minTickGap={35}
          />
          <YAxis
            tick={{ fill: chartColors.muted, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            labelFormatter={(value) =>
              typeof value === "string" || typeof value === "number"
                ? new Date(value).toLocaleString()
                : ""
            }
            contentStyle={chartTooltipStyle}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={chartColors.lavender}
            strokeWidth={2.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

interface CheckMetricSeries {
  metric: string;
  points: Array<{
    observedAt: string;
    value: number | string | boolean | null;
  }>;
}

export function createCheckMetricSeries(results: CheckResult[]): CheckMetricSeries[] {
  const metrics = [...new Set(results.flatMap((result) => Object.keys(result.metrics)))].toSorted();
  return metrics.map((metric) => ({
    metric,
    points: results.flatMap((result) =>
      Object.hasOwn(result.metrics, metric)
        ? [{ observedAt: result.checkedAt, value: result.metrics[metric] ?? null }]
        : []
    ),
  }));
}

function CheckMetricHistory({ series }: { series: CheckMetricSeries }) {
  const numericPoints = series.points.filter(
    (point): point is { observedAt: string; value: number } => typeof point.value === "number"
  );
  const latest = series.points.at(-1)?.value ?? null;
  return (
    <Card className="min-h-36 p-5">
      <h3 className="text-sm font-semibold text-muted">{checkMetricLabel(series.metric)}</h3>
      <p className="mt-3 font-display text-2xl font-black">
        {formatCheckMetric(series.metric, latest)}
      </p>
      {numericPoints.length > 1 ? (
        <div className="mt-3 h-14">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={numericPoints}>
              <Tooltip
                labelFormatter={(value) =>
                  typeof value === "string" || typeof value === "number"
                    ? new Date(value).toLocaleString()
                    : ""
                }
                formatter={(value) => [
                  typeof value === "number"
                    ? formatCheckMetric(series.metric, value)
                    : String(value),
                  checkMetricLabel(series.metric),
                ]}
                contentStyle={chartTooltipStyle}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={chartColors.lavender}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </Card>
  );
}

function checkMetricLabel(metric: string): string {
  const label = metric
    .replace(/[._]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\bms\b/gi, "ms")
    .replace(/\bio\b/gi, "I/O");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatCheckMetric(metric: string, value: number | string | boolean | null): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;
  const normalized = metric.toLowerCase();
  if (normalized.includes("bytes")) return formatBytes(value);
  if (normalized.includes("percent")) return value.toFixed(1) + "%";
  if (normalized.endsWith("ms")) return value.toLocaleString() + " ms";
  if (normalized.includes("seconds")) return value.toLocaleString() + " s";
  return value.toLocaleString();
}

function ContainerMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 truncate font-medium capitalize" title={value}>
        {value}
      </dd>
    </div>
  );
}

function AlertRuleDialog({
  open,
  onOpenChange,
  teamId,
  resourceId,
  rule,
  metrics,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  resourceId: string;
  rule: ResourceAlertRuleSummary | null;
  metrics: ResourceAlertMetric[];
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState("Resource threshold");
  const [metric, setMetric] = useState<ResourceAlertMetric>("cpuPercent");
  const [operator, setOperator] = useState<ResourceAlertOperator>("greaterThanOrEqual");
  const [threshold, setThreshold] = useState("90");
  const [recoveryThreshold, setRecoveryThreshold] = useState("80");
  const [requiredSamples, setRequiredSamples] = useState("2");
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const booleanMetric = isBooleanAlertMetric(metric);

  useEffect(() => {
    if (!open) return;
    setName(rule?.name ?? "Resource threshold");
    setMetric(rule?.metric ?? metrics[0] ?? "cpuPercent");
    setOperator(rule?.operator ?? "greaterThanOrEqual");
    setThreshold(String(rule?.threshold ?? 90));
    setRecoveryThreshold(
      rule?.recoveryThreshold === null || rule?.recoveryThreshold === undefined
        ? ""
        : String(rule.recoveryThreshold)
    );
    setRequiredSamples(String(rule?.requiredSamples ?? 2));
    setEnabled(rule?.enabled ?? true);
    setError("");
  }, [open, rule, metrics]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/teams/${teamId}/resources/${resourceId}/alerts${rule ? `/${rule.id}` : ""}`, {
        method: rule ? "PATCH" : "POST",
        ...jsonBody({
          name,
          metric,
          operator: booleanMetric ? "equals" : operator,
          threshold: booleanMetric ? threshold === "true" : Number(threshold),
          recoveryThreshold: booleanMetric
            ? threshold !== "true"
            : recoveryThreshold
              ? Number(recoveryThreshold)
              : null,
          requiredSamples: Number(requiredSamples),
          enabled,
        }),
      });
      await onSaved();
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Alert could not be saved");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={rule ? "Edit alert" : "Add alert"} />
        <form className="grid gap-4" onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor="alert-name">Name</FieldLabel>
            <Input
              id="alert-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="alert-metric">Metric</FieldLabel>
              <Select
                id="alert-metric"
                value={metric}
                onChange={(event) => {
                  const value = metrics.find((item) => item === event.target.value);
                  if (value) {
                    setMetric(value);
                    setThreshold(isBooleanAlertMetric(value) ? "true" : "90");
                    setRecoveryThreshold(isBooleanAlertMetric(value) ? "" : "80");
                  }
                }}
              >
                {metrics.map((value) => (
                  <option key={value} value={value}>
                    {metricLabel(value)}
                  </option>
                ))}
              </Select>
            </Field>
            {!booleanMetric ? (
              <Field>
                <FieldLabel htmlFor="alert-operator">Operator</FieldLabel>
                <Select
                  id="alert-operator"
                  value={operator}
                  onChange={(event) => {
                    const value = resourceAlertOperators.find(
                      (item) => item === event.target.value
                    );
                    if (value) {
                      setOperator(value);
                      const trigger = Number(threshold);
                      if (Number.isFinite(trigger)) {
                        setRecoveryThreshold(
                          String(
                            value === "lessThan" || value === "lessThanOrEqual"
                              ? trigger + 10
                              : trigger - 10
                          )
                        );
                      }
                    }
                  }}
                >
                  {resourceAlertOperators
                    .filter((value) => value !== "equals")
                    .map((value) => (
                      <option key={value} value={value}>
                        {alertOperatorSymbol(value)}
                      </option>
                    ))}
                </Select>
              </Field>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="alert-threshold">Threshold</FieldLabel>
              {booleanMetric ? (
                <Select
                  id="alert-threshold"
                  value={threshold}
                  onChange={(event) => setThreshold(event.target.value)}
                >
                  <option value="true">True</option>
                  <option value="false">False</option>
                </Select>
              ) : (
                <Input
                  id="alert-threshold"
                  type="number"
                  step="any"
                  value={threshold}
                  onChange={(event) => setThreshold(event.target.value)}
                  required
                />
              )}
            </Field>
            {!booleanMetric ? (
              <Field>
                <FieldLabel htmlFor="alert-recovery">Recovery</FieldLabel>
                <Input
                  id="alert-recovery"
                  type="number"
                  step="any"
                  value={recoveryThreshold}
                  onChange={(event) => setRecoveryThreshold(event.target.value)}
                />
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="alert-samples">Samples</FieldLabel>
              <Input
                id="alert-samples"
                type="number"
                min={1}
                max={10}
                value={requiredSamples}
                onChange={(event) => setRequiredSamples(event.target.value)}
                required
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="size-4 accent-[var(--color-lavender)]"
            />
            Enabled
          </label>
          <FieldError>{error}</FieldError>
          <Button type="submit" variant="coral" disabled={busy}>
            {busy ? "Saving…" : rule ? "Save" : "Save alert"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function metricLabel(metric: ResourceAlertMetric): string {
  const labels: Record<ResourceAlertMetric, string> = {
    cpuPercent: "CPU",
    memoryPercent: "Memory",
    storagePercent: "Storage",
    loadAverage: "Load average",
    batteryPercent: "Battery",
    batteryTemperatureCelsius: "Battery temperature",
    containerCount: "Containers",
    unhealthyContainerCount: "Unhealthy containers",
    internetAvailable: "Internet available",
    lowMemory: "Low memory",
    backgroundRestricted: "Background restricted",
  };
  return labels[metric];
}

function alertOperatorSymbol(operator: ResourceAlertOperator): string {
  return (
    {
      greaterThan: ">",
      greaterThanOrEqual: "≥",
      lessThan: "<",
      lessThanOrEqual: "≤",
      equals: "=",
    } as const
  )[operator];
}

function isBooleanAlertMetric(metric: ResourceAlertMetric): boolean {
  return (
    metric === "internetAvailable" || metric === "lowMemory" || metric === "backgroundRestricted"
  );
}

function availableAlertMetrics(kind: AgentKind | undefined): ResourceAlertMetric[] {
  return kind === "mobile"
    ? [
        "batteryPercent",
        "batteryTemperatureCelsius",
        "memoryPercent",
        "storagePercent",
        "internetAvailable",
        "lowMemory",
        "backgroundRestricted",
      ]
    : kind === "desktop"
      ? [
          "cpuPercent",
          "memoryPercent",
          "storagePercent",
          "loadAverage",
          "containerCount",
          "unhealthyContainerCount",
        ]
      : [];
}

function EditResourceDialog({
  open,
  onOpenChange,
  resource,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: ResourceSummary;
  onSaved: () => Promise<void>;
}) {
  const { activeTeam } = useAuth();
  const [name, setName] = useState(resource.name);
  const [description, setDescription] = useState(resource.description ?? "");
  const [tags, setTags] = useState(resource.tags.join(", "));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName(resource.name);
      setDescription(resource.description ?? "");
      setTags(resource.tags.join(", "));
      setError("");
    }
  }, [open, resource]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/teams/${activeTeam!.id}/resources/${resource.id}`, {
        method: "PATCH",
        ...jsonBody({
          name,
          description,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      });
      await onSaved();
      toast.success("Resource updated");
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Resource could not be updated");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title="Edit resource" />
        <form className="grid gap-4" onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor="edit-name">Name</FieldLabel>
            <Input
              id="edit-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-description">Description</FieldLabel>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-tags">Tags</FieldLabel>
            <Input id="edit-tags" value={tags} onChange={(event) => setTags(event.target.value)} />
          </Field>
          <FieldError>{error}</FieldError>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="coral" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
