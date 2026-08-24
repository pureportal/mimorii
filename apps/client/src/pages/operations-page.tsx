import type {
  IncidentImpact,
  IncidentStatus,
  IncidentSummary,
  MaintenanceRecurrence,
  MaintenanceWindowSummary,
  ResourceSummary,
} from "@mimorii/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Clock3, Pencil, Plus, Radio, Send, Trash2, XCircle } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "../components/page-state";
import { ResourcePicker } from "../components/resource-picker";
import { SectionTabs } from "../components/section-tabs";
import { StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { ConfirmationDialog } from "../components/ui/confirmation-dialog";
import { Dialog, DialogContent, DialogHeader } from "../components/ui/dialog";
import { Field, FieldLabel } from "../components/ui/field";
import { Input, Select, Textarea } from "../components/ui/input";
import { api, jsonBody } from "../lib/api";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { formatCount, formatDuration, formatRelative } from "../lib/format";

export type OperationsView = "incidents" | "maintenance";

export function OperationsPage({ view }: { view: OperationsView }) {
  const { activeTeam } = useAuth();
  const teamId = activeTeam!.id;
  const queryClient = useQueryClient();
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<IncidentSummary | null>(null);
  const [editingIncident, setEditingIncident] = useState<IncidentSummary | null>(null);
  const [editingMaintenance, setEditingMaintenance] = useState<MaintenanceWindowSummary | null>(
    null
  );
  const [deleteMaintenance, setDeleteMaintenance] = useState<MaintenanceWindowSummary | null>(null);
  const incidents = useQuery({
    queryKey: ["incidents", teamId],
    queryFn: () => api<IncidentSummary[]>(`/teams/${teamId}/incidents?limit=500`),
    refetchInterval: 30_000,
  });
  const maintenance = useQuery({
    queryKey: ["maintenance", teamId],
    queryFn: () => api<MaintenanceWindowSummary[]>(`/teams/${teamId}/maintenance`),
    refetchInterval: 30_000,
  });
  const resources = useQuery({
    queryKey: ["resources", teamId],
    queryFn: () => api<ResourceSummary[]>(`/teams/${teamId}/resources`),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["incidents", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["maintenance", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["resources", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["overview", teamId] }),
    ]);
  };

  const cancelMaintenance = useMutation({
    mutationFn: (id: string) =>
      api(`/teams/${teamId}/maintenance/${id}/cancel`, { method: "POST" }),
    onSuccess: async () => {
      await refresh();
      toast.success("Maintenance cancelled");
    },
    onError: (error) => toast.error(error.message),
  });
  const removeMaintenance = useMutation({
    mutationFn: (id: string) => api(`/teams/${teamId}/maintenance/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refresh();
      toast.success("Maintenance deleted");
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setDeleteMaintenance(null),
  });

  if (incidents.isLoading || maintenance.isLoading || resources.isLoading) return <LoadingState />;
  if (incidents.isError || maintenance.isError || resources.isError) {
    return (
      <ErrorState
        retry={() => {
          void incidents.refetch();
          void maintenance.refetch();
          void resources.refetch();
        }}
      />
    );
  }

  const canManage = activeTeam!.role !== "viewer";
  const canDelete = activeTeam!.role === "owner" || activeTeam!.role === "admin";
  const activeIncidents =
    incidents.data?.filter((incident) => incident.status !== "resolved").length ?? 0;
  const activeMaintenance =
    maintenance.data?.filter((window) => window.status === "active").length ?? 0;

  return (
    <div className="space-y-6">
      <div
        data-guide-page="operations-summary"
        className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"
      >
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={activeIncidents ? "investigating" : "resolved"}>
            {activeIncidents} active incidents
          </StatusBadge>
          <StatusBadge status={activeMaintenance ? "active" : "completed"}>
            {activeMaintenance} active maintenance
          </StatusBadge>
        </div>
        {canManage ? (
          resources.data?.length ? (
            <Button
              variant="coral"
              onClick={() => {
                if (view === "incidents") {
                  setEditingIncident(null);
                  setIncidentOpen(true);
                } else {
                  setEditingMaintenance(null);
                  setMaintenanceOpen(true);
                }
              }}
            >
              <Plus /> {view === "incidents" ? "Declare incident" : "Schedule maintenance"}
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

      <SectionTabs
        label="Operations"
        items={[
          { label: "Incidents", to: appRoutes.incidents },
          { label: "Maintenance", to: appRoutes.maintenance },
        ]}
        className="w-fit lg:hidden"
      />

      <div data-guide-page="operations-content">
        {view === "incidents" ? (
          <IncidentList
            incidents={incidents.data ?? []}
            canManage={canManage}
            onEdit={(incident) => {
              setEditingIncident(incident);
              setIncidentOpen(true);
            }}
            onUpdate={setSelectedIncident}
          />
        ) : (
          <MaintenanceList
            windows={maintenance.data ?? []}
            canManage={canManage}
            canDelete={canDelete}
            onEdit={(window) => {
              setEditingMaintenance(window);
              setMaintenanceOpen(true);
            }}
            onCancel={(id) => cancelMaintenance.mutate(id)}
            onDelete={setDeleteMaintenance}
          />
        )}
      </div>

      <IncidentDialog
        key={editingIncident?.id ?? "new-incident"}
        open={incidentOpen}
        onOpenChange={(open) => {
          setIncidentOpen(open);
          if (!open) setEditingIncident(null);
        }}
        incident={editingIncident}
        resources={resources.data ?? []}
        onSaved={refresh}
        teamId={teamId}
      />
      <IncidentUpdateDialog
        incident={selectedIncident}
        onOpenChange={(open) => !open && setSelectedIncident(null)}
        onSaved={refresh}
        teamId={teamId}
      />
      <MaintenanceDialog
        key={editingMaintenance?.id ?? "new-maintenance"}
        open={maintenanceOpen}
        onOpenChange={(open) => {
          setMaintenanceOpen(open);
          if (!open) setEditingMaintenance(null);
        }}
        maintenance={editingMaintenance}
        resources={resources.data ?? []}
        onSaved={refresh}
        teamId={teamId}
      />
      <ConfirmationDialog
        open={Boolean(deleteMaintenance)}
        onOpenChange={(open) => {
          if (!open) setDeleteMaintenance(null);
        }}
        title={`Delete ${deleteMaintenance?.name ?? "maintenance window"}?`}
        confirmLabel="Delete maintenance"
        pending={removeMaintenance.isPending}
        onConfirm={() => {
          if (deleteMaintenance) removeMaintenance.mutate(deleteMaintenance.id);
        }}
      />
    </div>
  );
}

function IncidentList({
  incidents,
  canManage,
  onEdit,
  onUpdate,
}: {
  incidents: IncidentSummary[];
  canManage: boolean;
  onEdit: (incident: IncidentSummary) => void;
  onUpdate: (incident: IncidentSummary) => void;
}) {
  if (!incidents.length) return <EmptyState title="No incidents" illustration="empty" />;
  return (
    <div className="grid gap-4">
      {incidents.map((incident) => {
        const latest = incident.updates[0];
        return (
          <Card key={incident.id}>
            <CardHeader>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-lg font-bold">{incident.title}</h3>
                  <StatusBadge status={incident.status} />
                  <StatusBadge status={incident.impact} />
                </div>
                <p className="mt-2 text-xs text-muted">
                  {incident.resources.map((resource) => resource.name).join(", ")} ·{" "}
                  {formatRelative(incident.startedAt)} · {formatDuration(incident.durationSeconds)}
                </p>
              </div>
              {canManage ? (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => onEdit(incident)}>
                    <Pencil /> Edit
                  </Button>
                  {incident.status !== "resolved" ? (
                    <Button variant="outline" size="sm" onClick={() => onUpdate(incident)}>
                      <Send /> Update
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </CardHeader>
            {latest ? (
              <CardContent>
                <div className="rounded-xl bg-ink/[.035] p-4">
                  <p className="text-sm leading-6">{latest.message}</p>
                  <p className="mt-2 text-xs text-muted">{formatRelative(latest.createdAt)}</p>
                </div>
                {incident.updates.length > 1 ? (
                  <details className="mt-3">
                    <summary className="text-xs font-semibold text-muted">
                      {formatCount(incident.updates.length - 1, "earlier update")}
                    </summary>
                    <div className="mt-3 grid gap-3 border-l border-line pl-4">
                      {incident.updates.slice(1).map((update) => (
                        <div key={update.id}>
                          <div className="flex items-center gap-2">
                            <StatusBadge status={update.status} />
                            <span className="text-xs text-muted">
                              {formatRelative(update.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 text-sm">{update.message}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </CardContent>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

function MaintenanceList({
  windows,
  canManage,
  canDelete,
  onEdit,
  onCancel,
  onDelete,
}: {
  windows: MaintenanceWindowSummary[];
  canManage: boolean;
  canDelete: boolean;
  onEdit: (window: MaintenanceWindowSummary) => void;
  onCancel: (id: string) => void;
  onDelete: (window: MaintenanceWindowSummary) => void;
}) {
  if (!windows.length) return <EmptyState title="No maintenance windows" illustration="empty" />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {windows.map((window) => (
        <Card key={window.id} className="p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
              <CalendarClock className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display font-bold">{window.name}</h3>
                <StatusBadge status={window.status} />
              </div>
              <p className="mt-2 text-sm text-muted">
                {new Date(window.nextStartsAt ?? window.startsAt).toLocaleString()} –{" "}
                {new Date(window.nextEndsAt ?? window.endsAt).toLocaleString()}
              </p>
              <p className="mt-2 text-xs text-muted">
                {window.resources.map((resource) => resource.name).join(", ")}
                {window.recurrence !== "none" ? ` · ${window.recurrence}` : ""}
              </p>
            </div>
          </div>
          {(canManage || canDelete) && window.status !== "cancelled" ? (
            <div className="mt-4 flex justify-end gap-2 border-t border-line pt-4">
              {canManage ? (
                <Button variant="ghost" size="sm" onClick={() => onEdit(window)}>
                  <Pencil /> Edit
                </Button>
              ) : null}
              {canDelete ? (
                <Button variant="ghost" size="sm" onClick={() => onDelete(window)}>
                  <Trash2 /> Delete
                </Button>
              ) : null}
              {canManage && (window.status === "scheduled" || window.status === "active") ? (
                <Button variant="danger" size="sm" onClick={() => onCancel(window.id)}>
                  <XCircle /> Cancel
                </Button>
              ) : null}
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

function IncidentDialog({
  open,
  onOpenChange,
  incident,
  resources,
  onSaved,
  teamId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  incident: IncidentSummary | null;
  resources: ResourceSummary[];
  onSaved: () => Promise<void>;
  teamId: string;
}) {
  const [resourceIds, setResourceIds] = useState<string[]>(
    incident?.resources.map((resource) => resource.id) ?? []
  );
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resourceIds.length) return toast.error("Select at least one resource");
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const startedAt = form.get("startedAt");
      await api(`/teams/${teamId}/incidents${incident ? `/${incident.id}` : ""}`, {
        method: incident ? "PATCH" : "POST",
        ...jsonBody({
          title: form.get("title"),
          impact: form.get("impact") as IncidentImpact,
          ...(incident
            ? {}
            : {
                status: "investigating",
                message: form.get("message"),
              }),
          startedAt: typeof startedAt === "string" ? new Date(startedAt).toISOString() : undefined,
          resourceIds,
        }),
      });
      await onSaved();
      onOpenChange(false);
      toast.success(incident ? "Incident saved" : "Incident declared");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Incident could not be created");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={incident ? "Edit incident" : "Declare incident"} />
        <form className="grid gap-4" onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor="incident-title">Title</FieldLabel>
            <Input
              id="incident-title"
              name="title"
              defaultValue={incident?.title}
              required
              maxLength={160}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="incident-impact">Impact</FieldLabel>
            <Select id="incident-impact" name="impact" defaultValue={incident?.impact ?? "major"}>
              <option value="minor">Minor</option>
              <option value="major">Major</option>
              <option value="critical">Critical</option>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="incident-started">Started</FieldLabel>
            <Input
              id="incident-started"
              name="startedAt"
              type="datetime-local"
              defaultValue={localDateTime(new Date(incident?.startedAt ?? Date.now()))}
              required
            />
          </Field>
          <Field>
            <FieldLabel>Resources</FieldLabel>
            <ResourcePicker resources={resources} value={resourceIds} onChange={setResourceIds} />
          </Field>
          {!incident ? (
            <Field>
              <FieldLabel htmlFor="incident-message">Update</FieldLabel>
              <Textarea id="incident-message" name="message" required maxLength={2_000} />
            </Field>
          ) : null}
          <Button type="submit" variant="coral" disabled={saving}>
            {incident ? <Pencil /> : <Radio />}
            {incident ? "Save incident" : "Declare incident"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IncidentUpdateDialog({
  incident,
  onOpenChange,
  onSaved,
  teamId,
}: {
  incident: IncidentSummary | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
  teamId: string;
}) {
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!incident) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await api(`/teams/${teamId}/incidents/${incident.id}/updates`, {
        method: "POST",
        ...jsonBody({
          status: form.get("status") as IncidentStatus,
          message: form.get("message"),
        }),
      });
      await onSaved();
      onOpenChange(false);
      toast.success("Incident updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update could not be published");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(incident)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title="Incident update" />
        <form className="grid gap-4" onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor="incident-status">Status</FieldLabel>
            <Select
              id="incident-status"
              name="status"
              defaultValue={incident?.status ?? "identified"}
            >
              <option value="investigating">Investigating</option>
              <option value="identified">Identified</option>
              <option value="monitoring">Monitoring</option>
              <option value="resolved">Resolved</option>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="incident-update-message">Update</FieldLabel>
            <Textarea id="incident-update-message" name="message" maxLength={2_000} />
          </Field>
          <Button type="submit" disabled={saving}>
            <Send /> Publish update
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MaintenanceDialog({
  open,
  onOpenChange,
  maintenance,
  resources,
  onSaved,
  teamId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maintenance: MaintenanceWindowSummary | null;
  resources: ResourceSummary[];
  onSaved: () => Promise<void>;
  teamId: string;
}) {
  const start = useMemo(
    () => localDateTime(new Date(maintenance?.startsAt ?? Date.now() + 60 * 60_000)),
    [maintenance]
  );
  const end = useMemo(
    () => localDateTime(new Date(maintenance?.endsAt ?? Date.now() + 2 * 60 * 60_000)),
    [maintenance]
  );
  const [resourceIds, setResourceIds] = useState<string[]>(
    maintenance?.resources.map((resource) => resource.id) ?? []
  );
  const [recurrence, setRecurrence] = useState<MaintenanceRecurrence>(
    maintenance?.recurrence ?? "none"
  );
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resourceIds.length) return toast.error("Select at least one resource");
    const form = new FormData(event.currentTarget);
    const startsAt = form.get("startsAt");
    const endsAt = form.get("endsAt");
    const recurrenceUntil = form.get("recurrenceUntil");
    if (typeof startsAt !== "string" || typeof endsAt !== "string") return;
    setSaving(true);
    try {
      await api(`/teams/${teamId}/maintenance${maintenance ? `/${maintenance.id}` : ""}`, {
        method: maintenance ? "PATCH" : "POST",
        ...jsonBody({
          name: form.get("name"),
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          recurrence,
          recurrenceUntil:
            recurrence === "none" || typeof recurrenceUntil !== "string" || !recurrenceUntil
              ? null
              : new Date(recurrenceUntil).toISOString(),
          suppressNotifications: form.get("suppressNotifications") === "on",
          resourceIds,
        }),
      });
      await onSaved();
      onOpenChange(false);
      toast.success(maintenance ? "Maintenance saved" : "Maintenance scheduled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Maintenance could not be scheduled");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={maintenance ? "Edit maintenance" : "Schedule maintenance"} />
        <form className="grid gap-4" onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor="maintenance-name">Name</FieldLabel>
            <Input
              id="maintenance-name"
              name="name"
              defaultValue={maintenance?.name}
              required
              maxLength={120}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="maintenance-start">Starts</FieldLabel>
              <Input
                id="maintenance-start"
                name="startsAt"
                type="datetime-local"
                defaultValue={start}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="maintenance-end">Ends</FieldLabel>
              <Input
                id="maintenance-end"
                name="endsAt"
                type="datetime-local"
                defaultValue={end}
                required
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="maintenance-recurrence">Recurrence</FieldLabel>
              <Select
                id="maintenance-recurrence"
                value={recurrence}
                onChange={(event) => setRecurrence(event.target.value as MaintenanceRecurrence)}
              >
                <option value="none">None</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </Select>
            </Field>
            {recurrence !== "none" ? (
              <Field>
                <FieldLabel htmlFor="maintenance-until">Until</FieldLabel>
                <Input
                  id="maintenance-until"
                  name="recurrenceUntil"
                  type="datetime-local"
                  defaultValue={
                    maintenance?.recurrenceUntil
                      ? localDateTime(new Date(maintenance.recurrenceUntil))
                      : undefined
                  }
                />
              </Field>
            ) : null}
          </div>
          <Field>
            <FieldLabel>Resources</FieldLabel>
            <ResourcePicker resources={resources} value={resourceIds} onChange={setResourceIds} />
          </Field>
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              name="suppressNotifications"
              type="checkbox"
              defaultChecked={maintenance?.suppressNotifications ?? true}
              className="size-4 accent-violet-strong"
            />
            Suppress notifications
          </label>
          <Button type="submit" disabled={saving}>
            {maintenance ? <Pencil /> : <Clock3 />}
            {maintenance ? "Save maintenance" : "Schedule maintenance"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function localDateTime(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
