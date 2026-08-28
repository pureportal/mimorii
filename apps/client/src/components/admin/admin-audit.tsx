import type { GlobalAuditEventSummary } from "@mimorii/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { ErrorState, LoadingState } from "../page-state";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { api } from "../../lib/api";
import { formatRelative } from "../../lib/format";

const PAGE_SIZE = 20;

export function AdminAudit() {
  const events = useInfiniteQuery({
    queryKey: ["global-admin", "audit"],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      api<GlobalAuditEventSummary[]>(
        `/admin/audit?limit=${PAGE_SIZE}${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ""}`
      ),
    getNextPageParam: (page) => {
      const last = page.at(-1);
      return page.length === PAGE_SIZE && last ? `${last.createdAt}|${last.id}` : undefined;
    },
  });
  if (events.isLoading) return <LoadingState />;
  if (events.isError) return <ErrorState retry={() => void events.refetch()} />;
  const rows = events.data?.pages.flat() ?? [];

  return (
    <Card>
      <CardHeader>
        <h3 className="font-display font-bold">Platform audit</h3>
      </CardHeader>
      <CardContent className="divide-y divide-line">
        {rows.map((event) => (
          <div key={event.id} className="flex items-start gap-3 py-4 first:pt-1">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink/5 text-muted">
              <ClipboardList className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                <p className="font-mono text-sm font-semibold">{event.action}</p>
                <span className="text-xs text-muted">{formatRelative(event.createdAt)}</span>
              </div>
              <p className="mt-1 text-xs text-muted">
                {event.actorName ?? "System"} · {event.subjectType}
                {event.subjectId ? ` · ${event.subjectId}` : ""}
              </p>
            </div>
          </div>
        ))}
        {!rows.length ? (
          <div className="grid h-40 place-items-center text-sm text-muted">No audit events</div>
        ) : null}
      </CardContent>
      {events.hasNextPage ? (
        <div className="flex justify-center border-t border-line p-4">
          <Button
            variant="outline"
            onClick={() => void events.fetchNextPage()}
            disabled={events.isFetchingNextPage}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
