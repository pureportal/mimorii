import type {
  AgentSummary,
  CheckResult,
  CheckSummary,
  HeartbeatMonitorSummary,
  HostSnapshot,
  ResourceSummary,
  TechnologyObservation,
} from "@mimorii/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  Cpu,
  Database,
  Gauge,
  MemoryStick,
  Network,
  Pencil,
  Radio,
  Trash2,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ErrorState, LoadingState, StateArtwork } from "../components/page-state";
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
  formatBytes,
  formatCount,
  formatLatency,
  formatPercent,
  formatRelative,
} from "../lib/format";
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null);
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
    queryKey: ["snapshots", teamId, resource.data?.agentId],
    queryFn: () =>
      api<HostSnapshot[]>(`/teams/${teamId}/agents/${resource.data!.agentId}/snapshots?limit=200`),
    enabled: Boolean(resource.data?.agentId),
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
  const chartData = (history.data ?? []).toReversed();

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
          <div className="flex items-center gap-3">
            <h2 className="font-display text-3xl font-black tracking-tight">
              {resource.data.name}
            </h2>
            <StatusBadge status={resource.data.status} />
            {resource.data.inMaintenance ? <StatusBadge status="maintenance" /> : null}
          </div>
          <p className="mt-2 text-sm text-muted">{resource.data.target}</p>
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
        <div className="flex gap-2">
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
              currentSnapshot.disks[0]
                ? `${((currentSnapshot.disks[0].usedBytes / currentSnapshot.disks[0].totalBytes) * 100).toFixed(1)}%`
                : "—"
            }
            detail={currentSnapshot.disks[0]?.mount}
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
            ) : chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
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
                    unit="ms"
                  />
                  <Tooltip
                    labelFormatter={(value) =>
                      typeof value === "string" || typeof value === "number"
                        ? new Date(value).toLocaleString()
                        : ""
                    }
                    formatter={(value) => [
                      `${typeof value === "string" || typeof value === "number" ? value : "—"} ms`,
                      "Latency",
                    ]}
                    contentStyle={chartTooltipStyle}
                  />
                  <Line
                    type="monotone"
                    dataKey="latencyMs"
                    stroke={chartColors.lavender}
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls={false}
                  />
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
                        {formatPercent(check.uptime24h)} · {formatLatency(check.lastLatencyMs)}
                      </p>
                    </div>
                    <StatusBadge status={check.status} />
                  </div>
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
        </div>
      </section>

      {currentSnapshot?.disks.length ? (
        <Card>
          <CardHeader>
            <h3 className="font-display font-bold">Volumes</h3>
            <span className="text-xs text-muted">{formatRelative(currentSnapshot.observedAt)}</span>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {currentSnapshot.disks.map((disk) => {
              const percent = disk.totalBytes ? (disk.usedBytes / disk.totalBytes) * 100 : 0;
              return (
                <div key={disk.mount} className="rounded-xl border border-line p-4">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold">{disk.mount}</span>
                    <span className="text-muted">{percent.toFixed(1)}%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/6">
                    <div
                      className={`h-full rounded-full ${percent >= 90 ? "bg-danger" : percent >= 80 ? "bg-warning" : "bg-success"}`}
                      style={{ width: `${Math.min(percent, 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {formatBytes(disk.usedBytes)} / {formatBytes(disk.totalBytes)}
                  </p>
                </div>
              );
            })}
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
        agents={(agents.data ?? []).filter((agent) => agent.kind === "desktop")}
        onSaved={refresh}
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

function EditResourceDialog({
  open,
  onOpenChange,
  resource,
  agents,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: ResourceSummary;
  agents: AgentSummary[];
  onSaved: () => Promise<void>;
}) {
  const { activeTeam } = useAuth();
  const [name, setName] = useState(resource.name);
  const [target, setTarget] = useState(resource.target);
  const [description, setDescription] = useState(resource.description ?? "");
  const [tags, setTags] = useState(resource.tags.join(", "));
  const [agentId, setAgentId] = useState(resource.agentId ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName(resource.name);
      setTarget(resource.target);
      setDescription(resource.description ?? "");
      setTags(resource.tags.join(", "));
      setAgentId(resource.agentId ?? "");
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
          target,
          description,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          agentId: agentId || null,
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
            <FieldLabel htmlFor="edit-target">Target</FieldLabel>
            <Input
              id="edit-target"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
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
          <Field>
            <FieldLabel htmlFor="edit-agent">Agent</FieldLabel>
            <Select
              id="edit-agent"
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
            >
              <option value="">Direct</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </Select>
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
