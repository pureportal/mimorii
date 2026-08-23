import type {
  DashboardAccessMode,
  DashboardConfiguration,
  DashboardItem,
  DashboardMetric,
  DashboardMutationResult,
  DashboardWidth,
  ResourceSummary,
} from "@mimorii/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { DashboardAccessKeyDialog } from "../components/dashboard-access-key-dialog";
import { DashboardItemDialog } from "../components/dashboard-item-dialog";
import { EmptyState, ErrorState, LoadingState } from "../components/page-state";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { ConfirmationDialog } from "../components/ui/confirmation-dialog";
import { Field, FieldLabel } from "../components/ui/field";
import { Input, Select } from "../components/ui/input";
import { api, jsonBody } from "../lib/api";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/cn";

const widthClasses = {
  1: "lg:col-span-1",
  2: "lg:col-span-2",
  3: "lg:col-span-3",
} as const;

const metricLabels: Record<DashboardMetric, string> = {
  uptime: "Uptime",
  averageLatency: "Average latency",
  monitorCount: "Monitor count",
  openIncidents: "Open incidents",
  cpuPercent: "CPU",
  memoryPercent: "Memory",
  storagePercent: "Storage",
  loadAverage: "Load average",
  batteryPercent: "Battery",
  containerCount: "Containers",
  unhealthyContainerCount: "Unhealthy containers",
};

