import type { AppKind, HeartbeatEventSummary, HeartbeatMonitorSummary } from "@mimorii/contracts";
import { useQuery } from "@tanstack/react-query";
import { ErrorState, LoadingState } from "./page-state";
import { StatusBadge } from "./ui/badge";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";
import { api } from "../lib/api";
import { AppReportDetails } from "./app-report";
import { formatMilliseconds, formatRelative } from "../lib/format";

export function HeartbeatHistoryDialog({
  heartbeat,
  teamId,
  onClose,
  app = null,
}: {
  heartbeat: HeartbeatMonitorSummary | null;
  teamId: string;
  onClose: () => void;
  app?: AppKind | null;
}) {
  const history = useQuery({
    queryKey: ["heartbeat-history", teamId, heartbeat?.id],
    queryFn: () =>
      api<HeartbeatEventSummary[]>(
        `/teams/${teamId}/heartbeats/${heartbeat!.id}/history?limit=1000`
      ),
    enabled: Boolean(heartbeat),
    refetchInterval: heartbeat ? 30_000 : false,
  });

  return (
    <Dialog open={Boolean(heartbeat)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader title={heartbeat?.name ?? "Heartbeat history"} />
        {history.isLoading ? <LoadingState /> : null}
        {history.isError ? <ErrorState retry={() => void history.refetch()} /> : null}
        {history.data?.length ? (
          <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-line">
            {history.data.map((event, index) => (
              <div
                key={event.id}
                className="grid gap-2 border-b border-line p-4 last:border-b-0 sm:grid-cols-[110px_1fr_auto]"
              >
                <StatusBadge status={eventStatus(event.type)}>{event.type}</StatusBadge>
                <div className="min-w-0">
                  {event.message ? <p className="text-sm">{event.message}</p> : null}
                  {app && Object.keys(event.metadata).length > 0 ? (
                    <AppReportDetails app={app} metadata={event.metadata} latest={index === 0} />
                  ) : Object.keys(event.metadata).length ? (
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
