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
import { EmptyState, ErrorState, LoadingState } from "../components/page-state";
import { StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { ConfirmationDialog } from "../components/ui/confirmation-dialog";
import { Input, Select } from "../components/ui/input";
import { api, jsonBody } from "../lib/api";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { formatPercent, formatRelative } from "../lib/format";

export function ChecksPage() {
  const { activeTeam } = useAuth();
  const teamId = activeTeam!.id;
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<CheckSummary | null>(null);
  const [detailsCheck, setDetailsCheck] = useState<CheckSummary | null>(null);
  const [deleteCheck, setDeleteCheck] = useState<CheckSummary | null>(null);
  const resourceId = searchParams.get("resourceId") ?? "";
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

  const resourceNames = useMemo(
    () => new Map(resources.data?.map((resource) => [resource.id, resource.name])),
    [resources.data]
  );
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
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
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
                {resource.name}
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
            <option value="okay">Okay</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
            <option value="down">Down</option>
            <option value="paused">Paused</option>
            <option value="pending">Pending</option>
          </Select>
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
            {filtered.map((check) => (
              <article
                key={check.id}
                className="grid gap-4 px-5 py-4 transition-colors hover:bg-ink/[.018] lg:grid-cols-[minmax(240px,1fr)_minmax(210px,.8fr)_110px_135px_auto] lg:items-center"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
                    <Activity className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold">{check.name}</p>
                      <StatusBadge status={check.status} />
                    </div>
                    <p className="mt-1 truncate text-xs text-muted">
                      {resourceNames.get(check.resourceId)} · {checkTypeLabel(check.type)}
                    </p>
                  </div>
                </div>
                <CheckHealthSummary check={check} />
                <CheckStat label="Uptime · 24h" value={formatPercent(check.uptime24h)} />
                <CheckStat label="Last run" value={formatRelative(check.lastCheckedAt)} />
                <CheckActions
                  check={check}
                  onDetails={() => setDetailsCheck(check)}
                  onRun={() => run.mutate(check.id)}
                  onEdit={() => {
                    setSelected(check);
                    setDialogOpen(true);
                  }}
                  onToggle={() => toggle.mutate({ id: check.id, enabled: !check.enabled })}
                  onDelete={() => setDeleteCheck(check)}
                />
              </article>
            ))}
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          title={resources.data?.length ? "No matching checks" : "Add a resource first"}
          illustration={resources.data?.length ? undefined : "empty"}
          action={
            !resources.data?.length ? (
              <Button asChild variant="coral" size="sm">
                <Link to={appRoutes.newResource}>Add resource</Link>
              </Button>
            ) : undefined
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
          if (!open) setDetailsCheck(null);
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
