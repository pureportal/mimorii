import type { LogContext, LogEntry } from "@mimorii/contracts";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatLogTimestamp, logLevelPresentation } from "../../lib/log-display";
import { ErrorState, LoadingState } from "../page-state";
import { Dialog, DialogContent, DialogHeader } from "../ui/dialog";

export function LogContextDialog({
  teamId,
  entry,
  onOpenChange,
}: {
  teamId: string;
  entry: LogEntry;
  onOpenChange: (open: boolean) => void;
}) {
  const context = useQuery({
    queryKey: ["logs", teamId, "context", entry.id],
    queryFn: () => api<LogContext>(`/teams/${teamId}/logs/entries/${entry.id}/context?limit=50`),
  });
  const labels = Object.entries(entry.labels)
    .map(([name, value]) => `${name}=${value}`)
    .join(", ");

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(92vh,900px)] max-w-5xl">
        <DialogHeader title="Log context">{labels || undefined}</DialogHeader>
        {context.isLoading ? <LoadingState /> : null}
        {context.isError ? <ErrorState retry={() => void context.refetch()} /> : null}
        {context.data ? (
          <ol className="overflow-hidden rounded-xl border border-line font-mono text-[12.5px] leading-5">
            {[...context.data.before, context.data.entry, ...context.data.after].map((line) => (
              <ContextLine key={line.id} line={line} current={line.id === entry.id} />
            ))}
          </ol>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ContextLine({ line, current }: { line: LogEntry; current: boolean }) {
  return (
    <li
      ref={(element) => {
        if (current) element?.scrollIntoView({ block: "center" });
      }}
      aria-current={current ? "true" : undefined}
      className={cn(
        "relative flex gap-3 border-b border-line/60 py-1 pl-3 pr-3 last:border-b-0",
        current && "bg-lavender-soft"
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ backgroundColor: logLevelPresentation[line.level].color }}
      />
      <time dateTime={line.timestamp} className="shrink-0 text-muted">
        {formatLogTimestamp(line.timestamp)}
      </time>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-ink [overflow-wrap:anywhere]">
        {line.message}
      </span>
    </li>
  );
}
