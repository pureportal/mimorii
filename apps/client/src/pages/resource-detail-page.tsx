import type {
  AgentSummary,
  AgentKind,
  CheckResult,
  CheckSummary,
  HeartbeatMonitorSummary,
  ResourceAlertMetric,
  ResourceAlertOperator,
  ResourceAlertRuleSummary,
  ResourceSummary,
} from "@mimorii/contracts";
import { resourceAlertOperators } from "@mimorii/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  Battery,
  Bell,
  Database,
  Eye,
  ImageIcon,
  MemoryStick,
  Network,
  Pencil,
  Radio,
  Trash2,
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
  checkPassingLabel,
  checkMetricScale,
  createCheckHistorySeries as createTypedCheckHistorySeries,
  formatCheckMetric as formatTypedCheckMetric,
  type CheckMetricScale,
} from "../lib/check-health";
import { formatPercent, formatRelative } from "../lib/format";
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
  const alerts = useQuery({
    queryKey: ["resource-alerts", teamId, id],
    queryFn: () => api<ResourceAlertRuleSummary[]>(`/teams/${teamId}/resources/${id}/alerts`),
    enabled: Boolean(resource.data?.agent),
    refetchInterval: 30_000,
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
  const currentAgent = agents.data?.find((agent) => agent.id === resource.data.agent?.id);
  const deviceStatus = currentAgent?.deviceStatus;
  const chartData = (history.data ?? []).toReversed();
  const activeCheck = checks.data?.find((check) => check.id === activeCheckId);
  const primaryHistorySeries = activeCheck
    ? createTypedCheckHistorySeries(activeCheck.type, chartData).slice(0, 2)
    : [];
  const primaryHistoryAxes = primaryHistorySeries.reduce<
    Array<{ scale: CheckMetricScale; metricKey: string; seriesIndex: number }>
  >((axes, series, seriesIndex) => {
    const scale = checkMetricScale(series.key);
    if (!axes.some((axis) => axis.scale === scale)) {
      axes.push({ scale, metricKey: series.key, seriesIndex });
    }
    return axes;
  }, []);
  const primaryHistoryData = chartData.map((result) => ({
    checkedAt: result.checkedAt,
    ...Object.fromEntries(
      primaryHistorySeries.map((series, index) => [
        `metric${index}`,
        series.points.find((point) => point.checkedAt === result.checkedAt)?.value ?? null,
      ])
    ),
  }));

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
                  margin={{ top: 8, right: 0, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    yAxisId={primaryHistoryAxes[0]?.scale}
                    stroke={chartColors.grid}
                    strokeDasharray="4 6"
                    vertical={false}
                  />
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
                  {primaryHistoryAxes.map((axis, axisIndex) => (
                    <YAxis
                      key={axis.scale}
                      yAxisId={axis.scale}
                      orientation={axisIndex === 0 ? "left" : "right"}
                      tick={{
                        fill:
                          primaryHistoryAxes.length === 1
                            ? chartColors.muted
                            : axis.seriesIndex === 0
                              ? chartColors.lavender
                              : chartColors.coral,
                        fontSize: 10,
                      }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(value: number) =>
                        formatTypedCheckMetric(axis.metricKey, value)
                      }
                      domain={axis.scale === "percent" ? [0, 100] : ["auto", "auto"]}
                      width={56}
                    />
                  ))}
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
                      yAxisId={checkMetricScale(series.key)}
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
                        {checkPassingLabel(check.type)} {formatPercent(check.passing24h)}
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
}: {
  icon: typeof Battery;
  label: string;
  value: string;
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
    </Card>
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
