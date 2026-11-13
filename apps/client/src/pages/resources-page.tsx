import type { AgentSummary, MonitorStatus, ResourceSummary } from "@mimorii/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AddResourceDialog } from "../components/add-resource-dialog";
import { ExportMenu } from "../components/export-menu";
import { EmptyState, ErrorState, LoadingState } from "../components/page-state";
import { ResourceImage } from "../components/resource-image";
import { StatusReason, resourceReason } from "../components/status-reason";
import { StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input, Select } from "../components/ui/input";
import { api } from "../lib/api";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/cn";
import { formatRelative } from "../lib/format";
import { monitorStatusAccents, monitorStatusPriority } from "../lib/monitor-status";
import { resourceKindLabels } from "../lib/resource-option-labels";

export function ResourcesPage() {
  const { activeTeam } = useAuth();
  const teamId = activeTeam!.id;
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState<ResourceStatusFilter | "all">("all");
  const [sort, setSort] = useState<ResourceSort>("attention");
  const queryClient = useQueryClient();
  const resources = useQuery({
    queryKey: ["resources", teamId],
    queryFn: () => api<ResourceSummary[]>(`/teams/${teamId}/resources`),
    refetchInterval: 30_000,
  });
  const agents = useQuery({
    queryKey: ["agents", teamId],
    queryFn: () => api<AgentSummary[]>(`/teams/${teamId}/agents`),
  });
  const open = searchParams.get("new") === "1";
  const searched = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (resources.data ?? []).filter(
      (resource) =>
        (kind === "all" || resource.kind === kind) &&
        `${resource.name} ${resource.kind} ${resource.tags.join(" ")}`.toLowerCase().includes(query)
    );
  }, [kind, resources.data, search]);
  const filtered = useMemo(
    () =>
      searched
        .filter(
          (resource) =>
            status === "all" ||
            (status === "maintenance" ? resource.inMaintenance : resource.status === status)
        )
        .toSorted(resourceComparators[sort]),
    [searched, sort, status]
  );
  const statusCounts = useMemo(() => {
    const counts = new Map<ResourceStatusFilter, number>();
    for (const resource of searched) {
      counts.set(resource.status, (counts.get(resource.status) ?? 0) + 1);
      if (resource.inMaintenance) counts.set("maintenance", (counts.get("maintenance") ?? 0) + 1);
    }
    return resourceStatusFilters.flatMap((value) => {
      const count = counts.get(value);
      return count ? [{ value, count }] : [];
    });
  }, [searched]);
  const hasFilters = Boolean(search.trim()) || kind !== "all" || status !== "all";

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["resources", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["checks", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["overview", teamId] }),
    ]);
  };

  if (resources.isLoading) return <LoadingState />;
  if (resources.isError) return <ErrorState retry={() => void resources.refetch()} />;

  return (
    <div className="space-y-5">
      <div data-guide-page="resources-toolbar" className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative w-full min-w-48 md:w-auto md:max-w-md md:flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input
                type="search"
                aria-label="Search resources"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search resources"
                className="pl-10"
              />
            </div>
            <Select
              aria-label="Resource kind"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              className="w-[calc(50%-0.25rem)] md:w-36"
            >
              <option value="all">All kinds</option>
              <option value="host">Hosts</option>
              <option value="device">Devices</option>
              <option value="service">Services</option>
            </Select>
            <Select
              aria-label="Sort resources"
              value={sort}
              onChange={(event) =>
                setSort(resourceSorts.find((value) => value === event.target.value) ?? "attention")
              }
              className="w-[calc(50%-0.25rem)] md:w-44"
            >
              <option value="attention">Needs attention</option>
              <option value="name">Name</option>
              <option value="checked">Last check</option>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <ExportMenu choices={[{ dataset: "resources", label: "Resources" }]} />
            <Button variant="coral" onClick={() => setSearchParams({ new: "1" })}>
              <Plus /> Add resource
            </Button>
          </div>
        </div>
        <div role="group" aria-label="Resource state" className="flex flex-wrap gap-1.5">
          <StatusFilterChip
            label="All"
            count={searched.length}
            active={status === "all"}
            onClick={() => setStatus("all")}
          />
          {statusCounts.map(({ value, count }) => (
            <StatusFilterChip
              key={value}
              label={resourceStatusLabels[value]}
              count={count}
              tone={value}
              active={status === value}
              onClick={() => setStatus(status === value ? "all" : value)}
            />
          ))}
        </div>
      </div>

      {filtered.length ? (
        <div data-guide-page="resources-list" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((resource) => (
            <ResourceCard key={resource.id} resource={resource} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={hasFilters ? "No matching resources" : "No resources yet"}
          illustration={hasFilters ? undefined : "empty"}
          action={
            hasFilters ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setKind("all");
                  setStatus("all");
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button variant="coral" size="sm" onClick={() => setSearchParams({ new: "1" })}>
                <Plus /> Add resource
              </Button>
            )
          }
        />
      )}

      <AddResourceDialog
        open={open}
        onOpenChange={(value) => setSearchParams(value ? { new: "1" } : {})}
        teamId={teamId}
        agents={(agents.data ?? []).filter((agent) => agent.kind === "desktop")}
        onCreated={async () => {
          await invalidate();
          toast.success("Resource added");
        }}
      />
    </div>
  );
}

