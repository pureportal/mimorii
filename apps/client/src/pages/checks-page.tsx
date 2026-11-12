import {
  checkTypes,
  type CheckBulkAction,
  type CheckBulkResult,
  type CheckSummary,
  type MonitorStatus,
  type ResourceSummary,
} from "@mimorii/contracts";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckDetailsDialog } from "../components/check-details-dialog";
import { CheckDialog, type CheckPayload } from "../components/check-dialog";
import { CheckHealthSummary } from "../components/check-health-summary";
import { StatusReason, checkReason } from "../components/status-reason";
import { CheckStatusIndicator } from "../components/check-status-indicator";
import { CheckTypeIcon } from "../components/check-type-icon";
import { ExportMenu } from "../components/export-menu";
import { EmptyState, ErrorState, LoadingState } from "../components/page-state";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { ConfirmationDialog } from "../components/ui/confirmation-dialog";
import { Input, Select } from "../components/ui/input";
import { api, jsonBody } from "../lib/api";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { checkPassingLabel } from "../lib/check-health";
import { checkTypeLabels } from "../lib/check-types";
import { formatCount, formatPercent, formatRelative } from "../lib/format";
import { monitorStatusPriority } from "../lib/monitor-status";
import { resourceOptionLabels } from "../lib/resource-option-labels";

