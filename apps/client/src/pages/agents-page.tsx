import {
  agentCollectionInterval,
  mobileAgentCollectionInterval,
  type AgentSummary,
  type CollectorKind,
} from "@mimorii/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Copy, Plus, RefreshCw, Smartphone, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
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
import { useAuth } from "../lib/auth";
import { formatRelative } from "../lib/format";
import {
  enrollMobileCollector,
  mobileCollectorState,
  unenrollMobileCollector,
} from "../lib/mobile-collector";

interface CreatedAgent extends AgentSummary {
  enrollmentKey: string;
}

interface AgentConfirmation {
  action: "rotate" | "revoke";
  agent: AgentSummary;
}

export function CollectorsPage() {
  const { activeTeam } = useAuth();
  const teamId = activeTeam!.id;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<AgentConfirmation | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const agents = useQuery({
    queryKey: ["agents", teamId],
    queryFn: () => api<AgentSummary[]>(`/teams/${teamId}/agents`),
    refetchInterval: 30_000,
  });
  const mobileCollector = useQuery({
    queryKey: ["mobile-collector"],
    queryFn: mobileCollectorState,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["agents", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["mobile-collector"] }),
    ]);

  if (agents.isLoading) return <LoadingState />;
  if (agents.isError) return <ErrorState retry={() => void agents.refetch()} />;

  async function revoke(agent: AgentSummary) {
    setActionPending(true);
    try {
      await api(`/teams/${teamId}/agents/${agent.id}`, { method: "DELETE" });
      let localCleanupFailed = false;
      if (agent.kind === "mobile" && mobileCollector.data?.collectorId === agent.id) {
        try {
          await unenrollMobileCollector();
        } catch {
          localCleanupFailed = true;
        }
      }
      await refresh();
      if (localCleanupFailed) {
        toast.error("Collector revoked, but local collection could not be stopped");
      } else {
        toast.success("Collector revoked");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Collector could not be revoked");
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
      if (agent.kind === "mobile" && mobileCollector.data?.collectorId === agent.id) {
        try {
          await enrollMobileCollector({
            serverUrl: getServerUrl(),
            enrollmentKey: result.enrollmentKey,
            collectorId: agent.id,
            collectionIntervalSeconds: agent.collectionIntervalSeconds,
          });
          toast.success("Key rotated");
        } catch {
          try {
            await navigator.clipboard.writeText(result.enrollmentKey);
            toast.error("Key rotated. Reconnect with the copied key");
          } catch {
            toast.error("Key rotated, but reconnecting and copying failed. Rotate it again");
          }
        }
      } else {
        try {
          await navigator.clipboard.writeText(result.enrollmentKey);
          toast.success("New key copied");
        } catch {
          toast.error("Key rotated, but it could not be copied. Rotate it again");
        }
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
      <div data-guide-page="collectors-actions" className="flex justify-end">
        <Button variant="coral" onClick={() => setCreateOpen(true)}>
          <Plus /> Add collector
        </Button>
      </div>
      {agents.data?.length ? (
        <div data-guide-page="collectors-list" className="grid gap-4 xl:grid-cols-2">
          {agents.data.map((agent) => (
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
                  <p className="truncate font-display font-bold">{agent.name}</p>
                  <p className="mt-1 truncate text-xs text-muted">
                    {agent.deviceStatus?.device.model ?? agent.platform ?? "Not connected"} ·{" "}
                    {formatRelative(agent.lastSeenAt)}
                  </p>
                </div>
                <StatusBadge status={agent.status} />
              </div>
              {agent.kind === "mobile" && agent.deviceStatus ? (
                <MobileDeviceStatusSummary status={agent.deviceStatus} />
              ) : null}
              <div className="mt-5 flex flex-col gap-4 border-t border-line pt-4 sm:flex-row sm:items-end">
                <CollectionIntervalForm agent={agent} teamId={teamId} onSaved={refresh} />
                <div className="flex gap-1 sm:ml-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmation({ action: "rotate", agent })}
                  >
                    <RefreshCw /> Rotate key
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
          ))}
        </div>
      ) : (
        <EmptyState
          title="No collectors yet"
          illustration="empty"
          action={
            <Button variant="coral" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus /> Add collector
            </Button>
          }
        />
      )}
      <CreateCollectorDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        teamId={teamId}
        onCreated={refresh}
        mobileAvailable={mobileCollector.data?.available === true}
      />
      <ConfirmationDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
        title={
          confirmation?.action === "rotate"
            ? `Rotate ${confirmation.agent.name}'s key?`
            : `Revoke ${confirmation?.agent.name ?? "collector"}?`
        }
        description={
          confirmation?.action === "rotate"
            ? confirmation.agent.kind === "mobile" &&
              mobileCollector.data?.collectorId === confirmation.agent.id
              ? "The current key will stop working."
              : "The installed collector must be enrolled again."
            : "Its current key will stop working."
        }
        confirmLabel={confirmation?.action === "rotate" ? "Rotate key" : "Revoke collector"}
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

function CollectionIntervalForm({
  agent,
  teamId,
  onSaved,
}: {
  agent: AgentSummary;
  teamId: string;
  onSaved: () => Promise<unknown>;
}) {
  const [interval, setInterval] = useState(String(agent.collectionIntervalSeconds));
  const [busy, setBusy] = useState(false);
  const limits = agent.kind === "mobile" ? mobileAgentCollectionInterval : agentCollectionInterval;

  useEffect(() => setInterval(String(agent.collectionIntervalSeconds)), [agent]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/teams/${teamId}/agents/${agent.id}`, {
        method: "PATCH",
        ...jsonBody({ collectionIntervalSeconds: Number(interval) }),
      });
      await onSaved();
      toast.success("Collection interval saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Collection interval could not be saved"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex items-end gap-2" onSubmit={submit}>
      <Field>
        <FieldLabel htmlFor={`agent-interval-${agent.id}`}>
          Collection interval · seconds
        </FieldLabel>
        <Input
          id={`agent-interval-${agent.id}`}
          className="w-28"
          type="number"
          min={limits.minimumSeconds}
          max={limits.maximumSeconds}
          value={interval}
          onChange={(event) => setInterval(event.target.value)}
          required
        />
      </Field>
      <Button type="submit" variant="outline" size="sm" disabled={busy}>
        Save
      </Button>
    </form>
  );
}

function CreateCollectorDialog({
  open,
  onOpenChange,
  teamId,
  onCreated,
  mobileAvailable,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  onCreated: () => Promise<unknown>;
  mobileAvailable: boolean;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CollectorKind>("desktop");
  const [interval, setInterval] = useState(String(agentCollectionInterval.defaultSeconds));
  const [created, setCreated] = useState<CreatedAgent | null>(null);
  const [mobileConnected, setMobileConnected] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const initialKind = mobileAvailable ? "mobile" : "desktop";
    setKind(initialKind);
    setInterval(
      String(
        initialKind === "mobile"
          ? mobileAgentCollectionInterval.defaultSeconds
          : agentCollectionInterval.defaultSeconds
      )
    );
  }, [mobileAvailable, open]);

  async function connectMobile(agent: CreatedAgent) {
    const state = await enrollMobileCollector({
      serverUrl: getServerUrl(),
      enrollmentKey: agent.enrollmentKey,
      collectorId: agent.id,
      collectionIntervalSeconds: agent.collectionIntervalSeconds,
    });
    if (!state.enrolled) throw new Error("Android collector could not be enrolled");
    setMobileConnected(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const agent = await api<CreatedAgent>(`/teams/${teamId}/agents`, {
        method: "POST",
        ...jsonBody({ name, kind, collectionIntervalSeconds: Number(interval) }),
      });
      setCreated(agent);
      try {
        if (agent.kind === "mobile") await connectMobile(agent);
      } finally {
        await onCreated();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Collector could not be created");
    } finally {
      setBusy(false);
    }
  }

  async function retryMobileConnection() {
    if (!created) return;
    setBusy(true);
    setError("");
    try {
      await connectMobile(created);
      await onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Android collector could not be enrolled");
    } finally {
      setBusy(false);
    }
  }

  function close(value: boolean) {
    if (!value) {
      setCreated(null);
      setName("");
      setKind(mobileAvailable ? "mobile" : "desktop");
      setInterval(
        String(
          mobileAvailable
            ? mobileAgentCollectionInterval.defaultSeconds
            : agentCollectionInterval.defaultSeconds
        )
      );
      setMobileConnected(false);
      setError("");
    }
    onOpenChange(value);
  }
  const command =
    created?.kind === "desktop"
      ? `mimorii-agent-deskopt enroll --server ${getServerUrl()} --key ${created.enrollmentKey}`
      : "";
  const limits = kind === "mobile" ? mobileAgentCollectionInterval : agentCollectionInterval;
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader
          title={
            created?.kind === "mobile" && mobileConnected
              ? "Collector connected"
              : created
                ? "Connect collector"
                : "Add collector"
          }
        >
          {created?.kind === "desktop" ? "This key is shown once." : undefined}
        </DialogHeader>
        {created ? (
          <div className="grid gap-4">
            {created.kind === "desktop" ? (
              <>
                <div className="rounded-2xl border border-line bg-night p-4 font-mono text-xs leading-6 text-white break-all">
                  {command}
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(command);
                    toast.success("Command copied");
                  }}
                >
                  <Copy /> Copy command
                </Button>
              </>
            ) : (
              <>
                <FieldError>{error}</FieldError>
                {!mobileConnected ? (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void retryMobileConnection()}
                  >
                    Connect device
                  </Button>
                ) : null}
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
              <FieldLabel htmlFor="agent-kind">Collector</FieldLabel>
              <Select
                id="agent-kind"
                value={kind}
                onChange={(event) => {
                  const nextKind = event.target.value as CollectorKind;
                  setKind(nextKind);
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
                {mobileAvailable ? <option value="mobile">Android device</option> : null}
              </Select>
            </Field>
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
                {busy ? "Creating…" : "Create collector"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
