import {
  logPatternRegex,
  parseLogQuery,
  type LogEntry,
  type LogFieldSummary,
  type LogFieldsResult,
  type LogLabelOperator,
  type LogLabelSummary,
  type LogLevel,
  type LogPatternsResult,
  type LogQueryResult,
  type LogVolume,
} from "@mimorii/contracts";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { BellPlus, ChevronDown, Radio, Tags } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LogContextDialog } from "../components/logs/log-context-dialog";
import { LogDisplayMenu, LogDownloadMenu } from "../components/logs/log-display-menu";
import { CopyLinkButton, LogHistoryMenu } from "../components/logs/log-explore-actions";
import { LogFacetsPanel } from "../components/logs/log-facets-panel";
import { LogLines, type LogLineActions } from "../components/logs/log-lines";
import { LogPatternsPanel } from "../components/logs/log-patterns-panel";
import { LogQueryEditor } from "../components/logs/log-query-editor";
import { LogSavedSearchesMenu } from "../components/logs/log-saved-searches-menu";
import { LogTimeRangePicker } from "../components/logs/log-time-range-picker";
import { LogVolumeChart } from "../components/logs/log-volume-chart";
import { EmptyState, LoadingState } from "../components/page-state";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Dialog, DialogContent, DialogHeader } from "../components/ui/dialog";
import { Select } from "../components/ui/input";
import { api } from "../lib/api";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/cn";
import { dedupLogEntries, uniqueLabelNames, useLogDisplayOptions } from "../lib/log-display";
import {
  builderFromQuery,
  highlightExpressions,
  selectedLevels,
  withFieldFilter,
  withLabelMatcher,
  withLineFilter,
  withoutLabel,
  withToggledLevel,
} from "../lib/log-query-builder";
import { useLogQueryHistory } from "../lib/log-query-history";
import {
  absoluteLogTimeRange,
  isRelativeLogTimeRange,
  quickLogTimeRanges,
  readLogTimeRange,
  resolveLogTimeRange,
  type LogTimeRange,
} from "../lib/log-time-range";
import { useLiveLogs } from "../lib/use-live-logs";

type ResultView = "lines" | "patterns";

const pageSize = 500;
const historyDelay = 1_500;
const widerRangeOptions = new Set(["now-24h", "now-7d", "now-30d"]);
const refreshOptions = [0, 10_000, 30_000, 60_000, 300_000] as const;

