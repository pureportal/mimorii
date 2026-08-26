import {
  agentCollectionInterval,
  mobileAgentCollectionInterval,
  type DesktopAgentPlatform,
  type AgentSummary,
  type AgentKind,
  type ResourceSummary,
} from "@mimorii/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Copy, KeyRound, Pencil, Plus, Smartphone, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "../components/page-state";
import { MobileDeviceStatusSummary } from "../components/mobile-device-status-summary";
import { StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { ConfirmationDialog } from "../components/ui/confirmation-dialog";
import { Dialog, DialogContent, DialogHeader } from "../components/ui/dialog";
import { Field, FieldError, FieldLabel } from "../components/ui/field";
import { Input, Select } from "../components/ui/input";
import { api, getServerUrl, jsonBody } from "../lib/api";
import { createAgentEnrollmentCode } from "../lib/agent-enrollment";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { formatRelative } from "../lib/format";

interface CreatedAgent extends AgentSummary {
  enrollmentKey: string;
}

interface AgentConfirmation {
  action: "rotate" | "revoke";
  agent: AgentSummary;
}

function agentPlatform(agent: AgentSummary): string {
  if (agent.deviceStatus) return agent.deviceStatus.device.model;
  if (agent.platform) return agent.platform;
  const runsNetworkChecks = agent.capabilities.some((capability) =>
    ["http", "tcp", "dns"].includes(capability)
  );
  const reportsHostTelemetry = agent.capabilities.includes("host");
  return runsNetworkChecks && !reportsHostTelemetry ? "Check runner" : "Not connected";
}

export function AgentsPage() {
  const { activeTeam } = useAuth();
  const teamId = activeTeam!.id;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentSummary | null>(null);
  const [confirmation, setConfirmation] = useState<AgentConfirmation | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const agents = useQuery({
    queryKey: ["agents", teamId],
    queryFn: () => api<AgentSummary[]>(`/teams/${teamId}/agents`),
    refetchInterval: 30_000,
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["agents", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["resources", teamId] }),
    ]);

  if (agents.isLoading) return <LoadingState />;
  if (agents.isError) return <ErrorState retry={() => void agents.refetch()} />;
  async function revoke(agent: AgentSummary) {
    setActionPending(true);
    try {
      await api(`/teams/${teamId}/agents/${agent.id}`, { method: "DELETE" });
      await refresh();
      toast.success("Agent revoked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Agent could not be revoked");
    } finally {
      setActionPending(false);
      setConfirmation(null);
    }
  }

  async function rotate(agent: AgentSummary) {
    setActionPending(true);
    try {
      const result = await api<{ enrollmentKey: string }>(
        `/teams/${teamId}/agents/${agent.id}/rotate-key`,
        { method: "POST" }
      );
      const enrollment =
        agent.kind === "mobile"
          ? createAgentEnrollmentCode({
              serverUrl: getServerUrl(),
              enrollmentKey: result.enrollmentKey,
            })
          : result.enrollmentKey;
      try {
        await navigator.clipboard.writeText(enrollment);
        toast.success(agent.kind === "mobile" ? "New enrollment code copied" : "New key copied");
      } catch {
        toast.error("Key rotated, but it could not be copied. Rotate it again");
      }
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Key could not be rotated");
    } finally {
      setActionPending(false);
      setConfirmation(null);
    }
  }

  return (
    <div className="space-y-6">
      <div data-guide-page="agents-actions" className="flex justify-end">
        <Button variant="coral" onClick={() => setCreateOpen(true)}>
          <Plus /> Add agent
        </Button>
      </div>
      {agents.data?.length ? (
        <div data-guide-page="agents-list" className="grid gap-4 xl:grid-cols-2">
          {agents.data.map((agent) => {
            return (
              <Card key={agent.id} className="p-5">
                <div className="flex items-start gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
                    {agent.kind === "mobile" ? (
                      <Smartphone className="size-5" />
                    ) : (
                      <Bot className="size-5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display font-bold">{agent.resourceName}</p>
                    <p className="mt-1 truncate text-xs text-muted">
                      {agentPlatform(agent)} · {formatRelative(agent.lastSeenAt)}
                    </p>
                  </div>
                  <StatusBadge status={agent.status} />
                </div>
                {agent.kind === "mobile" && agent.deviceStatus ? (
                  <MobileDeviceStatusSummary status={agent.deviceStatus} />
                ) : null}
                <div className="mt-5 flex flex-wrap justify-end gap-1 border-t border-line pt-4">
                  <Button asChild variant="ghost" size="sm">
                    <Link to={appRoutes.resource(agent.resourceId)}>View resource</Link>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingAgent(agent)}>
                    <Pencil /> Edit
                  </Button>
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmation({ action: "rotate", agent })}
                    >
                      <KeyRound /> Rotate key
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      onClick={() => setConfirmation({ action: "revoke", agent })}
                    >
                      <Trash2 /> Revoke
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No agents yet"
          illustration="empty"
          action={
            <Button variant="coral" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus /> Add agent
            </Button>
          }
        />
      )}
      <CreateAgentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        teamId={teamId}
        onCreated={refresh}
      />
      {editingAgent ? (
        <EditAgentDialog
          agent={editingAgent}
          teamId={teamId}
          onOpenChange={(open) => {
            if (!open) setEditingAgent(null);
          }}
          onSaved={refresh}
        />
      ) : null}
      <ConfirmationDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
        title={
          confirmation?.action === "rotate"
            ? `Rotate ${confirmation.agent.resourceName}'s key?`
            : `Revoke ${confirmation?.agent.resourceName ?? "agent"}?`
        }
        description={
          confirmation?.action === "rotate"
            ? "The installed agent must be enrolled again."
            : "Its checks will pause until a replacement is connected."
        }
        confirmLabel={confirmation?.action === "rotate" ? "Rotate key" : "Revoke agent"}
        pending={actionPending}
        onConfirm={() => {
          if (!confirmation) return;
          if (confirmation.action === "rotate") void rotate(confirmation.agent);
          else void revoke(confirmation.agent);
        }}
      />
    </div>
  );
}

function EditAgentDialog({
  agent,
  teamId,
  onOpenChange,
  onSaved,
}: {
  agent: AgentSummary;
  teamId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<unknown>;
}) {
  const [name, setName] = useState(agent.resourceName);
  const [interval, setInterval] = useState(String(agent.collectionIntervalSeconds));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const limits = agent.kind === "mobile" ? mobileAgentCollectionInterval : agentCollectionInterval;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/teams/${teamId}/agents/${agent.id}`, {
        method: "PATCH",
        ...jsonBody({ name, collectionIntervalSeconds: Number(interval) }),
      });
      await onSaved();
      toast.success("Agent saved");
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Agent could not be saved");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title="Edit agent" />
        <form className="grid gap-5" onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor={`agent-name-${agent.id}`}>Name</FieldLabel>
            <Input
              id={`agent-name-${agent.id}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={100}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`agent-interval-${agent.id}`}>
              Collection interval · seconds
            </FieldLabel>
            <Input
              id={`agent-interval-${agent.id}`}
              type="number"
              min={limits.minimumSeconds}
              max={limits.maximumSeconds}
              value={interval}
              onChange={(event) => setInterval(event.target.value)}
              required
            />
          </Field>
          <FieldError>{error}</FieldError>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="coral" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

async function copyEnrollmentValue(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error(`${label} could not be copied`);
  }
}

function CreateAgentDialog({
  open,
  onOpenChange,
  teamId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  onCreated: () => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [kind, setKind] = useState<AgentKind>("desktop");
  const [platform, setPlatform] = useState<DesktopAgentPlatform>("linux");
  const [interval, setInterval] = useState(String(agentCollectionInterval.defaultSeconds));
  const [created, setCreated] = useState<CreatedAgent | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const resources = useQuery({
    queryKey: ["resources", teamId],
    queryFn: () => api<ResourceSummary[]>(`/teams/${teamId}/resources`),
    enabled: open,
  });
  const availableResources = (resources.data ?? []).filter(
    (resource) => !resource.agent && resource.kind === (kind === "mobile" ? "device" : "host")
  );

  useEffect(() => {
    if (!open) return;
    setKind("desktop");
    setResourceId("");
    setPlatform("linux");
    setInterval(String(agentCollectionInterval.defaultSeconds));
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const agent = await api<CreatedAgent>(`/teams/${teamId}/agents`, {
        method: "POST",
        ...jsonBody({
          ...(resourceId ? { resourceId } : { name }),
          kind,
          ...(kind === "desktop" ? { platform } : {}),
          collectionIntervalSeconds: Number(interval),
        }),
      });
      setCreated(agent);
      await onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Agent could not be created");
    } finally {
      setBusy(false);
    }
  }

  function close(value: boolean) {
    if (!value) {
      setCreated(null);
      setName("");
      setResourceId("");
      setKind("desktop");
      setPlatform("linux");
      setInterval(String(agentCollectionInterval.defaultSeconds));
      setError("");
    }
    onOpenChange(value);
  }
  const serverUrl = getServerUrl();
  const command =
    created?.kind === "desktop"
      ? `mimorii-agent-desktop enroll --server ${serverUrl} --key ${created.enrollmentKey}`
      : "";
  const enrollmentCode =
    created?.kind === "mobile"
      ? createAgentEnrollmentCode({
          serverUrl,
          enrollmentKey: created.enrollmentKey,
        })
      : "";
  const limits = kind === "mobile" ? mobileAgentCollectionInterval : agentCollectionInterval;
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader title={created ? "Connect agent" : "Add agent"}>
          {created ? "This enrollment is shown once." : undefined}
        </DialogHeader>
        {created ? (
          <div className="grid gap-4">
            {created.kind === "desktop" ? (
              <>
                <div className="rounded-2xl border border-line bg-night p-4 font-mono text-xs leading-6 text-white break-all">
                  {command}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    variant="outline"
                    className="sm:col-span-2"
                    onClick={() => void copyEnrollmentValue(command, "Command")}
                  >
                    <Copy /> Copy command
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void copyEnrollmentValue(serverUrl, "Server URL")}
                  >
                    <Copy /> Copy server URL
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void copyEnrollmentValue(created.enrollmentKey, "Key")}
                  >
                    <Copy /> Copy key
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto rounded-2xl bg-white p-2">
                  <QRCodeSVG
                    value={enrollmentCode}
                    size={220}
                    level="M"
                    marginSize={4}
                    title="Enrollment QR code"
                  />
                </div>
                <div className="rounded-2xl border border-line bg-night p-4 font-mono text-xs leading-6 text-white break-all">
                  {enrollmentCode}
                </div>
                <Button
                  variant="outline"
                  onClick={() => void copyEnrollmentValue(enrollmentCode, "Enrollment code")}
                >
                  <Copy /> Copy enrollment code
                </Button>
              </>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => close(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form className="grid gap-5" onSubmit={submit}>
            <Field>
              <FieldLabel htmlFor="agent-kind">Agent</FieldLabel>
              <Select
                id="agent-kind"
                value={kind}
                onChange={(event) => {
                  const nextKind: AgentKind =
                    event.target.value === "mobile" ? "mobile" : "desktop";
                  setKind(nextKind);
                  setResourceId("");
                  setInterval(
                    String(
                      nextKind === "mobile"
                        ? mobileAgentCollectionInterval.defaultSeconds
                        : agentCollectionInterval.defaultSeconds
                    )
                  );
                }}
              >
                <option value="desktop">Desktop</option>
                <option value="mobile">Android device</option>
              </Select>
            </Field>
            {kind === "desktop" ? (
              <Field>
                <FieldLabel htmlFor="agent-platform">Operating system</FieldLabel>
                <Select
                  id="agent-platform"
                  value={platform}
                  onChange={(event) =>
                    setPlatform(event.target.value === "windows" ? "windows" : "linux")
                  }
                >
                  <option value="linux">Linux</option>
                  <option value="windows">Windows</option>
                </Select>
              </Field>
            ) : null}
            {availableResources.length ? (
              <Field>
                <FieldLabel htmlFor="agent-resource">Resource</FieldLabel>
                <Select
                  id="agent-resource"
                  value={resourceId}
                  onChange={(event) => setResourceId(event.target.value)}
                >
                  <option value="">New resource</option>
                  {availableResources.map((resource) => (
                    <option key={resource.id} value={resource.id}>
                      {resource.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            {!resourceId ? (
              <Field>
                <FieldLabel htmlFor="agent-name">Name</FieldLabel>
                <Input
                  id="agent-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={kind === "mobile" ? "Field phone" : "Office network"}
                  required
                  maxLength={100}
                />
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="agent-interval">Collection interval · seconds</FieldLabel>
              <Input
                id="agent-interval"
                type="number"
                min={limits.minimumSeconds}
                max={limits.maximumSeconds}
                value={interval}
                onChange={(event) => setInterval(event.target.value)}
                required
              />
            </Field>
            <FieldError>{error}</FieldError>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="coral" disabled={busy}>
                {busy ? "Creating…" : "Create agent"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
