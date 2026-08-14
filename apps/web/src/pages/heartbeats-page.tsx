import type {
  CreatedHeartbeatMonitor,
  HeartbeatMonitorSummary,
  ResourceSummary,
} from "@mimorii/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, KeyRound, Pencil, Plus, Radio, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { HeartbeatDialog } from "../components/heartbeat-dialog";
import { HeartbeatHistoryDialog } from "../components/heartbeat-history-dialog";
import { HeartbeatSecretDialog } from "../components/heartbeat-secret-dialog";
import { EmptyState, ErrorState, LoadingState } from "../components/page-state";
import { StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { ConfirmationDialog } from "../components/ui/confirmation-dialog";
import { Select } from "../components/ui/input";
import { api } from "../lib/api";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { formatCount, formatMilliseconds, formatPercent, formatRelative } from "../lib/format";

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
            className="h-9 w-44 text-xs"
          >
            <option value="">All resources</option>
            {resources.data?.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name}
              </option>
            ))}
          </Select>
        </div>
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

      {filtered.length ? (
        <Card data-guide-page="heartbeats-list">
          <CardHeader>
            <h3 className="font-display font-bold">Monitors</h3>
            <span className="text-xs text-muted">
              {filtered.filter((heartbeat) => heartbeat.status === "down").length} down
            </span>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="pb-3 font-medium">Heartbeat</th>
                  <th className="pb-3 font-medium">Resource</th>
                  <th className="pb-3 font-medium">Interval</th>
                  <th className="pb-3 font-medium">30d success</th>
                  <th className="pb-3 font-medium">Avg duration</th>
                  <th className="pb-3 font-medium">Last signal</th>
                  <th className="pb-3 font-medium">Deadline</th>
                  <th className="pb-3 text-right font-medium">Status</th>
                  <th className="pb-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((heartbeat) => (
                  <tr key={heartbeat.id} className="border-t border-line">
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
                          <Radio className="size-4" />
                        </span>
                        <div>
                          <p className="font-semibold">{heartbeat.name}</p>
                          {heartbeat.lastMessage ? (
                            <p className="max-w-64 truncate text-xs text-muted">
                              {heartbeat.lastMessage}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 text-muted">{heartbeat.resourceName}</td>
                    <td className="py-4 text-muted">{formatInterval(heartbeat.intervalSeconds)}</td>
                    <td className="py-4 text-muted">{formatPercent(heartbeat.successRate30d)}</td>
                    <td className="py-4 text-muted">
                      {formatMilliseconds(heartbeat.averageDurationMs30d)}
                    </td>
                    <td className="py-4 text-muted">{formatRelative(heartbeat.lastPingAt)}</td>
                    <td className="py-4 text-muted">
                      {heartbeat.runningSince
                        ? "Running"
                        : formatRelative(heartbeat.nextDeadlineAt)}
                    </td>
                    <td className="py-4 text-right">
                      <StatusBadge status={heartbeat.status} />
                    </td>
                    <td className="py-4">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`View ${heartbeat.name} history`}
                          onClick={() => setHistoryHeartbeat(heartbeat)}
                        >
                          <History />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Rotate ${heartbeat.name} token`}
                          onClick={() => setConfirmation({ action: "rotate", heartbeat })}
                        >
                          <KeyRound />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${heartbeat.name}`}
                          onClick={() => {
                            setSelected(heartbeat);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${heartbeat.name}`}
                          onClick={() => setConfirmation({ action: "delete", heartbeat })}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
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
      <HeartbeatSecretDialog created={created} onClose={() => setCreated(null)} />
      <HeartbeatHistoryDialog
        heartbeat={historyHeartbeat}
        teamId={teamId}
        onClose={() => setHistoryHeartbeat(null)}
      />
    </div>
  );
}

function formatInterval(seconds: number): string {
  if (seconds < 3_600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86_400) return `${Number((seconds / 3_600).toFixed(1))} hr`;
  return `${Number((seconds / 86_400).toFixed(1))} day`;
}
