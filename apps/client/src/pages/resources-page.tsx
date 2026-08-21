import type { AgentSummary, CheckType, ResourceSummary } from "@mimorii/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Globe2, Plus, Search, Waypoints } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "../components/page-state";
import { ResourceImage } from "../components/resource-image";
import { StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Dialog, DialogContent, DialogHeader } from "../components/ui/dialog";
import { Field, FieldError, FieldLabel } from "../components/ui/field";
import { Input, Select } from "../components/ui/input";
import { api, jsonBody } from "../lib/api";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { formatRelative } from "../lib/format";

export function ResourcesPage() {
  const { activeTeam } = useAuth();
  const teamId = activeTeam!.id;
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const resources = useQuery({
    queryKey: ["resources", teamId],
    queryFn: () => api<ResourceSummary[]>(`/teams/${teamId}/resources`),
  });
  const agents = useQuery({
    queryKey: ["agents", teamId],
    queryFn: () => api<AgentSummary[]>(`/teams/${teamId}/agents`),
  });
  const open = searchParams.get("new") === "1";
  const filtered = useMemo(
    () =>
      resources.data?.filter((resource) =>
        `${resource.name} ${resource.target} ${resource.tags.join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ) ?? [],
    [resources.data, search]
  );

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["resources", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["checks", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["overview", teamId] }),
    ]);
  };

  if (resources.isLoading) return <LoadingState />;
  if (resources.isError) return <ErrorState retry={() => void resources.refetch()} />;

  return (
    <div className="space-y-6">
      <div
        data-guide-page="resources-toolbar"
        className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"
      >
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search resources"
            className="pl-10"
          />
        </div>
        <Button variant="coral" onClick={() => setSearchParams({ new: "1" })}>
          <Plus /> Add resource
        </Button>
      </div>

      {filtered.length ? (
        <div data-guide-page="resources-list" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((resource) => (
            <ResourceCard key={resource.id} resource={resource} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={search ? "No matching resources" : "No resources yet"}
          illustration={search ? undefined : "empty"}
          action={
            !search ? (
              <Button variant="coral" size="sm" onClick={() => setSearchParams({ new: "1" })}>
                <Plus /> Add resource
              </Button>
            ) : undefined
          }
        />
      )}

      <QuickResourceDialog
        open={open}
        onOpenChange={(value) => setSearchParams(value ? { new: "1" } : {})}
        teamId={teamId}
        agents={(agents.data ?? []).filter((agent) => agent.kind === "desktop")}
        onCreated={async () => {
          await invalidate();
          toast.success("Resource added");
        }}
      />
    </div>
  );
}

function ResourceCard({ resource }: { resource: ResourceSummary }) {
  return (
    <Link to={appRoutes.resource(resource.id)}>
      <Card className="group h-full p-5 transition hover:-translate-y-0.5 hover:border-lavender hover:shadow-[0_18px_40px_-26px_rgba(68,54,128,.45)]">
        <div className="flex items-start gap-4">
          <ResourceImage resource={resource} className="size-11" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="truncate font-display font-bold">{resource.name}</h2>
              <div className="flex items-center gap-1.5">
                {resource.inMaintenance ? <StatusBadge status="maintenance" /> : null}
                <StatusBadge status={resource.status} />
              </div>
            </div>
            <p className="mt-1 truncate text-sm text-muted">{resource.target}</p>
          </div>
        </div>
        <div className="mt-7 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
          <div>
            <p className="text-xs text-muted">Checks</p>
            <p className="mt-1 font-semibold">
              {resource.checksUp} / {resource.checksTotal}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">Last check</p>
            <p className="mt-1 font-semibold">{formatRelative(resource.lastCheckedAt)}</p>
          </div>
        </div>
        {resource.tags.length ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {resource.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-lg bg-ink/5 px-2 py-1 text-[11px] font-medium text-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </Card>
    </Link>
  );
}

type SetupMode = "website" | "port" | "agent";

function QuickResourceDialog({
  open,
  onOpenChange,
  teamId,
  agents,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  agents: AgentSummary[];
  onCreated: () => Promise<void>;
}) {
  const [mode, setMode] = useState<SetupMode>("website");
  const [name, setName] = useState("");
  const [target, setTarget] = useState("https://example.com/");
  const [port, setPort] = useState("443");
  const [agentId, setAgentId] = useState("");
  const [interval, setInterval] = useState("60");
  const [timeout, setTimeoutValue] = useState("5000");
  const [statusCode, setStatusCode] = useState("200");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setError("");
      setBusy(false);
    }
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    let resourceId: string | null = null;
    try {
      const resource = await api<ResourceSummary>(`/teams/${teamId}/resources`, {
        method: "POST",
        ...jsonBody({
          name,
          kind: mode === "website" ? "endpoint" : "server",
          target,
          tags: [],
          ...(agentId ? { agentId } : {}),
        }),
      });
      resourceId = resource.id;
      const check = defaultCheck(mode, target, port, statusCode, content);
      await api(`/teams/${teamId}/checks`, {
        method: "POST",
        ...jsonBody({
          resourceId,
          name: check.name,
          type: check.type,
          config: check.config,
          intervalSeconds: Number(interval),
          timeoutMs: Number(timeout),
          enabled: true,
        }),
      });
      await onCreated();
      onOpenChange(false);
      setName("");
    } catch (cause) {
      if (resourceId)
        await api(`/teams/${teamId}/resources/${resourceId}`, { method: "DELETE" }).catch(
          () => undefined
        );
      setError(cause instanceof Error ? cause.message : "Resource could not be added");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title="Add resource" />
        <form className="grid gap-5" onSubmit={submit}>
          <div className="grid grid-cols-3 gap-2">
            <ModeButton
              active={mode === "website"}
              icon={Globe2}
              label="Website"
              onClick={() => {
                setMode("website");
                setTarget("https://example.com/");
              }}
            />
            <ModeButton
              active={mode === "port"}
              icon={Waypoints}
              label="Port"
              onClick={() => {
                setMode("port");
                setTarget("example.com");
              }}
            />
            <ModeButton
              active={mode === "agent"}
              icon={Bot}
              label="Server"
              onClick={() => {
                setMode("agent");
                setTarget("Local server");
                setAgentId(agents[0]?.id ?? "");
              }}
            />
          </div>
          <Field>
            <FieldLabel htmlFor="resource-name">Name</FieldLabel>
            <Input
              id="resource-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={mode === "website" ? "Main website" : "Production server"}
              maxLength={100}
              required
            />
          </Field>
          <div className={mode === "port" ? "grid gap-4 sm:grid-cols-[1fr_120px]" : "grid gap-4"}>
            <Field>
              <FieldLabel htmlFor="resource-target">
                {mode === "website" ? "URL" : mode === "port" ? "Host" : "Hostname"}
              </FieldLabel>
              <Input
                id="resource-target"
                type={mode === "website" ? "url" : "text"}
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                required
              />
            </Field>
            {mode === "port" ? (
              <Field>
                <FieldLabel htmlFor="resource-port">Port</FieldLabel>
                <Input
                  id="resource-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={port}
                  onChange={(event) => setPort(event.target.value)}
                  required
                />
              </Field>
            ) : null}
          </div>
          {mode === "website" || mode === "port" ? (
            <Field>
              <FieldLabel htmlFor="resource-agent">Agent</FieldLabel>
              <Select
                id="resource-agent"
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
          ) : (
            <Field>
              <FieldLabel htmlFor="resource-agent-required">Agent</FieldLabel>
              <Select
                id="resource-agent-required"
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
                required
              >
                <option value="" disabled>
                  Select agent
                </option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </Select>
              {agents.length === 0 ? (
                <FieldError>Add an agent before adding a server health check</FieldError>
              ) : null}
            </Field>
          )}

          <details className="rounded-2xl border border-line px-4 py-3">
            <summary className="text-sm font-semibold">Advanced</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {mode === "website" ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="quick-status">Expected status</FieldLabel>
                    <Input
                      id="quick-status"
                      type="number"
                      min={100}
                      max={599}
                      value={statusCode}
                      onChange={(event) => setStatusCode(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="quick-content">Response contains</FieldLabel>
                    <Input
                      id="quick-content"
                      value={content}
                      onChange={(event) => setContent(event.target.value)}
                      maxLength={512}
                    />
                  </Field>
                </>
              ) : null}
              {mode !== "agent" ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="quick-interval">Interval · seconds</FieldLabel>
                    <Input
                      id="quick-interval"
                      type="number"
                      min={30}
                      max={86400}
                      value={interval}
                      onChange={(event) => setInterval(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="quick-timeout">Timeout · ms</FieldLabel>
                    <Input
                      id="quick-timeout"
                      type="number"
                      min={250}
                      max={30000}
                      value={timeout}
                      onChange={(event) => setTimeoutValue(event.target.value)}
                    />
                  </Field>
                </>
              ) : null}
            </div>
          </details>
          <FieldError>{error}</FieldError>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="coral" disabled={busy || (mode === "agent" && !agentId)}>
              {busy ? "Adding…" : "Add resource"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ModeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Globe2;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid min-h-20 place-items-center gap-1 rounded-2xl border p-3 text-xs font-semibold transition ${active ? "border-lavender bg-lavender-soft text-violet-strong" : "border-line bg-surface text-muted hover:border-lavender"}`}
    >
      <Icon className="size-5" />
      {label}
    </button>
  );
}

function defaultCheck(
  mode: SetupMode,
  target: string,
  port: string,
  status: string,
  content: string
): { name: string; type: CheckType; config: Record<string, unknown> } {
  if (mode === "website")
    return {
      name: "HTTP availability",
      type: "http",
      config: {
        url: target,
        method: "GET",
        expectedStatuses: [Number(status)],
        ...(content ? { responseContains: content } : {}),
        followRedirects: true,
        validateTls: true,
      },
    };
  if (mode === "port")
    return { name: `TCP ${port}`, type: "tcp", config: { host: target, port: Number(port) } };
  return {
    name: "Server health",
    type: "host",
    config: { cpuWarningPercent: 90, memoryWarningPercent: 90, loadWarning: 4 },
  };
}
