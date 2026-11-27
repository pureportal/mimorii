import type { ResourceSummary, TrafficSiteSummary } from "@mimorii/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EmptyState, ErrorState, LoadingState } from "../components/page-state";
import { ResourceImage } from "../components/resource-image";
import { AddWebsiteDialog } from "../components/traffic/add-website-dialog";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { api } from "../lib/api";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { useCreateIntent } from "../lib/create-intent";
import { formatRelative } from "../lib/format";

export function TrafficPage() {
  const { activeTeam } = useAuth();
  const teamId = activeTeam!.id;
  const canManage = activeTeam!.role === "owner" || activeTeam!.role === "admin";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const sites = useQuery({
    queryKey: ["traffic-sites", teamId],
    queryFn: () => api<TrafficSiteSummary[]>(`/teams/${teamId}/traffic/sites`),
    refetchInterval: 30_000,
  });
  const resources = useQuery({
    queryKey: ["resources", teamId],
    queryFn: () => api<ResourceSummary[]>(`/teams/${teamId}/resources`),
  });
  useCreateIntent(canManage && resources.isSuccess, () => setAddOpen(true));

  if (sites.isLoading || resources.isLoading) return <LoadingState />;
  if (sites.isError || resources.isError || !sites.data) {
    return <ErrorState retry={() => void sites.refetch()} />;
  }
  const tracked = new Set(sites.data.map((site) => site.resourceId));
  const available = (resources.data ?? []).filter(
    (resource) => resource.kind === "service" && !tracked.has(resource.id)
  );
  const resourcesById = new Map((resources.data ?? []).map((resource) => [resource.id, resource]));

  return (
    <div data-guide-page="traffic-sites" className="space-y-6">
      {canManage && sites.data.length ? (
        <div className="flex justify-end">
          <Button variant="coral" disabled={!available.length} onClick={() => setAddOpen(true)}>
            <Plus /> Track website
          </Button>
        </div>
      ) : null}
      {sites.data.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sites.data.map((site) => {
            const resource = resourcesById.get(site.resourceId);
            return (
              <Link key={site.id} to={appRoutes.trafficSite(site.id)} className="block">
                <Card className="p-5 transition hover:border-lavender">
                  <div className="flex items-center gap-3">
                    {resource ? (
                      <ResourceImage resource={resource} className="size-10 rounded-xl" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{site.resourceName}</p>
                      <p className="truncate text-xs text-muted">{site.domains.join(", ")}</p>
                    </div>
                    {site.liveVisitors ? (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-success-strong">
                        <span className="size-2 animate-pulse rounded-full bg-success" />
                        {site.liveVisitors} live
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-5 flex items-end justify-between">
                    <div>
                      <p className="font-display text-3xl font-black">
                        {site.visitorsToday.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted">Visitors today</p>
                    </div>
                    <p className="text-xs text-muted">
                      {site.lastEventAt ? formatRelative(site.lastEventAt) : "Waiting for data"}
                    </p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No websites tracked"
          illustration="empty"
          action={
            canManage ? (
              available.length ? (
                <Button variant="coral" onClick={() => setAddOpen(true)}>
                  <Plus /> Track website
                </Button>
              ) : (
                <Button asChild variant="coral">
                  <Link to={appRoutes.newResource}>
                    <Plus /> Add resource
                  </Link>
                </Button>
              )
            ) : undefined
          }
        />
      )}
      <AddWebsiteDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        teamId={teamId}
        resources={available}
        onCreated={(site) => {
          setAddOpen(false);
          void queryClient.invalidateQueries({ queryKey: ["traffic-sites", teamId] });
          void navigate(`${appRoutes.trafficSite(site.id)}?tab=setup`);
        }}
      />
    </div>
  );
}
