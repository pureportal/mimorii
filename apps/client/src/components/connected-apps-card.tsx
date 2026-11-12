import type { OAuthConnectionSummary } from "@mimorii/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plug, Unplug } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "../lib/api";
import { formatRelative } from "../lib/format";
import { ErrorState, LoadingState } from "./page-state";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { ConfirmationDialog } from "./ui/confirmation-dialog";

const connectionsQueryKey = ["oauth-connections"] as const;

export function ConnectedAppsCard() {
  const queryClient = useQueryClient();
  const [disconnecting, setDisconnecting] = useState<OAuthConnectionSummary | null>(null);
  const connections = useQuery({
    queryKey: connectionsQueryKey,
    queryFn: () => api<OAuthConnectionSummary[]>("/oauth/connections"),
  });
  const disconnect = useMutation({
    mutationFn: (id: string) => api(`/oauth/connections/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: connectionsQueryKey });
      toast.success(`${disconnecting?.clientName ?? "App"} disconnected`);
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setDisconnecting(null),
  });

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-mint/20 text-success-strong">
              <Plug />
            </span>
            <h2 className="font-display font-bold">Connected apps</h2>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/mcp">Connect</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {connections.isLoading ? <LoadingState /> : null}
          {connections.isError ? <ErrorState retry={() => void connections.refetch()} /> : null}
          {connections.data?.length ? (
            <div className="divide-y divide-line rounded-xl border border-line">
              {connections.data.map((connection) => (
                <div key={connection.id} className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{connection.clientName}</p>
                    {connection.clientHost ? (
                      <p className="mt-1 truncate text-xs text-muted">{connection.clientHost}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted">
                      {connection.scopes.includes("mcp:write") ? "Read and write" : "Read only"} ·
                      Connected {formatRelative(connection.connectedAt)} · Used{" "}
                      {formatRelative(connection.lastUsedAt)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Disconnect ${connection.clientName}`}
                    onClick={() => setDisconnecting(connection)}
                  >
                    <Unplug />
                  </Button>
                </div>
              ))}
            </div>
          ) : connections.isSuccess ? (
            <div className="grid h-24 place-items-center text-sm text-muted">No connected apps</div>
          ) : null}
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={Boolean(disconnecting)}
        onOpenChange={(open) => {
          if (!open) setDisconnecting(null);
        }}
        title={`Disconnect ${disconnecting?.clientName ?? "app"}?`}
        description="It loses access immediately and must be approved again to reconnect."
        confirmLabel="Disconnect"
        pending={disconnect.isPending}
        onConfirm={() => {
          if (disconnecting) disconnect.mutate(disconnecting.id);
        }}
      />
    </>
  );
}
