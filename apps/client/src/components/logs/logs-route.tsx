import { logsDisabledMessage } from "@mimorii/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { ApiError } from "../../lib/api";
import { appRoutes } from "../../lib/app-navigation";
import { useAuth } from "../../lib/auth";
import { LogsErrorBoundary } from "./logs-error-boundary";

export function LogsRoute() {
  const { activeTeam, refreshIdentity } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();

  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        const error = event.query.state.error;
        if (
          event.type === "updated" &&
          error instanceof ApiError &&
          error.status === 403 &&
          error.message === logsDisabledMessage
        ) {
          refreshIdentity().catch((cause: unknown) =>
            toast.error(cause instanceof Error ? cause.message : "Workspace could not be refreshed")
          );
        }
      }),
    [queryClient, refreshIdentity]
  );

  if (!activeTeam?.logsEnabled) return <Navigate to={appRoutes.overview} replace />;
  return (
    <LogsErrorBoundary key={location.pathname}>
      <Outlet />
    </LogsErrorBoundary>
  );
}
