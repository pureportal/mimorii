import { appRoutes, type AuditEventSummary } from "@mimorii/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ClipboardList, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ExportMenu } from "../components/export-menu";
import { ErrorState, LoadingState } from "../components/page-state";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatCount, formatRelative } from "../lib/format";

const PAGE_SIZE = 20;
const acronyms: Record<string, string> = { api: "API", oauth: "OAuth", slo: "SLO" };
const subjectLinks: Partial<Record<string, (id: string) => string>> = {
  resource: appRoutes.resource,
  check: appRoutes.check,
};

export function AuditPage() {
  const { activeTeam } = useAuth();
  const teamId = activeTeam!.id;
  const [search, setSearch] = useState("");
  const events = useInfiniteQuery({
    queryKey: ["audit", teamId],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      api<AuditEventSummary[]>(
        `/teams/${teamId}/audit?limit=${PAGE_SIZE}${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ""}`
      ),
    getNextPageParam: (page) => {
      const last = page.at(-1);
      return page.length === PAGE_SIZE && last ? `${last.createdAt}|${last.id}` : undefined;
    },
  });

  if (events.isLoading) return <LoadingState />;
  if (events.isError) return <ErrorState retry={() => void events.refetch()} />;
  const rows = events.data?.pages.flat() ?? [];
  const query = search.trim().toLowerCase();
  const visible = query
    ? rows.filter((event) =>
        [humanize(event.action), event.actorName ?? "System", humanize(event.subjectType)]
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
    : rows;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              type="search"
              aria-label="Search audit events"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search events"
              className="pl-10"
            />
          </div>
          <p className="text-sm text-muted">
            {query
              ? `${formatCount(visible.length, "event")} of ${rows.length.toLocaleString()}`
              : formatCount(rows.length, "event")}
          </p>
        </div>
        <ExportMenu
          choices={[{ dataset: "audit-log", label: "Audit log" }]}
          parameters={{ from: new Date(Date.now() - 90 * 86_400_000).toISOString() }}
        />
      </div>
      <Card data-guide-page="audit-events">
        <CardHeader>
          <h3 className="font-display font-bold">Events</h3>
        </CardHeader>
        <CardContent className="divide-y divide-line">
          {visible.map((event) => {
            const link = event.subjectId
              ? subjectLinks[event.subjectType]?.(event.subjectId)
              : null;
            return (
              <div key={event.id} className="flex items-start gap-3 py-4 first:pt-1">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink/5 text-muted">
                  <ClipboardList className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                    <p className="text-sm font-semibold">{humanize(event.action)}</p>
                    <time dateTime={event.createdAt} className="text-xs text-muted">
                      {formatRelative(event.createdAt)}
                    </time>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {event.actorName ?? "System"} ·{" "}
                    {link ? (
                      <Link to={link} className="font-semibold text-violet-strong hover:underline">
                        {humanize(event.subjectType)}
                      </Link>
                    ) : (
                      humanize(event.subjectType)
                    )}
                  </p>
                </div>
              </div>
            );
          })}
          {!visible.length ? (
            <div className="grid h-40 place-items-center text-sm text-muted">
              {query ? "No matching events" : "No audit events"}
            </div>
          ) : null}
        </CardContent>
      </Card>
      {events.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => void events.fetchNextPage()}
            disabled={events.isFetchingNextPage}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function humanize(identifier: string): string {
  const words = identifier
    .split(/[._]/)
    .filter(Boolean)
    .map((word) => acronyms[word] ?? word);
  const sentence = words.join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
