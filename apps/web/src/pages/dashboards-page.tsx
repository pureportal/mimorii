import type { DashboardAccessMode, DashboardSummary } from "@mimorii/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  Globe2,
  LayoutDashboard,
  LockKeyhole,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "../components/page-state";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { ConfirmationDialog } from "../components/ui/confirmation-dialog";
import { api } from "../lib/api";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { dashboardViewPath } from "../lib/dashboard-links";
import { formatCount } from "../lib/format";

const access = {
  public: { label: "Public", icon: Globe2 },
  private: { label: "Private", icon: LockKeyhole },
  protected: { label: "Protected", icon: ShieldCheck },
} satisfies Record<DashboardAccessMode, { label: string; icon: typeof Globe2 }>;

export function DashboardsPage() {
  const { activeTeam } = useAuth();
  const teamId = activeTeam!.id;
  const queryClient = useQueryClient();
  const [deleteDashboard, setDeleteDashboard] = useState<DashboardSummary | null>(null);
  const dashboards = useQuery({
    queryKey: ["dashboards", teamId],
    queryFn: () => api<DashboardSummary[]>(`/teams/${teamId}/dashboards`),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/teams/${teamId}/dashboards/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboards", teamId] });
      toast.success("Dashboard deleted");
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setDeleteDashboard(null),
  });

  if (dashboards.isLoading) return <LoadingState />;
  if (dashboards.isError) return <ErrorState retry={() => void dashboards.refetch()} />;
  const canManage = activeTeam!.role === "owner" || activeTeam!.role === "admin";

  return (
    <div className="space-y-6">
      <div
        data-guide-page="dashboards-summary"
        className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"
      >
        <p className="text-sm text-muted">
          {formatCount(dashboards.data?.length ?? 0, "dashboard")}
        </p>
        {canManage ? (
          <Button asChild variant="coral">
            <Link to={appRoutes.dashboardNew}>
              <Plus /> Create dashboard
            </Link>
          </Button>
        ) : null}
      </div>

      <div data-guide-page="dashboards-content">
        {dashboards.data?.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {dashboards.data.map((dashboard) => {
              const AccessIcon = access[dashboard.accessMode].icon;
              return (
                <Card key={dashboard.id} className="p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid size-11 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
                      <LayoutDashboard className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-display text-lg font-bold">{dashboard.name}</h3>
                      <p className="mt-1 truncate text-sm text-muted">
                        /dashboard/{dashboard.slug}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
                        <span className="flex items-center gap-1.5">
                          <AccessIcon className="size-3.5" /> {access[dashboard.accessMode].label}
                          {dashboard.accessMode === "protected"
                            ? dashboard.hasAccessKey
                              ? " · Active"
                              : " · Revoked"
                            : null}
                        </span>
                        <span>{formatCount(dashboard.itemCount, "panel")}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
                    {dashboard.accessMode !== "protected" ? (
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          to={dashboardViewPath(dashboard.slug)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink /> Open
                        </Link>
                      </Button>
                    ) : null}
                    {canManage ? (
                      <>
                        <Button asChild variant="outline" size="sm">
                          <Link to={appRoutes.dashboardEdit(dashboard.id)}>
                            <Pencil /> Edit
                          </Link>
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setDeleteDashboard(dashboard)}
                        >
                          <Trash2 /> Delete
                        </Button>
                      </>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No shared dashboards" illustration="empty" />
        )}
      </div>
      <ConfirmationDialog
        open={Boolean(deleteDashboard)}
        onOpenChange={(open) => {
          if (!open) setDeleteDashboard(null);
        }}
        title={`Delete ${deleteDashboard?.name ?? "dashboard"}?`}
        confirmLabel="Delete dashboard"
        pending={remove.isPending}
        onConfirm={() => {
          if (deleteDashboard) remove.mutate(deleteDashboard.id);
        }}
      />
    </div>
  );
}
