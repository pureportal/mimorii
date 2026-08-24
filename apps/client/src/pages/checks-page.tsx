import type { CheckSummary, ResourceSummary } from "@mimorii/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Eye, Pause, Pencil, Play, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
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
            <option value="up">Up</option>
            <option value="degraded">Degraded</option>
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
        <Card data-guide-page="checks-list" className="overflow-hidden">
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="border-b border-line bg-ink/[.025] text-xs text-muted">
                <tr>
                  <th className="px-5 py-3.5 font-medium">Check</th>
                  <th className="px-4 py-3.5 font-medium">Resource</th>
                  <th className="px-4 py-3.5 font-medium">State</th>
                  <th className="px-4 py-3.5 font-medium">Uptime · 24h</th>
                  <th className="px-4 py-3.5 font-medium">Health</th>
                  <th className="px-4 py-3.5 font-medium">Last run</th>
                  <th className="px-5 py-3.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((check) => (
                  <tr
                    key={check.id}
                    className="border-b border-line last:border-0 hover:bg-ink/[.018]"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
                          <Activity className="size-4" />
                        </span>
                        <div>
                          <p className="font-semibold">{check.name}</p>
                          <p className="text-xs uppercase text-muted">{check.type}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 font-medium">{resourceNames.get(check.resourceId)}</td>
                    <td className="px-4 py-4">
                      <StatusBadge status={check.status} />
                    </td>
                    <td className="px-4 py-4 font-semibold">{formatPercent(check.uptime24h)}</td>
                    <td className="w-72 px-4 py-4">
                      <CheckHealthSummary check={check} />
                    </td>
                    <td className="px-4 py-4 text-muted">{formatRelative(check.lastCheckedAt)}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Show details"
                          aria-label={`Show details for ${check.name}`}
                          onClick={() => setDetailsCheck(check)}
                        >
                          <Eye />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Run now"
                          aria-label={`Run ${check.name} now`}
                          onClick={() => run.mutate(check.id)}
                        >
                          <RefreshCw />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit"
                          aria-label={`Edit ${check.name}`}
                          onClick={() => {
                            setSelected(check);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={check.enabled ? "Pause" : "Enable"}
                          aria-label={`${check.enabled ? "Pause" : "Enable"} ${check.name}`}
                          onClick={() => toggle.mutate({ id: check.id, enabled: !check.enabled })}
                        >
                          {check.enabled ? <Pause /> : <Play />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete"
                          aria-label={`Delete ${check.name}`}
                          className="text-danger"
                          onClick={() => setDeleteCheck(check)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
