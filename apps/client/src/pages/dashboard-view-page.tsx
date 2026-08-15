import type { DashboardView } from "@mimorii/contracts";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { DashboardCanvas } from "../components/dashboard-canvas";
import { EmptyState, ErrorState, LoadingState } from "../components/page-state";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { ApiError, api } from "../lib/api";
import { dashboardAccessKey, dashboardKeyFingerprint } from "../lib/dashboard-links";
import { formatRelative } from "../lib/format";

export function DashboardViewPage() {
  const { slug = "" } = useParams();
  const location = useLocation();
  const accessKey = dashboardAccessKey(location.hash);
  const dashboard = useQuery({
    queryKey: ["dashboard-view", slug, dashboardKeyFingerprint(accessKey)],
    queryFn: () =>
      api<DashboardView>(`/dashboards/${encodeURIComponent(slug)}`, {
        headers: accessKey ? { "X-Dashboard-Key": accessKey } : undefined,
      }),
    refetchInterval: 30_000,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && (error.status === 401 || error.status === 404)) &&
      failureCount < 2,
  });

  if (dashboard.isLoading) return <LoadingState />;
  if (dashboard.error instanceof ApiError && dashboard.error.status === 401) {
    return (
      <DashboardShell>
        <Card className="mx-auto max-w-md p-6 text-center">
          <h1 className="font-display text-xl font-bold">Sign in to view this dashboard</h1>
          <Button asChild className="mt-5">
            <Link
              to="/login"
              state={{ from: `${location.pathname}${location.search}${location.hash}` }}
            >
              Sign in
            </Link>
          </Button>
        </Card>
      </DashboardShell>
    );
  }
  if (dashboard.error instanceof ApiError && dashboard.error.status === 404) {
    return (
      <DashboardShell>
        <EmptyState title="Dashboard not found" />
      </DashboardShell>
    );
  }
  if (dashboard.isError || !dashboard.data) {
    return (
      <DashboardShell>
        <ErrorState retry={() => void dashboard.refetch()} />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <h1 className="font-display text-3xl font-black tracking-tight">{dashboard.data.name}</h1>
        <p className="text-xs text-muted">Updated {formatRelative(dashboard.data.updatedAt)}</p>
      </header>
      <main className="mt-7">
        {dashboard.data.items.length ? (
          <DashboardCanvas items={dashboard.data.items} />
        ) : (
          <EmptyState title="No panels" />
        )}
      </main>
    </DashboardShell>
  );
}

function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-canvas px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-7xl">{children}</div>
    </div>
  );
}