export function ChecksPage() {
  const { activeTeam } = useAuth();
  const teamId = activeTeam!.id;
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState<CheckSort>("attention");
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [bulkDelete, setBulkDelete] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<CheckSummary | null>(null);
  const [deleteCheck, setDeleteCheck] = useState<CheckSummary | null>(null);
  const resourceId = searchParams.get("resourceId") ?? "";
  const detailsCheckId = searchParams.get("checkId");
  const checks = useQuery({
    queryKey: ["checks", teamId],
    queryFn: () => api<CheckSummary[]>(`/teams/${teamId}/checks`),
    refetchInterval: 30_000,
  });
  const resources = useQuery({
    queryKey: ["resources", teamId],
    queryFn: () => api<ResourceSummary[]>(`/teams/${teamId}/resources`),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["checks", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["resources", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["overview", teamId] }),
    ]);
  };

  const save = async (payload: CheckPayload) => {
    await api(`/teams/${teamId}/checks${selected ? `/${selected.id}` : ""}`, {
      method: selected ? "PATCH" : "POST",
      ...jsonBody(payload),
    });
    await refresh();
    toast.success(selected ? "Check updated" : "Check added");
  };

  const run = useMutation({
    mutationFn: (id: string) => api(`/teams/${teamId}/checks/${id}/run`, { method: "POST" }),
    onSuccess: async () => {
      await refresh();
      toast.success("Check started");
    },
    onError: (error) => toast.error(error.message),
  });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api(`/teams/${teamId}/checks/${id}`, { method: "PATCH", ...jsonBody({ enabled }) }),
    onSuccess: refresh,
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/teams/${teamId}/checks/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refresh();
      toast.success("Check deleted");
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setDeleteCheck(null),
  });
  const bulk = useMutation({
    mutationFn: ({ action, ids }: { action: CheckBulkAction; ids: string[] }) =>
      api<CheckBulkResult>(`/teams/${teamId}/checks/bulk`, {
        method: "POST",
        ...jsonBody({ action, ids }),
      }),
    onSuccess: async (result, { action }) => {
      setSelection(new Set());
      await refresh();
      toast.success(`${formatCount(result.affected, "check")} ${bulkOutcomes[action]}`);
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setBulkDelete(false),
  });

  const resourceNames = useMemo(() => resourceOptionLabels(resources.data ?? []), [resources.data]);
  const scoped = useMemo(
    () =>
      checks.data?.filter(
        (check) =>
          (!resourceId || check.resourceId === resourceId) &&
          (type === "all" || check.type === type) &&
          `${check.name} ${resourceNames.get(check.resourceId) ?? ""} ${checkTypeLabels[check.type]}`
            .toLowerCase()
            .includes(search.toLowerCase())
      ) ?? [],
    [checks.data, resourceId, resourceNames, search, type]
  );
  const filtered = useMemo(
    () =>
      scoped
        .filter((check) => status === "all" || check.status === status)
        .toSorted(checkComparators[sort]),
    [scoped, sort, status]
  );
  const stateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const check of scoped) counts.set(check.status, (counts.get(check.status) ?? 0) + 1);
    return counts;
  }, [scoped]);
  const presentTypes = checkTypes.filter((candidate) =>
    checks.data?.some((check) => check.type === candidate)
  );
  const hasFilters =
    Boolean(search.trim()) || Boolean(resourceId) || status !== "all" || type !== "all";
  const visibleChecks = filtered.slice(0, visibleCount);
  const selectedIds = filtered.flatMap((check) => (selection.has(check.id) ? [check.id] : []));
  const canManage = activeTeam!.role !== "viewer";
  const canDelete = activeTeam!.role === "owner" || activeTeam!.role === "admin";
  const toggleSelected = (id: string) =>
    setSelection((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const detailsCheck = checks.data?.find((check) => check.id === detailsCheckId) ?? null;

  const openCheckDetails = (checkId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("checkId", checkId);
    setSearchParams(next);
  };

  const closeCheckDetails = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("checkId");
    setSearchParams(next, { replace: true });
  };

  if (checks.isLoading || resources.isLoading) return <LoadingState />;
  if (checks.isError || resources.isError)
    return (
      <ErrorState
        retry={() => {
          void checks.refetch();
          void resources.refetch();
        }}
      />
    );

  return (
    <div className="space-y-6">
      <div
        data-guide-page="checks-filters"
        className="flex flex-col justify-between gap-3 sm:flex-row"
      >
        <div className="flex flex-1 flex-wrap gap-2">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              type="search"
              aria-label="Search checks"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search checks"
              className="pl-10"
            />
          </div>
          <Select
            aria-label="Resource"
            value={resourceId}
            onChange={(event) => {
              const next = new URLSearchParams(searchParams);
              if (event.target.value) next.set("resourceId", event.target.value);
              else next.delete("resourceId");
              setSearchParams(next, { replace: true });
            }}
            className="w-44"
          >
            <option value="">All resources</option>
            {resources.data?.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resourceNames.get(resource.id)}
              </option>
            ))}
          </Select>
          {presentTypes.length > 1 ? (
            <Select
              aria-label="Type"
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="w-40"
            >
              <option value="all">All types</option>
              {presentTypes.map((value) => (
                <option key={value} value={value}>
                  {checkTypeLabels[value]}
                </option>
              ))}
            </Select>
          ) : null}
          <Select
            aria-label="State"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="w-36"
          >
            <option value="all">All states</option>
            {stateOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({stateCounts.get(option.value) ?? 0})
              </option>
            ))}
          </Select>
          <Select
            aria-label="Sort checks"
            value={sort}
            onChange={(event) =>
              setSort(checkSorts.find((value) => value === event.target.value) ?? "attention")
            }
            className="w-48"
          >
            <option value="attention">Needs attention</option>
            <option value="name">Name</option>
            <option value="checked">Last run</option>
            <option value="availability">Lowest availability</option>
          </Select>
          <p className="w-full self-center text-sm text-muted sm:w-auto">
            {filtered.length.toLocaleString()} {filtered.length === 1 ? "check" : "checks"}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <ExportMenu
            choices={[{ dataset: "checks", label: "Checks" }]}
            parameters={{ resourceId }}
          />
          <Button
            variant="coral"
            onClick={() => {
              setSelected(null);
              setDialogOpen(true);
            }}
            disabled={!resources.data?.length}
          >
            <Plus /> Add check
          </Button>
        </div>
      </div>

      {filtered.length ? (
        <Card data-guide-page="checks-list">
          <CardContent className="divide-y divide-line p-0">
            {canManage ? (
              <div className="flex min-h-12 flex-wrap items-center gap-2 px-4 py-2 sm:px-5">
                <label className="flex items-center gap-2.5 text-sm font-medium">
                  <input
                    type="checkbox"
                    aria-label="Select all checks"
                    checked={selectedIds.length === filtered.length}
                    ref={(element) => {
                      if (element) {
                        element.indeterminate =
                          selectedIds.length > 0 && selectedIds.length < filtered.length;
                      }
                    }}
                    onChange={() =>
                      setSelection(
                        new Set(
                          selectedIds.length === filtered.length
                            ? []
                            : filtered.map((check) => check.id)
                        )
                      )
                    }
                    className="size-4 accent-[var(--color-lavender)]"
                  />
                  {selectedIds.length ? `${selectedIds.length.toLocaleString()} selected` : null}
                </label>
                {selectedIds.length ? (
                  <div className="ml-auto flex flex-wrap gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={bulk.isPending}
                      onClick={() => bulk.mutate({ action: "run", ids: selectedIds })}
                    >
                      <RefreshCw /> Run now
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={bulk.isPending}
                      onClick={() => bulk.mutate({ action: "pause", ids: selectedIds })}
                    >
                      <Pause /> Pause
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={bulk.isPending}
                      onClick={() => bulk.mutate({ action: "enable", ids: selectedIds })}
                    >
                      <Play /> Enable
                    </Button>
                    {canDelete ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:text-danger"
                        disabled={bulk.isPending}
                        onClick={() => setBulkDelete(true)}
                      >
                        <Trash2 /> Delete
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            {visibleChecks.map((check) => (
              <article
                key={check.id}
                className="grid grid-cols-[minmax(0,1fr)_2.75rem_2.5rem] gap-x-3 gap-y-4 px-4 py-4 transition-colors hover:bg-ink/[.018] sm:px-5 lg:grid-cols-[minmax(240px,1fr)_2.75rem_minmax(210px,.8fr)_110px_135px_2.5rem] lg:items-center"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {canManage ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${check.name}`}
                      checked={selection.has(check.id)}
                      onChange={() => toggleSelected(check.id)}
                      className="size-4 shrink-0 accent-[var(--color-lavender)]"
                    />
                  ) : null}
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-xl bg-lavender-soft text-violet-strong"
                    title={checkTypeLabels[check.type]}
                  >
                    <CheckTypeIcon type={check.type} className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{check.name}</p>
                    <p className="mt-1 truncate text-xs text-muted">
                      {resourceNames.get(check.resourceId)} · {checkTypeLabels[check.type]}
                    </p>
                    <StatusReason
                      reason={checkReason(check)}
                      status={check.status}
                      className="mt-1"
                    />
                  </div>
                </div>
                <div
                  data-check-status-column
                  className="col-start-2 row-start-1 grid place-items-center self-center"
                >
                  <CheckStatusIndicator
                    checkName={check.name}
                    status={check.status}
                    type={check.type}
                  />
                </div>
                <CheckHealthSummary check={check} className="col-span-3 min-w-0 lg:col-span-1" />
                <div className="col-span-3 grid grid-cols-2 gap-3 lg:contents">
                  <CheckStat
                    label={`${checkPassingLabel(check.type)} · 24h`}
                    value={formatPercent(check.passing24h)}
                  />
                  <CheckStat label="Last run" value={formatRelative(check.lastCheckedAt)} />
                </div>
                <div className="col-start-3 row-start-1 self-start justify-self-end lg:col-auto lg:row-auto">
                  <CheckActions
                    check={check}
                    onDetails={() => openCheckDetails(check.id)}
                    onRun={() => run.mutate(check.id)}
                    onEdit={() => {
                      setSelected(check);
                      setDialogOpen(true);
                    }}
                    onToggle={() => toggle.mutate({ id: check.id, enabled: !check.enabled })}
                    onDelete={() => setDeleteCheck(check)}
                  />
                </div>
              </article>
            ))}
            {visibleChecks.length < filtered.length ? (
              <div className="flex justify-center p-4">
                <Button variant="outline" onClick={() => setVisibleCount((count) => count + 20)}>
                  Load more
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          title={
            !resources.data?.length
              ? "Add a resource first"
              : hasFilters
                ? "No matching checks"
                : "No checks yet"
          }
          illustration={!resources.data?.length || !checks.data?.length ? "empty" : undefined}
          action={
            !resources.data?.length ? (
              <Button asChild variant="coral" size="sm">
                <Link to={appRoutes.newResource}>Add resource</Link>
              </Button>
            ) : hasFilters ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatus("all");
                  setType("all");
                  const next = new URLSearchParams(searchParams);
                  next.delete("resourceId");
                  setSearchParams(next, { replace: true });
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button
                variant="coral"
                size="sm"
                onClick={() => {
                  setSelected(null);
                  setDialogOpen(true);
                }}
              >
                <Plus /> Add check
              </Button>
            )
          }
        />
      )}

      <CheckDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        resources={resources.data ?? []}
        initial={selected}
        defaultResourceId={resourceId}
        onSubmit={save}
      />
      <CheckDetailsDialog
        open={Boolean(detailsCheck)}
        onOpenChange={(open) => {
          if (!open) closeCheckDetails();
        }}
        teamId={teamId}
        check={detailsCheck}
        resourceName={detailsCheck ? resourceNames.get(detailsCheck.resourceId) : undefined}
      />
      <ConfirmationDialog
        open={Boolean(deleteCheck)}
        onOpenChange={(open) => {
          if (!open) setDeleteCheck(null);
        }}
        title={`Delete ${deleteCheck?.name ?? "check"}?`}
        description="Its monitoring history will also be deleted."
        confirmLabel="Delete check"
        pending={remove.isPending}
        onConfirm={() => {
          if (deleteCheck) remove.mutate(deleteCheck.id);
        }}
      />
      <ConfirmationDialog
        open={bulkDelete}
        onOpenChange={setBulkDelete}
        title={`Delete ${formatCount(selectedIds.length, "check")}?`}
        description="Their monitoring history will also be deleted."
        confirmLabel="Delete checks"
        pending={bulk.isPending}
        onConfirm={() => bulk.mutate({ action: "delete", ids: selectedIds })}
      />
    </div>
  );
}

const checkSorts = ["attention", "name", "checked", "availability"] as const;
type CheckSort = (typeof checkSorts)[number];

const checkComparators: Record<CheckSort, (left: CheckSummary, right: CheckSummary) => number> = {
  attention: (left, right) =>
    monitorStatusPriority[left.status] - monitorStatusPriority[right.status] ||
    left.name.localeCompare(right.name),
  name: (left, right) => left.name.localeCompare(right.name),
  checked: (left, right) => (right.lastCheckedAt ?? "").localeCompare(left.lastCheckedAt ?? ""),
  availability: (left, right) => (left.passing24h ?? 101) - (right.passing24h ?? 101),
};

const stateOptions: Array<{ value: MonitorStatus; label: string }> = [
  { value: "up", label: "Up" },
  { value: "degraded", label: "Degraded" },
  { value: "okay", label: "Okay" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
  { value: "down", label: "Down" },
  { value: "paused", label: "Paused" },
  { value: "pending", label: "Pending" },
];

const bulkOutcomes: Record<CheckBulkAction, string> = {
  run: "queued",
  pause: "paused",
  enable: "enabled",
  delete: "deleted",
};

function CheckStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 lg:block">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function CheckActions({
  check,
  onDetails,
  onRun,
  onEdit,
  onToggle,
  onDelete,
}: {
  check: CheckSummary;
  onDetails: () => void;
  onRun: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${check.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-44 rounded-xl border border-line bg-surface p-1.5 shadow-xl"
        >
          <CheckAction icon={<Eye />} label="View details" onSelect={onDetails} />
          <CheckAction icon={<RefreshCw />} label="Run now" onSelect={onRun} />
          <CheckAction icon={<Pencil />} label="Edit" onSelect={onEdit} />
          <CheckAction
            icon={check.enabled ? <Pause /> : <Play />}
            label={check.enabled ? "Pause" : "Enable"}
            onSelect={onToggle}
          />
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <CheckAction icon={<Trash2 />} label="Delete" onSelect={onDelete} danger />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function CheckAction({
  icon,
  label,
  onSelect,
  danger = false,
}: {
  icon: ReactNode;
  label: string;
  onSelect: () => void;
  danger?: boolean;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={`flex cursor-default items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-ink/5 ${danger ? "text-danger" : "text-ink"} [&_svg]:size-4`}
    >
      {icon}
      {label}
    </DropdownMenu.Item>
  );
}
