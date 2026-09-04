import type { CheckSummary, ResourceSummary } from "@mimorii/contracts";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
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
import { CheckStatusIndicator } from "../components/check-status-indicator";
import { EmptyState, ErrorState, LoadingState } from "../components/page-state";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { ConfirmationDialog } from "../components/ui/confirmation-dialog";
import { Input, Select } from "../components/ui/input";
import { api, jsonBody } from "../lib/api";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { checkPassingLabel } from "../lib/check-health";
import { formatPercent, formatRelative } from "../lib/format";
import { resourceOptionLabels } from "../lib/resource-option-labels";

export function ChecksPage() {
  const { activeTeam } = useAuth();
  const teamId = activeTeam!.id;
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
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

  const resourceNames = useMemo(() => resourceOptionLabels(resources.data ?? []), [resources.data]);
  const filtered = useMemo(
    () =>
      checks.data?.filter(
        (check) =>
          (!resourceId || check.resourceId === resourceId) &&
          (status === "all" || check.status === status) &&
          `${check.name} ${resourceNames.get(check.resourceId) ?? ""} ${check.type}`
            .toLowerCase()
            .includes(search.toLowerCase())
      ) ?? [],
    [checks.data, resourceId, resourceNames, search, status]
  );
  const hasFilters = Boolean(search.trim()) || Boolean(resourceId) || status !== "all";
  const visibleChecks = filtered.slice(0, visibleCount);
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
          <Select
            aria-label="State"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="w-32"
          >
            <option value="all">All states</option>
            <option value="up">Up</option>
            <option value="degraded">Degraded</option>
            <option value="okay">Okay</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
            <option value="down">Down</option>
            <option value="paused">Paused</option>
            <option value="pending">Pending</option>
          </Select>
          <p className="w-full self-center text-sm text-muted sm:w-auto">
            {filtered.length.toLocaleString()} {filtered.length === 1 ? "check" : "checks"}
          </p>
        </div>
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

      {filtered.length ? (
        <Card data-guide-page="checks-list">
          <CardContent className="divide-y divide-line p-0">
            {visibleChecks.map((check) => (
              <article
                key={check.id}
                className="grid grid-cols-[minmax(0,1fr)_2.75rem_2.5rem] gap-x-3 gap-y-4 px-4 py-4 transition-colors hover:bg-ink/[.018] sm:px-5 lg:grid-cols-[minmax(240px,1fr)_2.75rem_minmax(210px,.8fr)_110px_135px_2.5rem] lg:items-center"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
                    <Activity className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{check.name}</p>
                    <p className="mt-1 truncate text-xs text-muted">
                      {resourceNames.get(check.resourceId)} · {checkTypeLabel(check.type)}
                    </p>
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
    </div>
  );
}

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

function checkTypeLabel(type: CheckSummary["type"]): string {
  return (
    {
      http: "HTTP",
      tcp: "TCP port",
      dns: "DNS record",
      icmp: "ICMP ping",
      wan: "WAN reachability",
      host: "Host health",
      disk: "Disk usage",
      docker: "Docker",
      database: "Database",
    } as const
  )[type];
}
