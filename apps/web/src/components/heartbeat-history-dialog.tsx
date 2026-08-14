import type { HeartbeatEventSummary, HeartbeatMonitorSummary } from "@mimorii/contracts";
import { useQuery } from "@tanstack/react-query";
import { ErrorState, LoadingState } from "./page-state";
import { StatusBadge } from "./ui/badge";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";
import { api } from "../lib/api";
import { formatMilliseconds, formatRelative } from "../lib/format";

export function HeartbeatHistoryDialog({
  heartbeat,
  teamId,
  onClose,
}: {
  heartbeat: HeartbeatMonitorSummary | null;
  teamId: string;
  onClose: () => void;
}) {
  const history = useQuery({
    queryKey: ["heartbeat-history", teamId, heartbeat?.id],
    queryFn: () =>
      api<HeartbeatEventSummary[]>(
        `/teams/${teamId}/heartbeats/${heartbeat!.id}/history?limit=1000`
      ),
    enabled: Boolean(heartbeat),
  });

  return (
    <Dialog open={Boolean(heartbeat)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader title={heartbeat?.name ?? "Heartbeat history"} />
        {history.isLoading ? <LoadingState /> : null}
        {history.isError ? <ErrorState retry={() => void history.refetch()} /> : null}
        {history.data?.length ? (
          <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-line">
            {history.data.map((event) => (
              <div
                key={event.id}
                className="grid gap-2 border-b border-line p-4 last:border-b-0 sm:grid-cols-[110px_1fr_auto]"
              >
                <StatusBadge status={eventStatus(event.type)}>{event.type}</StatusBadge>
                <div className="min-w-0">
                  {event.message ? <p className="text-sm">{event.message}</p> : null}
                  {Object.keys(event.metadata).length ? (
                    <p className="mt-1 break-all font-mono text-xs text-muted">
                      {JSON.stringify(event.metadata)}
                    </p>
                  ) : null}
                </div>
                <div className="text-right text-xs text-muted">
                  <p>{formatRelative(event.occurredAt)}</p>
                  {event.durationMs !== null ? <p>{formatMilliseconds(event.durationMs)}</p> : null}
                </div>
              </div>
            ))}
          </div>
        ) : history.isSuccess ? (
          <div className="grid h-32 place-items-center text-sm text-muted">No heartbeat events</div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function eventStatus(type: HeartbeatEventSummary["type"]): "delivered" | "failed" | "active" {
  if (type === "failed" || type === "missed") return "failed";
  return type === "started" ? "active" : "delivered";
}
