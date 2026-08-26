import type {
  ResourceSummary,
  StatusPageSubscriberSummary,
  StatusPageSummary,
} from "@mimorii/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Globe2, Pencil, Plus, Radio, Trash2, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "../components/page-state";
import { ResourcePicker } from "../components/resource-picker";
import { StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { ConfirmationDialog } from "../components/ui/confirmation-dialog";
import { Dialog, DialogContent, DialogHeader } from "../components/ui/dialog";
import { Field, FieldLabel } from "../components/ui/field";
import { Input } from "../components/ui/input";
import { api, jsonBody } from "../lib/api";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { formatCount } from "../lib/format";
import { statusPagePath } from "../lib/status-page-links";

export function StatusPagesPage() {
  const { activeTeam } = useAuth();
  const teamId = activeTeam!.id;
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<StatusPageSummary | null>(null);
  const [subscribersPage, setSubscribersPage] = useState<StatusPageSummary | null>(null);
  const [deletePage, setDeletePage] = useState<StatusPageSummary | null>(null);
  const pages = useQuery({
    queryKey: ["status-pages", teamId],
    queryFn: () => api<StatusPageSummary[]>(`/teams/${teamId}/status-pages`),
  });
  const resources = useQuery({
    queryKey: ["resources", teamId],
    queryFn: () => api<ResourceSummary[]>(`/teams/${teamId}/resources`),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["status-pages", teamId] });
  const toggle = useMutation({
    mutationFn: (page: StatusPageSummary) =>
      api(`/teams/${teamId}/status-pages/${page.id}`, {
        method: "PATCH",
        ...jsonBody({ published: !page.published }),
      }),
    onSuccess: async () => {
      await refresh();
      toast.success("Status page updated");
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/teams/${teamId}/status-pages/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refresh();
      toast.success("Status page deleted");
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setDeletePage(null),
  });

  if (pages.isLoading || resources.isLoading) return <LoadingState />;
  if (pages.isError || resources.isError) {
    return (
      <ErrorState
        retry={() => {
          void pages.refetch();
          void resources.refetch();
        }}
      />
    );
  }
  const canManage = activeTeam!.role === "owner" || activeTeam!.role === "admin";

  return (
    <div className="space-y-6">
      <div
        data-guide-page="status-pages-summary"
        className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"
      >
        <p className="text-sm text-muted">{formatCount(pages.data?.length ?? 0, "page")}</p>
        {canManage ? (
          resources.data?.length ? (
            <Button
              variant="coral"
              onClick={() => {
                setSelected(null);
                setDialogOpen(true);
              }}
            >
              <Plus /> Create status page
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

      <div data-guide-page="status-pages-content">
        {pages.data?.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {pages.data.map((page) => (
              <Card key={page.id} className="p-5">
                <div className="flex items-start gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
                    <Globe2 className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-lg font-bold">{page.name}</h3>
                      <StatusBadge status={page.published ? "operational" : "paused"}>
                        {page.published ? "Published" : "Draft"}
                      </StatusBadge>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted">
                      {statusPagePath(page.id, page.slug)}
                    </p>
                    <div className="mt-3 flex gap-4 text-xs text-muted">
                      <span className="flex items-center gap-1.5">
                        <Radio className="size-3.5" />{" "}
                        {formatCount(page.resourceIds.length, "component")}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Users className="size-3.5" />{" "}
                        {formatCount(page.subscriberCount, "subscriber")}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
                  {page.published ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link to={statusPagePath(page.id, page.slug)} target="_blank">
                        <ExternalLink /> Open
                      </Link>
                    </Button>
                  ) : null}
                  {canManage ? (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setSubscribersPage(page)}>
                        <Users /> Subscribers
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggle.mutate(page)}>
                        {page.published ? "Unpublish" : "Publish"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelected(page);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil /> Edit
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setDeletePage(page)}>
                        <Trash2 /> Delete
                      </Button>
                    </>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState title="No status pages" illustration="empty" />
        )}
      </div>

      <StatusPageDialog
        key={selected?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        page={selected}
        resources={resources.data ?? []}
        teamId={teamId}
        onSaved={refresh}
      />
      <SubscribersDialog
        page={subscribersPage}
        teamId={teamId}
        onOpenChange={(open) => {
          if (!open) setSubscribersPage(null);
        }}
        onChanged={refresh}
      />
      <ConfirmationDialog
        open={Boolean(deletePage)}
        onOpenChange={(open) => {
          if (!open) setDeletePage(null);
        }}
        title={`Delete ${deletePage?.name ?? "status page"}?`}
        confirmLabel="Delete status page"
        pending={remove.isPending}
        onConfirm={() => {
          if (deletePage) remove.mutate(deletePage.id);
        }}
      />
    </div>
  );
}

function SubscribersDialog({
  page,
  teamId,
  onOpenChange,
  onChanged,
}: {
  page: StatusPageSummary | null;
  teamId: string;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<unknown>;
}) {
  const [subscriberToRemove, setSubscriberToRemove] = useState<StatusPageSubscriberSummary | null>(
    null
  );
  const [removing, setRemoving] = useState(false);
  const subscribers = useQuery({
    queryKey: ["status-page-subscribers", teamId, page?.id],
    queryFn: () =>
      api<StatusPageSubscriberSummary[]>(`/teams/${teamId}/status-pages/${page!.id}/subscribers`),
    enabled: Boolean(page),
  });

  async function removeSubscriber(subscriber: StatusPageSubscriberSummary) {
    if (!page) return;
    setRemoving(true);
    try {
      await api(`/teams/${teamId}/status-pages/${page.id}/subscribers/${subscriber.id}`, {
        method: "DELETE",
      });
      await subscribers.refetch();
      await onChanged();
      toast.success("Subscriber removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Subscriber could not be removed");
    } finally {
      setRemoving(false);
      setSubscriberToRemove(null);
    }
  }

  return (
    <>
      <Dialog open={Boolean(page)} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader title="Subscribers" />
          {subscribers.isLoading ? (
            <LoadingState />
          ) : subscribers.isError ? (
            <ErrorState retry={() => void subscribers.refetch()} />
          ) : subscribers.data?.length ? (
            <div className="max-h-[55vh] space-y-2 overflow-y-auto">
              {subscribers.data.map((subscriber) => (
                <div
                  key={subscriber.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{subscriber.email}</p>
                    <p className="mt-0.5 text-xs capitalize text-muted">{subscriber.status}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger"
                    onClick={() => setSubscriberToRemove(subscriber)}
                  >
                    <Trash2 /> Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No subscribers" />
          )}
        </DialogContent>
      </Dialog>
      <ConfirmationDialog
        open={Boolean(subscriberToRemove)}
        onOpenChange={(open) => {
          if (!open) setSubscriberToRemove(null);
        }}
        title={`Remove ${subscriberToRemove?.email ?? "subscriber"}?`}
        confirmLabel="Remove subscriber"
        pending={removing}
        onConfirm={() => {
          if (subscriberToRemove) void removeSubscriber(subscriberToRemove);
        }}
      />
    </>
  );
}

function StatusPageDialog({
  open,
  onOpenChange,
  page,
  resources,
  teamId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: StatusPageSummary | null;
  resources: ResourceSummary[];
  teamId: string;
  onSaved: () => Promise<unknown>;
}) {
  const [resourceIds, setResourceIds] = useState(page?.resourceIds ?? []);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resourceIds.length) return toast.error("Select at least one resource");
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await api(`/teams/${teamId}/status-pages${page ? `/${page.id}` : ""}`, {
        method: page ? "PATCH" : "POST",
        ...jsonBody({
          name: form.get("name"),
          slug: form.get("slug"),
          resourceIds,
          published: form.get("published") === "on",
          showUptime: form.get("showUptime") === "on",
        }),
      });
      await onSaved();
      onOpenChange(false);
      toast.success(page ? "Status page updated" : "Status page created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Status page could not be saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={page ? "Edit status page" : "Create status page"} />
        <form className="grid gap-4" onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor="status-page-name">Name</FieldLabel>
            <Input
              id="status-page-name"
              name="name"
              defaultValue={page?.name}
              required
              maxLength={100}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="status-page-slug">Address</FieldLabel>
            <Input
              id="status-page-slug"
              name="slug"
              defaultValue={page?.slug}
              required
              minLength={3}
              maxLength={80}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            />
          </Field>
          <Field>
            <FieldLabel>Components</FieldLabel>
            <ResourcePicker resources={resources} value={resourceIds} onChange={setResourceIds} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-3 text-sm font-medium">
              <input
                name="published"
                type="checkbox"
                defaultChecked={page?.published}
                className="size-4 accent-violet-strong"
              />
              Published
            </label>
            <label className="flex items-center gap-3 text-sm font-medium">
              <input
                name="showUptime"
                type="checkbox"
                defaultChecked={page?.showUptime ?? true}
                className="size-4 accent-violet-strong"
              />
              Show uptime
            </label>
          </div>
          <Button type="submit" disabled={saving}>
            {page ? "Save status page" : "Create status page"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
