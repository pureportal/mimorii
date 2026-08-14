import { agentCollectionInterval, type AgentSummary } from "@mimorii/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Copy, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "../components/page-state";
import { StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { ConfirmationDialog } from "../components/ui/confirmation-dialog";
import { Dialog, DialogContent, DialogHeader } from "../components/ui/dialog";
import { Field, FieldError, FieldLabel } from "../components/ui/field";
import { Input } from "../components/ui/input";
import { api, getServerUrl, jsonBody } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatRelative } from "../lib/format";

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
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["agents", teamId] });

  if (agents.isLoading) return <LoadingState />;
  if (agents.isError) return <ErrorState retry={() => void agents.refetch()} />;

  async function revoke(agent: AgentSummary) {
    setActionPending(true);
    try {
      await api(`/teams/${teamId}/agents/${agent.id}`, { method: "DELETE" });
      await refresh();
      toast.success("Collector revoked");
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
      await navigator.clipboard.writeText(result.enrollmentKey);
      toast.success("New key copied");
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
                  <Bot className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display font-bold">{agent.name}</p>
                  <p className="mt-1 truncate text-xs text-muted">
                    {agent.platform ?? "Not connected"} · {formatRelative(agent.lastSeenAt)}
                  </p>
                </div>
                <StatusBadge status={agent.status} />
              </div>
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
            ? "The installed collector must be enrolled again."
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
          min={agentCollectionInterval.minimumSeconds}
          max={agentCollectionInterval.maximumSeconds}
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  onCreated: () => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [interval, setInterval] = useState(String(agentCollectionInterval.defaultSeconds));
  const [created, setCreated] = useState<CreatedAgent | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const agent = await api<CreatedAgent>(`/teams/${teamId}/agents`, {
        method: "POST",
        ...jsonBody({ name, collectionIntervalSeconds: Number(interval) }),
      });
      setCreated(agent);
      await onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Collector could not be created");
    } finally {
      setBusy(false);
    }
  }
  function close(value: boolean) {
    if (!value) {
      setCreated(null);
      setName("");
      setInterval(String(agentCollectionInterval.defaultSeconds));
      setError("");
    }
    onOpenChange(value);
  }
  const command = created
    ? `mimorii-agent enroll --server ${getServerUrl()} --key ${created.enrollmentKey}`
    : "";
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader title={created ? "Connect collector" : "Add collector"}>
          {created ? "This key is shown once." : undefined}
        </DialogHeader>
        {created ? (
          <div className="grid gap-4">
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
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => close(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form className="grid gap-5" onSubmit={submit}>
            <Field>
              <FieldLabel htmlFor="agent-name">Name</FieldLabel>
              <Input
                id="agent-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Office network"
                required
                maxLength={100}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="agent-interval">Collection interval · seconds</FieldLabel>
              <Input
                id="agent-interval"
                type="number"
                min={agentCollectionInterval.minimumSeconds}
                max={agentCollectionInterval.maximumSeconds}
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