export function DashboardEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const { activeTeam } = useAuth();
  const teamId = activeTeam!.id;
  const canManage = activeTeam!.role === "owner" || activeTeam!.role === "admin";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dashboard = useQuery({
    queryKey: ["dashboard", teamId, id],
    queryFn: () => api<DashboardConfiguration>(`/teams/${teamId}/dashboards/${id}`),
    enabled: !isNew,
  });
  const resources = useQuery({
    queryKey: ["resources", teamId],
    queryFn: () => api<ResourceSummary[]>(`/teams/${teamId}/resources`),
  });
  const [initializedId, setInitializedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [accessMode, setAccessMode] = useState<DashboardAccessMode>("public");
  const [items, setItems] = useState<DashboardItem[]>([]);
  const [hasAccessKey, setHasAccessKey] = useState(false);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DashboardItem | null>(null);
  const [dialogRevision, setDialogRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareKey, setShareKey] = useState<string | null>(null);
  const [shareSlug, setShareSlug] = useState("");
  const [navigateAfterShare, setNavigateAfterShare] = useState<string | null>(null);
  const [accessConfirmation, setAccessConfirmation] = useState<"regenerate" | "revoke" | null>(
    null
  );

  useEffect(() => {
    if (!dashboard.data || dashboard.data.id === initializedId) return;
    setInitializedId(dashboard.data.id);
    setName(dashboard.data.name);
    setSlug(dashboard.data.slug);
    setSlugTouched(true);
    setAccessMode(dashboard.data.accessMode);
    setItems(dashboard.data.items);
    setHasAccessKey(dashboard.data.hasAccessKey);
  }, [dashboard.data, initializedId]);

  if (!canManage) return <Navigate to={appRoutes.dashboards} replace />;
  if ((!isNew && dashboard.isLoading) || resources.isLoading) return <LoadingState />;
  if ((!isNew && dashboard.isError) || resources.isError) {
    return (
      <ErrorState
        retry={() => {
          if (!isNew) void dashboard.refetch();
          void resources.refetch();
        }}
      />
    );
  }

  const resourceNames = new Map(
    (resources.data ?? []).map((resource) => [resource.id, resource.name])
  );

  function changeName(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await api<DashboardMutationResult>(
        `/teams/${teamId}/dashboards${isNew ? "" : `/${id}`}`,
        {
          method: isNew ? "POST" : "PATCH",
          ...jsonBody({ name, slug, accessMode, items }),
        }
      );
      setName(result.dashboard.name);
      setSlug(result.dashboard.slug);
      setAccessMode(result.dashboard.accessMode);
      setItems(result.dashboard.items);
      setHasAccessKey(result.dashboard.hasAccessKey);
      await queryClient.invalidateQueries({ queryKey: ["dashboards", teamId] });
      if (!isNew) {
        queryClient.setQueryData(["dashboard", teamId, id], result.dashboard);
      }
      toast.success(isNew ? "Dashboard created" : "Dashboard saved");
      if (result.accessKey) {
        setShareSlug(result.dashboard.slug);
        setShareKey(result.accessKey);
        if (isNew) setNavigateAfterShare(appRoutes.dashboardEdit(result.dashboard.id));
      } else if (isNew) {
        void navigate(appRoutes.dashboardEdit(result.dashboard.id), { replace: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Dashboard could not be saved");
    } finally {
      setSaving(false);
    }
  }

  async function regenerateAccessKey() {
    if (!id) return;
    setSharing(true);
    try {
      const result = await api<{ accessKey: string }>(
        `/teams/${teamId}/dashboards/${id}/access-key`,
        { method: "POST" }
      );
      setHasAccessKey(true);
      setShareSlug(dashboard.data?.slug ?? slug);
      setShareKey(result.accessKey);
      await queryClient.invalidateQueries({ queryKey: ["dashboards", teamId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Link could not be created");
    } finally {
      setSharing(false);
      setAccessConfirmation(null);
    }
  }

  async function revokeAccessKey() {
    if (!id) return;
    setSharing(true);
    try {
      await api(`/teams/${teamId}/dashboards/${id}/access-key`, { method: "DELETE" });
      setHasAccessKey(false);
      await queryClient.invalidateQueries({ queryKey: ["dashboards", teamId] });
      toast.success("Protected link revoked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Link could not be revoked");
    } finally {
      setSharing(false);
      setAccessConfirmation(null);
    }
  }

  function openItemDialog(item: DashboardItem | null) {
    setEditingItem(item);
    setDialogRevision((value) => value + 1);
    setItemDialogOpen(true);
  }

  function saveItem(next: DashboardItem) {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === next.id);
      if (index < 0) return [...current, next];
      return current.map((item) => (item.id === next.id ? next : item));
    });
  }

  function moveItem(index: number, offset: -1 | 1) {
    setItems((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div
        data-guide-page="dashboards-summary"
        className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"
      >
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-3">
            <Link to={appRoutes.dashboards}>
              <ArrowLeft /> Shared dashboards
            </Link>
          </Button>
          <h2 className="font-display text-3xl font-black tracking-tight">
            {isNew ? "New dashboard" : name}
          </h2>
        </div>
        <Button type="submit" form="dashboard-editor" disabled={saving}>
          {isNew ? "Create dashboard" : "Save dashboard"}
        </Button>
      </div>

      <form
        id="dashboard-editor"
        data-guide-page="dashboards-content"
        className="space-y-6"
        onSubmit={(event) => void save(event)}
      >
        <Card className="grid gap-4 p-5 lg:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="dashboard-name">Name</FieldLabel>
            <Input
              id="dashboard-name"
              value={name}
              onChange={(event) => changeName(event.target.value)}
              required
              maxLength={100}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="dashboard-slug">Address</FieldLabel>
            <Input
              id="dashboard-slug"
              value={slug}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(event.target.value.toLowerCase());
              }}
              required
              minLength={3}
              maxLength={80}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="dashboard-access">Access</FieldLabel>
            <Select
              id="dashboard-access"
              value={accessMode}
              onChange={(event) => setAccessMode(parseAccessMode(event.target.value))}
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
              <option value="protected">Protected link</option>
            </Select>
          </Field>
        </Card>

        {!isNew && accessMode === "protected" && dashboard.data?.accessMode === "protected" ? (
          <Card className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
            <div>
              <h3 className="font-display font-bold">Protected link</h3>
              <p className="mt-1 text-sm text-muted">{hasAccessKey ? "Active" : "Revoked"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={sharing}
                onClick={() => {
                  if (hasAccessKey) setAccessConfirmation("regenerate");
                  else void regenerateAccessKey();
                }}
              >
                <KeyRound /> {hasAccessKey ? "Regenerate link" : "Create link"}
              </Button>
              {hasAccessKey ? (
                <Button
                  type="button"
                  variant="danger"
                  disabled={sharing}
                  onClick={() => setAccessConfirmation("revoke")}
                >
                  Revoke link
                </Button>
              ) : null}
            </div>
          </Card>
        ) : null}

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h3 className="font-display text-xl font-bold">Panels</h3>
            <Button
              type="button"
              variant="outline"
              disabled={items.length >= 24}
              onClick={() => openItemDialog(null)}
            >
              <Plus /> Add panel
            </Button>
          </div>

          {items.length ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {items.map((item, index) => (
                <Card
                  key={item.id}
                  className={cn("flex min-h-48 flex-col p-5", widthClasses[item.width])}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="truncate font-display font-bold">{item.title}</h4>
                      <p className="mt-1 text-xs text-muted">{itemSummary(item, resourceNames)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${item.title}`}
                      onClick={() => openItemDialog(item)}
                    >
                      <Pencil />
                    </Button>
                  </div>
                  <div className="mt-auto flex flex-wrap items-end gap-2 pt-6">
                    <Field className="mr-auto w-28">
                      <FieldLabel htmlFor={`dashboard-width-${item.id}`}>Width</FieldLabel>
                      <Select
                        id={`dashboard-width-${item.id}`}
                        className="h-9"
                        value={item.width}
                        onChange={(event) => {
                          const width = parseWidth(event.target.value);
                          setItems((current) =>
                            current.map((currentItem) =>
                              currentItem.id === item.id ? { ...currentItem, width } : currentItem
                            )
                          );
                        }}
                      >
                        <option value={1}>1 column</option>
                        <option value={2}>2 columns</option>
                        <option value={3}>3 columns</option>
                      </Select>
                    </Field>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={index === 0}
                      aria-label={`Move ${item.title} up`}
                      onClick={() => moveItem(index, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={index === items.length - 1}
                      aria-label={`Move ${item.title} down`}
                      onClick={() => moveItem(index, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-danger"
                      aria-label={`Remove ${item.title}`}
                      onClick={() =>
                        setItems((current) =>
                          current.filter((currentItem) => currentItem.id !== item.id)
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No panels"
              action={
                <Button type="button" variant="outline" onClick={() => openItemDialog(null)}>
                  <Plus /> Add panel
                </Button>
              }
            />
          )}
        </section>
      </form>

      <DashboardItemDialog
        key={`${editingItem?.id ?? "new"}-${dialogRevision}`}
        open={itemDialogOpen}
        item={editingItem}
        resources={resources.data ?? []}
        onOpenChange={setItemDialogOpen}
        onSave={saveItem}
      />
      <ConfirmationDialog
        open={Boolean(accessConfirmation)}
        onOpenChange={(open) => {
          if (!open) setAccessConfirmation(null);
        }}
        title={accessConfirmation === "regenerate" ? "Regenerate this link?" : "Revoke this link?"}
        description={
          accessConfirmation === "regenerate"
            ? "The current protected link will stop working."
            : "Anyone using it will lose access."
        }
        confirmLabel={accessConfirmation === "regenerate" ? "Regenerate link" : "Revoke link"}
        pending={sharing}
        onConfirm={() => {
          if (accessConfirmation === "regenerate") void regenerateAccessKey();
          else if (accessConfirmation === "revoke") void revokeAccessKey();
        }}
      />
      <DashboardAccessKeyDialog
        accessKey={shareKey}
        slug={shareSlug}
        onOpenChange={(open) => {
          if (open) return;
          setShareKey(null);
          if (navigateAfterShare) {
            void navigate(navigateAfterShare, { replace: true });
            setNavigateAfterShare(null);
          }
        }}
      />
    </div>
  );
}

function itemSummary(item: DashboardItem, resources: Map<string, string>): string {
  const resource = item.resourceId ? resources.get(item.resourceId) : "All resources";
  switch (item.type) {
    case "metric":
      return `${metricLabels[item.metric]} · ${resource}`;
    case "uptime":
      return `${item.windowDays} days · ${resource}`;
    case "status":
      return `Current status · ${resource}`;
    case "incidents":
      return `${item.limit} incidents · ${resource}`;
    default:
      return unreachable(item);
  }
}

function unreachable(_value: never): never {
  throw new Error("Unsupported dashboard item");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function parseAccessMode(value: string): DashboardAccessMode {
  if (value === "public" || value === "private" || value === "protected") return value;
  throw new Error("Dashboard access mode is invalid");
}

function parseWidth(value: string): DashboardWidth {
  const width = Number(value);
  if (width === 1 || width === 2 || width === 3) return width;
  throw new Error("Dashboard item width is invalid");
}
