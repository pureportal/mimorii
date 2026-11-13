import type {
  CreatedHeartbeatMonitor,
  HeartbeatMonitorSummary,
  ResourceSummary,
} from "@mimorii/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { HeartbeatCard } from "../components/heartbeat-card";
import { HeartbeatDialog } from "../components/heartbeat-dialog";
import { FoxytailDialog } from "../components/foxytail-dialog";
import { HeartbeatHistoryDialog } from "../components/heartbeat-history-dialog";
import { HeartbeatSecretDialog } from "../components/heartbeat-secret-dialog";
import { EmptyState, ErrorState, LoadingState } from "../components/page-state";
import { Button } from "../components/ui/button";
import { ConfirmationDialog } from "../components/ui/confirmation-dialog";
import { Select } from "../components/ui/input";
import { api } from "../lib/api";
import { appRoutes } from "../lib/app-navigation";
import { useCreateIntent } from "../lib/create-intent";
import { useAuth } from "../lib/auth";
import { formatCount } from "../lib/format";
import { resourceOptionLabels } from "../lib/resource-option-labels";

interface HeartbeatConfirmation {
  action: "rotate" | "delete";
  heartbeat: HeartbeatMonitorSummary;
}

export function HeartbeatsPage() {
  const { activeTeam } = useAuth();
  const teamId = activeTeam!.id;
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [formOpen, setFormOpen] = useState(false);
  const [foxytailOpen, setFoxytailOpen] = useState(searchParams.get("connect") === "foxytail");
  const [selected, setSelected] = useState<HeartbeatMonitorSummary | null>(null);
  const [historyHeartbeat, setHistoryHeartbeat] = useState<HeartbeatMonitorSummary | null>(null);
  const [created, setCreated] = useState<CreatedHeartbeatMonitor | null>(null);
  const [confirmation, setConfirmation] = useState<HeartbeatConfirmation | null>(null);
  const resourceId = searchParams.get("resourceId") ?? "";
  const heartbeats = useQuery({
    queryKey: ["heartbeats", teamId],
    queryFn: () => api<HeartbeatMonitorSummary[]>(`/teams/${teamId}/heartbeats`),
    refetchInterval: 30_000,
  });
  const resources = useQuery({
    queryKey: ["resources", teamId],
    queryFn: () => api<ResourceSummary[]>(`/teams/${teamId}/resources`),
  });
  useCreateIntent(resources.isSuccess && activeTeam!.role !== "viewer", () => {
    if (!resources.data?.length) return;
    setSelected(null);
    setFormOpen(true);
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["heartbeats", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["resources", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["overview", teamId] }),
    ]);
  };
  const rotate = useMutation({
    mutationFn: (id: string) =>
      api<CreatedHeartbeatMonitor>(`/teams/${teamId}/heartbeats/${id}/rotate-token`, {
        method: "POST",
      }),
    onSuccess: async (result) => {
      setCreated(result);
      await refresh();
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setConfirmation(null),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/teams/${teamId}/heartbeats/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refresh();
      toast.success("Heartbeat deleted");
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setConfirmation(null),
  });

  if (heartbeats.isLoading || resources.isLoading) return <LoadingState />;
  if (heartbeats.isError || resources.isError) {
    return (
      <ErrorState
        retry={() => {
          void heartbeats.refetch();
          void resources.refetch();
        }}
      />
    );
  }
  const filtered =
    heartbeats.data?.filter((heartbeat) => !resourceId || heartbeat.resourceId === resourceId) ??
    [];
  const resourceNames = resourceOptionLabels(resources.data ?? []);
  const foxytailResourceIds = new Set(
    (resources.data ?? [])
      .filter((resource) => resource.tags.includes("foxytail"))
      .map((resource) => resource.id)
  );

  return (
    <div className="space-y-6">
      <div
        data-guide-page="heartbeats-toolbar"
        className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"
      >
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted">{formatCount(filtered.length, "monitor")}</p>
          <Select
            aria-label="Resource"
            value={resourceId}
            onChange={(event) => {
              const next = new URLSearchParams(searchParams);
              if (event.target.value) next.set("resourceId", event.target.value);
              else next.delete("resourceId");
              setSearchParams(next, { replace: true });
            }}
            className="h-9 w-48"
          >
            <option value="">All resources</option>
            {resources.data?.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resourceNames.get(resource.id)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeTeam!.role !== "viewer" && (
            <Button variant="outline" onClick={() => setFoxytailOpen(true)}>
              Connect Foxytail
            </Button>
          )}
          {resources.data?.length ? (
            <Button
              variant="coral"
              onClick={() => {
                setSelected(null);
                setFormOpen(true);
              }}
            >
              <Plus /> Add heartbeat
            </Button>
          ) : (
            <Button asChild variant="coral">
              <Link to={appRoutes.newResource}>
                <Plus /> Add resource
              </Link>
            </Button>
          )}
        </div>
      </div>

      {foxytailOpen && activeTeam!.role !== "viewer" && (
        <FoxytailDialog
          key={teamId}
          teamId={teamId}
          onSaved={refresh}
          onClose={() => {
            setFoxytailOpen(false);
            const next = new URLSearchParams(searchParams);
            next.delete("connect");
            setSearchParams(next, { replace: true });
          }}
        />
      )}
      {filtered.length ? (
        <div data-guide-page="heartbeats-list" className="grid gap-4">
          {filtered.map((heartbeat) => (
            <HeartbeatCard
              key={heartbeat.id}
              heartbeat={heartbeat}
              resourceName={resourceNames.get(heartbeat.resourceId) ?? heartbeat.resourceName}
              foxytail={foxytailResourceIds.has(heartbeat.resourceId)}
              actions={
                <HeartbeatActions
                  heartbeat={heartbeat}
                  onHistory={() => setHistoryHeartbeat(heartbeat)}
                  onRotate={() => setConfirmation({ action: "rotate", heartbeat })}
                  onEdit={() => {
                    setSelected(heartbeat);
                    setFormOpen(true);
                  }}
                  onDelete={() => setConfirmation({ action: "delete", heartbeat })}
                />
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title={resources.data?.length ? "No heartbeats" : "No resources"}
          illustration="empty"
        />
      )}

      <HeartbeatDialog
        key={selected?.id ?? "new"}
        open={formOpen}
        onOpenChange={setFormOpen}
        heartbeat={selected}
        resources={resources.data ?? []}
        defaultResourceId={resourceId}
        teamId={teamId}
        onSaved={async (result) => {
          if (result) setCreated(result);
          await refresh();
        }}
      />
      <ConfirmationDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
        title={
          confirmation?.action === "rotate"
            ? `Rotate the token for ${confirmation.heartbeat.name}?`
            : `Delete ${confirmation?.heartbeat.name ?? "heartbeat"}?`
        }
        confirmLabel={confirmation?.action === "rotate" ? "Rotate token" : "Delete heartbeat"}
        pending={rotate.isPending || remove.isPending}
        onConfirm={() => {
          if (!confirmation) return;
          if (confirmation.action === "rotate") rotate.mutate(confirmation.heartbeat.id);
          else remove.mutate(confirmation.heartbeat.id);
        }}
      />
      <HeartbeatSecretDialog
        created={created}
        foxytail={resources.data?.some(
          (resource) =>
            resource.id === created?.heartbeat.resourceId && resource.tags.includes("foxytail")
        )}
        onClose={() => setCreated(null)}
      />
      <HeartbeatHistoryDialog
        foxytail={Boolean(historyHeartbeat && foxytailResourceIds.has(historyHeartbeat.resourceId))}
        heartbeat={historyHeartbeat}
        teamId={teamId}
        onClose={() => setHistoryHeartbeat(null)}
      />
    </div>
  );
}

function HeartbeatActions({
  heartbeat,
  onHistory,
  onRotate,
  onEdit,
  onDelete,
}: {
  heartbeat: HeartbeatMonitorSummary;
  onHistory: () => void;
  onRotate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`View ${heartbeat.name} history`}
        onClick={onHistory}
      >
        <History />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Rotate ${heartbeat.name} token`}
        onClick={onRotate}
      >
        <KeyRound />
      </Button>
      <Button variant="ghost" size="icon" aria-label={`Edit ${heartbeat.name}`} onClick={onEdit}>
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Delete ${heartbeat.name}`}
        onClick={onDelete}
      >
        <Trash2 />
      </Button>
    </div>
  );
}