const resourceStatusFilters = [
  "down",
  "critical",
  "warning",
  "degraded",
  "pending",
  "up",
  "okay",
  "paused",
  "maintenance",
] as const satisfies readonly (MonitorStatus | "maintenance")[];
type ResourceStatusFilter = (typeof resourceStatusFilters)[number];

const resourceStatusLabels: Record<ResourceStatusFilter, string> = {
  down: "Down",
  critical: "Critical",
  warning: "Warning",
  degraded: "Degraded",
  pending: "Pending",
  up: "Up",
  okay: "Okay",
  paused: "Paused",
  maintenance: "Maintenance",
};

const statusDots: Record<ResourceStatusFilter, string> = {
  down: "bg-danger",
  critical: "bg-danger",
  warning: "bg-warning",
  degraded: "bg-warning",
  pending: "bg-lavender",
  up: "bg-success",
  okay: "bg-success",
  paused: "bg-muted",
  maintenance: "bg-violet-strong",
};

function StatusFilterChip({
  label,
  count,
  tone,
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone?: ResourceStatusFilter;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition",
        active
          ? "border-lavender bg-lavender-soft text-violet-strong"
          : "border-line bg-surface text-muted hover:border-lavender hover:text-ink"
      )}
    >
      {tone ? (
        <span aria-hidden="true" className={cn("size-2 rounded-full", statusDots[tone])} />
      ) : null}
      {label} <span className="tabular-nums text-ink/70">{count}</span>
    </button>
  );
}

const resourceSorts = ["attention", "name", "checked"] as const;
type ResourceSort = (typeof resourceSorts)[number];

const resourceComparators: Record<
  ResourceSort,
  (left: ResourceSummary, right: ResourceSummary) => number
> = {
  attention: (left, right) =>
    monitorStatusPriority[left.status] - monitorStatusPriority[right.status] ||
    left.name.localeCompare(right.name),
  name: (left, right) => left.name.localeCompare(right.name),
  checked: (left, right) => (right.lastCheckedAt ?? "").localeCompare(left.lastCheckedAt ?? ""),
};

function ResourceCard({ resource }: { resource: ResourceSummary }) {
  const accent = monitorStatusAccents[resource.status];
  return (
    <Link
      to={appRoutes.resource(resource.id)}
      className="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-coral-strong"
    >
      <Card className="group relative h-full overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-lavender hover:shadow-[0_18px_40px_-26px_rgba(68,54,128,.45)]">
        {accent ? (
          <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-1", accent)} />
        ) : null}
        <div className="flex items-start gap-4">
          <ResourceImage resource={resource} className="size-11" />
          <div className="min-w-0 flex-1">
            <h2 className="line-clamp-2 break-words font-display font-bold">{resource.name}</h2>
            <p className="mt-1 truncate text-sm text-muted">
              {resource.agent?.platform ?? resourceKindLabels[resource.kind]}
            </p>
            <StatusReason
              reason={resourceReason(resource)}
              status={resource.status}
              className="mt-1.5"
            />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <StatusBadge status={resource.status} />
            {resource.inMaintenance ? <StatusBadge status="maintenance" /> : null}
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
          <div>
            <p className="text-xs text-muted">Passing checks</p>
            <p className="mt-1 font-semibold">
              {resource.checksTotal
                ? `${resource.checksPassing} / ${resource.checksTotal}`
                : "No checks"}
            </p>
            {resource.checksTotal ? (
              <div
                role="meter"
                aria-label={`Passing checks for ${resource.name}`}
                aria-valuemin={0}
                aria-valuemax={resource.checksTotal}
                aria-valuenow={resource.checksPassing}
                className="mt-2 h-1 overflow-hidden rounded-full bg-success/15"
              >
                <div
                  className="h-full rounded-full bg-success"
                  style={{ width: `${(resource.checksPassing / resource.checksTotal) * 100}%` }}
                />
              </div>
            ) : null}
          </div>
          {!resource.checksTotal && resource.agent ? (
            <div>
              <p className="text-xs text-muted">Agent last seen</p>
              <p className="mt-1 font-semibold">
                {resource.agent.lastSeenAt
                  ? formatRelative(resource.agent.lastSeenAt)
                  : "Never connected"}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-xs text-muted">Last check</p>
              <p className="mt-1 font-semibold">{formatRelative(resource.lastCheckedAt)}</p>
            </div>
          )}
        </div>
        {resource.tags.length ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {resource.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-lg bg-ink/5 px-2 py-1 text-[11px] font-medium text-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </Card>
    </Link>
  );
}