export function LogsPage() {
  const { activeTeam } = useAuth();
  const team = activeTeam!;
  const teamId = team.id;
  const canManageSources = team.role === "owner" || team.role === "admin";
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("query") ?? "";
  const view: ResultView = searchParams.get("view") === "patterns" ? "patterns" : "lines";
  const range = readLogTimeRange(searchParams);
  const [options, updateOptions] = useLogDisplayOptions();
  const { history, remember, clear } = useLogQueryHistory(teamId);
  const [refreshInterval, setRefreshInterval] = useState(0);
  const [volumeOpen, setVolumeOpen] = useState(true);
  const [facetsOpen, setFacetsOpen] = useState(false);
  const [contextEntry, setContextEntry] = useState<LogEntry | null>(null);
  const [live, setLive] = useState(false);
  const relative = isRelativeLogTimeRange(range);
  const refetchInterval = relative && refreshInterval && !live ? refreshInterval : false;
  const order = live ? "newest" : options.order;

  const windowParams = () => {
    const resolved = resolveLogTimeRange(range);
    return { from: resolved.from.toISOString(), to: resolved.to.toISOString() };
  };
  const labels = useQuery({
    queryKey: ["logs", teamId, "labels", range.from, range.to],
    queryFn: ({ signal }) =>
      api<LogLabelSummary[]>(
        `/teams/${teamId}/logs/labels?${new URLSearchParams(windowParams())}`,
        {
          signal,
        }
      ),
    placeholderData: keepPreviousData,
    refetchInterval,
  });
  const fields = useQuery({
    queryKey: ["logs", teamId, "fields", query, range.from, range.to],
    queryFn: ({ signal }) =>
      api<LogFieldsResult>(
        `/teams/${teamId}/logs/fields?${new URLSearchParams({ query, ...windowParams() })}`,
        { signal }
      ),
    placeholderData: keepPreviousData,
    refetchInterval,
  });
  const volume = useQuery({
    queryKey: ["logs", teamId, "volume", query, range.from, range.to],
    queryFn: ({ signal }) =>
      api<LogVolume>(
        `/teams/${teamId}/logs/volume?${new URLSearchParams({ query, ...windowParams() })}`,
        { signal }
      ),
    enabled: volumeOpen,
    placeholderData: keepPreviousData,
    refetchInterval,
  });
  const patterns = useQuery({
    queryKey: ["logs", teamId, "patterns", query, range.from, range.to],
    queryFn: ({ signal }) =>
      api<LogPatternsResult>(
        `/teams/${teamId}/logs/patterns?${new URLSearchParams({ query, ...windowParams() })}`,
        { signal }
      ),
    enabled: view === "patterns",
    placeholderData: keepPreviousData,
    refetchInterval,
  });
  const entries = useInfiniteQuery({
    queryKey: ["logs", teamId, "entries", query, range.from, range.to, order],
    initialPageParam: "",
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam, signal }) => {
      const parameters = new URLSearchParams({
        query,
        limit: String(pageSize),
        direction: order === "newest" ? "backward" : "forward",
        ...windowParams(),
      });
      if (pageParam) parameters.set("cursor", pageParam);
      return api<LogQueryResult>(`/teams/${teamId}/logs?${parameters}`, { signal });
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval,
  });
  const loadedPages = useMemo(
    () => entries.data?.pages.flatMap((page) => page.entries) ?? [],
    [entries.data]
  );
  const liveLogs = useLiveLogs({
    teamId,
    query,
    enabled: live,
    newest: order === "newest" ? loadedPages[0] : loadedPages.at(-1),
  });

  useEffect(() => {
    if (!query) return;
    const timer = window.setTimeout(() => remember(query), historyDelay);
    return () => window.clearTimeout(timer);
  }, [query, remember]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== "/" || target?.closest("input, textarea, select, [contenteditable]"))
        return;
      const input = document.querySelector<HTMLElement>(
        '[aria-label="Line filter text"], [aria-label="Log query"]'
      );
      if (!input) return;
      event.preventDefault();
      input.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const loaded = useMemo(
    () => [...liveLogs.entries, ...loadedPages],
    [liveLogs.entries, loadedPages]
  );
  const displayed = useMemo(() => dedupLogEntries(loaded, options.dedup), [loaded, options.dedup]);
  const labelNames = useMemo(() => uniqueLabelNames(loaded), [loaded]);
  const [shownQuery, setShownQuery] = useState(query);
  if (!entries.isPlaceholderData && shownQuery !== query) setShownQuery(query);
  const highlights = useMemo(() => highlightExpressions(shownQuery), [shownQuery]);
  const parsedQuery = useMemo(() => {
    try {
      return builderFromQuery(parseLogQuery(query));
    } catch {
      return { matchers: [], levels: [], filters: [], fields: [] };
    }
  }, [query]);

  const latest = useRef({ query, from: range.from, to: range.to, view });
  useLayoutEffect(() => {
    latest.current = { query, from: range.from, to: range.to, view };
  });
  const apply = useCallback(
    (next: { query?: string; range?: LogTimeRange; view?: ResultView }) => {
      const state = latest.current;
      const nextRange = next.range ?? { from: state.from, to: state.to };
      const parameters = new URLSearchParams({ from: nextRange.from, to: nextRange.to });
      const nextQuery = next.query ?? state.query;
      const nextView = next.view ?? state.view;
      if (nextQuery) parameters.set("query", nextQuery);
      if (nextView === "patterns") parameters.set("view", "patterns");
      if (next.query !== undefined || next.range) setLive(false);
      setSearchParams(parameters);
    },
    [setSearchParams]
  );
  const levelSelection = useMemo(() => selectedLevels(query), [query]);
  const toggleLevel = useCallback(
    (level: LogLevel) => apply({ query: withToggledLevel(latest.current.query, level) }),
    [apply]
  );
  const zoom = useCallback(
    (from: Date, to: Date) => apply({ range: absoluteLogTimeRange(from, to) }),
    [apply]
  );
  const lineActions = useMemo<LogLineActions>(
    () => ({
      onFilterLabel: (label: string, value: string, operator: LogLabelOperator) =>
        apply({ query: withLabelMatcher(latest.current.query, { label, operator, value }) }),
      onFilterField: (field, value, operator) =>
        apply({ query: withFieldFilter(latest.current.query, { field, operator, value }) }),
      onShowContext: setContextEntry,
    }),
    [apply]
  );

  function selectLabel(label: string, value: string) {
    const active = parsedQuery.matchers.some(
      (matcher) => matcher.label === label && matcher.operator === "=" && matcher.value === value
    );
    apply({
      query: active
        ? withoutLabel(query, label)
        : withLabelMatcher(query, { label, operator: "=", value }),
    });
    setFacetsOpen(false);
  }

  function selectField(field: LogFieldSummary, value: string) {
    const numeric = field.numeric && /^-?\d+(?:\.\d+)?$/.test(value);
    apply({
      query: withFieldFilter(query, {
        field: field.name,
        operator: "=",
        value: numeric ? Number(value) : value,
      }),
    });
    setFacetsOpen(false);
  }

  const facets = (
    <LogFacetsPanel
      labels={labels.data ?? []}
      fields={fields.data?.fields ?? []}
      activeMatchers={parsedQuery.matchers}
      activeFields={parsedQuery.fields}
      onSelectLabel={selectLabel}
      onSelectField={selectField}
    />
  );
  const error = entries.error ?? volume.error ?? (view === "patterns" ? patterns.error : null);
  const currentSpan = (() => {
    const resolved = resolveLogTimeRange(range);
    return resolved.to.getTime() - resolved.from.getTime();
  })();
  const widerRanges = quickLogTimeRanges
    .filter((option) => widerRangeOptions.has(option.from))
    .filter((option) => {
      const resolved = resolveLogTimeRange({ from: option.from, to: "now" });
      return resolved.to.getTime() - resolved.from.getTime() > currentSpan;
    });
  const searching =
    (entries.isFetching && !entries.isFetchingNextPage && !entries.isLoading) ||
    (view === "patterns" && patterns.isFetching && !patterns.isLoading);
  const total = volumeOpen ? volume.data?.total : undefined;
  const loadedSummary =
    total === undefined
      ? `${loaded.length.toLocaleString()} loaded`
      : loaded.length < total
        ? `${loaded.length.toLocaleString()} of ${total.toLocaleString()}`
        : null;

  return (
    <div className="space-y-4">
      <Card data-guide-page="logs-query">
        <CardContent className="p-4">
          <LogQueryEditor
            query={query}
            labels={labels.data ?? []}
            fields={fields.data?.fields ?? []}
            running={entries.isFetching && !entries.isFetchingNextPage}
            onRun={(text) => {
              if (text === query) void entries.refetch();
              else apply({ query: text });
            }}
            tools={
              <>
                <LogSavedSearchesMenu
                  teamId={teamId}
                  query={query}
                  canManage={team.role !== "viewer"}
                  onSelect={(text) => apply({ query: text })}
                />
                <LogHistoryMenu
                  history={history}
                  onSelect={(text) => apply({ query: text })}
                  onClear={clear}
                />
                <CopyLinkButton url={window.location.href} />
              </>
            }
            actions={
              <>
                <LogTimeRangePicker range={range} onChange={(next) => apply({ range: next })} />
                <Select
                  aria-label="Refresh"
                  value={refreshInterval}
                  disabled={!relative || live}
                  onChange={(event) => setRefreshInterval(Number(event.target.value))}
                  className="h-10 w-auto min-w-32"
                >
                  {refreshOptions.map((milliseconds) => (
                    <option key={milliseconds} value={milliseconds}>
                      {milliseconds ? `Every ${refreshLabel(milliseconds)}` : "Refresh off"}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  aria-pressed={live}
                  onClick={() => setLive((current) => !current)}
                  className={cn(
                    live &&
                      liveLogs.status === "live" &&
                      "border-success/50 bg-success/10 text-success-strong",
                    live &&
                      liveLogs.status === "reconnecting" &&
                      "border-warning/50 bg-warning/10 text-warning-strong"
                  )}
                >
                  <Radio className={cn(live && liveLogs.status === "live" && "animate-pulse")} />
                  {live && liveLogs.status === "reconnecting" ? "Reconnecting" : "Live"}
                </Button>
              </>
            }
          />
        </CardContent>
      </Card>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-danger/40 bg-danger/8 px-4 py-3 text-sm text-danger"
        >
          {error.message}
        </div>
      ) : null}

      <Card>
        <CardHeader className="items-center py-3">
          <button
            type="button"
            aria-expanded={volumeOpen}
            onClick={() => setVolumeOpen((open) => !open)}
            className="flex items-center gap-2 font-display text-sm font-bold"
          >
            <ChevronDown
              className={cn("size-4 transition-transform", !volumeOpen && "-rotate-90")}
            />
            Volume
          </button>
          {volume.data ? (
            <span className="text-xs text-muted">{volume.data.total.toLocaleString()} lines</span>
          ) : null}
        </CardHeader>
        {volumeOpen ? (
          <CardContent className="pt-0">
            {volume.data ? (
              <LogVolumeChart
                volume={volume.data}
                selectedLevels={levelSelection}
                onToggleLevel={toggleLevel}
                onZoom={zoom}
              />
            ) : (
              <div className="h-44" />
            )}
          </CardContent>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <Card className="hidden self-start lg:sticky lg:top-24 lg:block">
          <CardContent className="max-h-[calc(100dvh-8rem)] overflow-y-auto p-4">
            {facets}
          </CardContent>
        </Card>

        <Card data-guide-page="logs-lines" className="relative min-w-0 overflow-hidden">
          {searching ? (
            <div
              role="progressbar"
              aria-label="Searching"
              className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-lavender/15"
            >
              <span className="block h-full w-1/3 animate-[upload-progress_1.1s_ease-in-out_infinite] rounded-full bg-lavender motion-reduce:animate-none" />
            </div>
          ) : null}
          <CardHeader className="items-center gap-2 border-b border-line py-2.5">
            <div className="flex items-center gap-3">
              <div
                role="tablist"
                aria-label="Results"
                className="flex rounded-xl border border-line p-1"
              >
                {(["lines", "patterns"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="tab"
                    aria-selected={view === option}
                    onClick={() => apply({ view: option })}
                    className={cn(
                      "h-8 rounded-lg px-3 text-xs font-semibold text-muted transition hover:text-ink",
                      view === option && "bg-lavender-soft text-violet-strong"
                    )}
                  >
                    {option === "lines" ? "Lines" : "Patterns"}
                  </button>
                ))}
              </div>
              {view === "lines" && loadedSummary ? (
                <span className="text-xs text-muted">{loadedSummary}</span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="lg:hidden"
                onClick={() => setFacetsOpen(true)}
              >
                <Tags /> Labels and fields
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to={`${appRoutes.logAlerts}?${new URLSearchParams({ new: "1", query })}`}>
                  <BellPlus /> Create alert
                </Link>
              </Button>
              {view === "lines" ? (
                <>
                  <LogDisplayMenu options={options} onChange={updateOptions} />
                  <LogDownloadMenu entries={loaded} />
                </>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {view === "patterns" ? (
              patterns.isLoading ? (
                <LoadingState />
              ) : patterns.data ? (
                <LogPatternsPanel
                  result={patterns.data}
                  onShow={(pattern) =>
                    apply({
                      query: withLineFilter(query, {
                        operator: "|~",
                        value: logPatternRegex(pattern),
                      }),
                      view: "lines",
                    })
                  }
                  onExclude={(pattern) =>
                    apply({
                      query: withLineFilter(query, {
                        operator: "!~",
                        value: logPatternRegex(pattern),
                      }),
                    })
                  }
                />
              ) : null
            ) : entries.isLoading ? (
              <LoadingState />
            ) : displayed.length ? (
              <LogLines
                entries={displayed}
                resultKey={`${shownQuery}|${range.from}|${range.to}|${order}`}
                options={options}
                labelNames={labelNames}
                highlights={highlights}
                actions={lineActions}
              />
            ) : (
              <div className="p-5">
                <EmptyState
                  title="No logs in this time range"
                  illustration="empty"
                  action={
                    widerRanges.length ? (
                      <div className="flex flex-wrap justify-center gap-2">
                        {widerRanges.map((option) => (
                          <Button
                            key={option.from}
                            variant="outline"
                            onClick={() => apply({ range: { from: option.from, to: "now" } })}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    ) : canManageSources && !query ? (
                      <Button asChild variant="outline">
                        <Link to={appRoutes.logSources}>Connect a source</Link>
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            )}
          </CardContent>
          {view === "lines" && entries.hasNextPage && !live ? (
            <div className="flex justify-center border-t border-line p-3">
              <Button
                variant="outline"
                size="sm"
                disabled={entries.isFetchingNextPage}
                onClick={() => void entries.fetchNextPage()}
              >
                {order === "newest" ? "Load older" : "Load newer"}
              </Button>
            </div>
          ) : null}
        </Card>
      </div>

      <Dialog open={facetsOpen} onOpenChange={setFacetsOpen}>
        <DialogContent presentation="drawer" className="lg:hidden">
          <DialogHeader
            title="Labels and fields"
            className="mb-0 flex h-14 items-center border-b border-line px-5 pr-12"
          />
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{facets}</div>
        </DialogContent>
      </Dialog>
      {contextEntry ? (
        <LogContextDialog
          teamId={teamId}
          entry={contextEntry}
          onOpenChange={(open) => {
            if (!open) setContextEntry(null);
          }}
        />
      ) : null}
    </div>
  );
}

function refreshLabel(milliseconds: number): string {
  return milliseconds >= 60_000 ? `${milliseconds / 60_000}m` : `${milliseconds / 1_000}s`;
}
