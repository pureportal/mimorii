import {
  logRetentionDayOptions,
  type CreatedLogSource,
  type LogSourceList,
  type LogSourceSummary,
  type TeamLogSettings,
} from "@mimorii/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pencil, Plug, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { LogSourceDialog } from "../components/logs/log-source-dialog";
import { LogSourceConnectDialog } from "../components/logs/log-source-connect-dialog";
import { EmptyState, ErrorState, LoadingState } from "../components/page-state";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { ConfirmationDialog } from "../components/ui/confirmation-dialog";
import { Select } from "../components/ui/input";
import { api, jsonBody } from "../lib/api";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { formatBytes, formatCount, formatRelative } from "../lib/format";

type SourceConfirmation = { action: "rotate" | "delete"; source: LogSourceSummary };

interface ConnectState {
  source: LogSourceSummary;
  token: string | null;
}

export function LogSourcesPage() {
  const { activeTeam } = useAuth();
  const team = activeTeam!;
  const teamId = team.id;
  const canManage = team.role === "owner" || team.role === "admin";
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<{ source: LogSourceSummary | null } | null>(null);
  const [connect, setConnect] = useState<ConnectState | null>(null);
  const [confirmation, setConfirmation] = useState<SourceConfirmation | null>(null);
  const [pendingRetention, setPendingRetention] = useState<number | null>(null);
  const sources = useQuery({
    queryKey: ["logs", teamId, "sources"],
    queryFn: () => api<LogSourceList>(`/teams/${teamId}/logs/sources`),
    enabled: canManage,
    refetchInterval: 30_000,
  });
  const settings = useQuery({
    queryKey: ["logs", teamId, "settings"],
    queryFn: () => api<TeamLogSettings>(`/teams/${teamId}/logs/settings`),
    enabled: canManage,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["logs", teamId, "sources"] });
  const rotate = useMutation({
    mutationFn: (source: LogSourceSummary) =>
      api<CreatedLogSource>(`/teams/${teamId}/logs/sources/${source.id}/rotate-token`, {
        method: "POST",
      }),
    onSuccess: async (created) => {
      setConnect({ source: created.source, token: created.token });
      await refresh();
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setConfirmation(null),
  });
  const remove = useMutation({
    mutationFn: (source: LogSourceSummary) =>
      api(`/teams/${teamId}/logs/sources/${source.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refresh();
      toast.success("Source deleted");
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setConfirmation(null),
  });
  const retention = useMutation({
    mutationFn: (retentionDays: number) =>
      api<TeamLogSettings>(`/teams/${teamId}/logs/settings`, {
        method: "PATCH",
        ...jsonBody({ retentionDays }),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["logs", teamId, "settings"], updated);
      toast.success("Retention saved");
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setPendingRetention(null),
  });

  if (!canManage) return <Navigate to={appRoutes.logs} replace />;
  if (sources.isLoading || settings.isLoading) return <LoadingState />;
  if (sources.isError || settings.isError) {
    return (
      <ErrorState
        retry={() => {
          void sources.refetch();
          void settings.refetch();
        }}
      />
    );
  }
  const list = sources.data!;
  const currentRetention = settings.data!.retentionDays;

  function changeRetention(days: number) {
    if (days < currentRetention) setPendingRetention(days);
    else retention.mutate(days);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted">{formatCount(list.sources.length, "source")}</p>
          <label className="flex items-center gap-2 text-sm font-medium">
            Retention
            <Select
              value={currentRetention}
              disabled={retention.isPending}
              onChange={(event) => changeRetention(Number(event.target.value))}
              className="h-9 w-32"
            >
              {logRetentionDayOptions.map((days) => (
                <option key={days} value={days}>
                  {formatCount(days, "day")}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <Button variant="coral" onClick={() => setEditor({ source: null })}>
          <Plus /> Add source
        </Button>
      </div>

      {list.sources.length ? (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-line">
              {list.sources.map((source) => (
                <li
                  key={source.id}
                  className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_15rem_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{source.name}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span className="rounded-md bg-ink/6 px-1.5 py-0.5 font-mono text-[11px] text-muted">
                        {source.tokenPrefix}…
                      </span>
                      {Object.entries(source.labels).map(([name, value]) => (
                        <span
                          key={name}
                          className="rounded-md border border-lavender/30 bg-lavender-soft px-1.5 py-0.5 font-mono text-[11px] text-violet-strong"
                        >
                          {name}={value}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-1 text-xs text-muted">
                    <p>
                      {source.lastReceivedAt
                        ? `Received ${formatRelative(source.lastReceivedAt)}`
                        : "Nothing received yet"}
                    </p>
                    {source.accepted24h || source.rejected24h ? (
                      <p>
                        {source.accepted24h.toLocaleString()} in 24 h
                        {source.rejected24h ? (
                          <span className="text-warning-strong">
                            {" "}
                            · {source.rejected24h.toLocaleString()} rejected
                          </span>
                        ) : null}{" "}
                        · {formatBytes(source.bytes24h)}
                      </p>
                    ) : null}
                    {source.lastError && source.lastErrorAt ? (
                      <p className="line-clamp-2 text-warning-strong" title={source.lastError}>
                        {source.lastError}
                        <span className="text-muted"> · {formatRelative(source.lastErrorAt)}</span>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConnect({ source, token: null })}
                    >
                      <Plug /> Connect
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${source.name}`}
                      onClick={() => setEditor({ source })}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Rotate token for ${source.name}`}
                      onClick={() => setConfirmation({ action: "rotate", source })}
                    >
                      <KeyRound />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${source.name}`}
                      onClick={() => setConfirmation({ action: "delete", source })}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <EmptyState title="No sources" illustration="empty" />
      )}

      {editor ? (
        <LogSourceDialog
          key={editor.source?.id ?? "new"}
          teamId={teamId}
          source={editor.source}
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          onSaved={async (created) => {
            setEditor(null);
            if (created) setConnect({ source: created.source, token: created.token });
            await refresh();
          }}
        />
      ) : null}
      {connect ? (
        <LogSourceConnectDialog
          teamId={teamId}
          source={connect.source}
          token={connect.token}
          endpoints={list.endpoints}
          onOpenChange={(open) => {
            if (!open) setConnect(null);
          }}
        />
      ) : null}
      <ConfirmationDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
        title={
          confirmation?.action === "rotate"
            ? `Rotate the token for ${confirmation.source.name}?`
            : `Delete ${confirmation?.source.name ?? "source"}?`
        }
        description={
          confirmation?.action === "rotate"
            ? "The current token stops working immediately."
            : "Senders using its token are rejected. Stored logs stay until retention removes them."
        }
        confirmLabel={confirmation?.action === "rotate" ? "Rotate token" : "Delete source"}
        pending={rotate.isPending || remove.isPending}
        onConfirm={() => {
          if (!confirmation) return;
          if (confirmation.action === "rotate") rotate.mutate(confirmation.source);
          else remove.mutate(confirmation.source);
        }}
      />
      <ConfirmationDialog
        open={pendingRetention !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRetention(null);
        }}
        title={`Keep logs for ${formatCount(pendingRetention ?? 0, "day")}?`}
        description={`Logs older than ${formatCount(pendingRetention ?? 0, "day")} are deleted.`}
        confirmLabel="Reduce retention"
        pending={retention.isPending}
        onConfirm={() => {
          if (pendingRetention !== null) retention.mutate(pendingRetention);
        }}
      />
    </div>
  );
}
