import type {
  CheckSummary,
  ResourceSummary,
  ServiceLevelObjectiveSummary,
} from "@mimorii/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gauge, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "../components/page-state";
import { StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { ConfirmationDialog } from "../components/ui/confirmation-dialog";
import { Dialog, DialogContent, DialogHeader } from "../components/ui/dialog";
import { Field, FieldLabel } from "../components/ui/field";
import { Input, Select } from "../components/ui/input";
import { api, jsonBody } from "../lib/api";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { formatCount, formatLatency, formatPercent } from "../lib/format";

export function ObjectivesPage() {
  const { activeTeam } = useAuth();
  const teamId = activeTeam!.id;
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<ServiceLevelObjectiveSummary | null>(null);
  const [deleteObjective, setDeleteObjective] = useState<ServiceLevelObjectiveSummary | null>(null);
  const objectives = useQuery({
    queryKey: ["objectives", teamId],
    queryFn: () => api<ServiceLevelObjectiveSummary[]>(`/teams/${teamId}/objectives`),
    refetchInterval: 60_000,
  });
  const resources = useQuery({
    queryKey: ["resources", teamId],
    queryFn: () => api<ResourceSummary[]>(`/teams/${teamId}/resources`),
  });
  const checks = useQuery({
    queryKey: ["checks", teamId],
    queryFn: () => api<CheckSummary[]>(`/teams/${teamId}/checks`),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["objectives", teamId] });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/teams/${teamId}/objectives/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refresh();
      toast.success("Goal deleted");
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setDeleteObjective(null),
  });

  if (objectives.isLoading || resources.isLoading || checks.isLoading) return <LoadingState />;
  if (objectives.isError || resources.isError || checks.isError) {
    return (
      <ErrorState
        retry={() => {
          void objectives.refetch();
          void resources.refetch();
          void checks.refetch();
        }}
      />
    );
  }
  const canManage = activeTeam!.role === "owner" || activeTeam!.role === "admin";

  return (
    <div className="space-y-6">
      <div
        data-guide-page="goals-summary"
        className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"
      >
        <p className="text-sm text-muted">{formatCount(objectives.data?.length ?? 0, "goal")}</p>
        {canManage ? (
          resources.data?.length ? (
            <Button
              variant="coral"
              onClick={() => {
                setSelected(null);
                setDialogOpen(true);
              }}
            >
              <Plus /> Add goal
            </Button>
          ) : (
            <Button asChild variant="coral">
              <Link to={appRoutes.newResource}>
                <Plus /> Add resource
              </Link>
            </Button>
          )
        ) : null}
      </div>

      {objectives.data?.length ? (
        <div data-guide-page="goals-list" className="grid gap-4 xl:grid-cols-2">
          {objectives.data.map((objective) => {
            const consumed = Math.min(Math.max(objective.burnRate * 100, 0), 100);
            return (
              <Card key={objective.id} className="p-5">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
                    <Target className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display font-bold">{objective.name}</h3>
                      <StatusBadge status={objective.status} />
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {objective.checkName ?? objective.resourceName} · {objective.windowDays} days
                    </p>
                  </div>
                  <p className="font-display text-2xl font-black">
                    {formatPercent(objective.availabilityPercent)}
                  </p>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  <Metric label="Target" value={`${objective.targetPercent}%`} />
                  <Metric label="P95 latency" value={formatLatency(objective.latencyP95Ms)} />
                  <Metric
                    label="Budget"
                    value={`${Math.round(objective.remainingBudgetMinutes)}m`}
                  />
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink/6">
                  <div
                    className={`h-full rounded-full ${objective.status === "breached" ? "bg-danger" : objective.status === "at-risk" ? "bg-warning" : "bg-success"}`}
                    style={{ width: `${consumed}%` }}
                  />
                </div>
                {canManage ? (
                  <div className="mt-4 flex justify-end gap-2 border-t border-line pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelected(objective);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil /> Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setDeleteObjective(objective)}
                    >
                      <Trash2 /> Delete
                    </Button>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState title="No service goals" illustration="empty" />
      )}

      <ObjectiveDialog
        key={selected?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        objective={selected}
        resources={resources.data ?? []}
        checks={checks.data ?? []}
        teamId={teamId}
        onSaved={refresh}
      />
      <ConfirmationDialog
        open={Boolean(deleteObjective)}
        onOpenChange={(open) => {
          if (!open) setDeleteObjective(null);
        }}
        title={`Delete ${deleteObjective?.name ?? "goal"}?`}
        confirmLabel="Delete goal"
        pending={remove.isPending}
        onConfirm={() => {
          if (deleteObjective) remove.mutate(deleteObjective.id);
        }}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-ink/[.035] p-3">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}

function ObjectiveDialog({
  open,
  onOpenChange,
  objective,
  resources,
  checks,
  teamId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objective: ServiceLevelObjectiveSummary | null;
  resources: ResourceSummary[];
  checks: CheckSummary[];
  teamId: string;
  onSaved: () => Promise<unknown>;
}) {
  const [resourceId, setResourceId] = useState(objective?.resourceId ?? resources[0]?.id ?? "");
  const [checkId, setCheckId] = useState(objective?.checkId ?? "");
  const [saving, setSaving] = useState(false);
  const availableChecks = checks.filter((check) => check.resourceId === resourceId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await api(`/teams/${teamId}/objectives${objective ? `/${objective.id}` : ""}`, {
        method: objective ? "PATCH" : "POST",
        ...jsonBody({
          name: form.get("name"),
          resourceId,
          checkId: checkId || null,
          targetPercent: Number(form.get("targetPercent")),
          windowDays: Number(form.get("windowDays")),
          latencyTargetMs: form.get("latencyTargetMs") ? Number(form.get("latencyTargetMs")) : null,
        }),
      });
      await onSaved();
      onOpenChange(false);
      toast.success(objective ? "Goal updated" : "Goal added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Goal could not be saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={objective ? "Edit goal" : "Add goal"} />
        <form className="grid gap-4" onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor="objective-name">Name</FieldLabel>
            <Input
              id="objective-name"
              name="name"
              defaultValue={objective?.name}
              required
              maxLength={120}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="objective-resource">Resource</FieldLabel>
            <Select
              id="objective-resource"
              value={resourceId}
              onChange={(event) => {
                setResourceId(event.target.value);
                setCheckId("");
              }}
              required
            >
              {resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="objective-check">Check</FieldLabel>
            <Select
              id="objective-check"
              value={checkId}
              onChange={(event) => setCheckId(event.target.value)}
            >
              <option value="">All checks</option>
              {availableChecks.map((check) => (
                <option key={check.id} value={check.id}>
                  {check.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="objective-target">Availability target</FieldLabel>
              <Input
                id="objective-target"
                name="targetPercent"
                type="number"
                min={90}
                max={99.999}
                step={0.001}
                defaultValue={objective?.targetPercent ?? 99.9}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="objective-window">Window</FieldLabel>
              <Select
                id="objective-window"
                name="windowDays"
                defaultValue={objective?.windowDays ?? 30}
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
              </Select>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="objective-latency">P95 latency target</FieldLabel>
            <Input
              id="objective-latency"
              name="latencyTargetMs"
              type="number"
              min={1}
              max={300_000}
              defaultValue={objective?.latencyTargetMs ?? ""}
            />
          </Field>
          <Button type="submit" disabled={saving}>
            <Gauge /> {objective ? "Save goal" : "Add goal"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
