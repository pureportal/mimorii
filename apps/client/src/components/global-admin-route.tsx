import { Navigate, Outlet } from "react-router-dom";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";

export function GlobalAdminRoute() {
  const { session } = useAuth();
  return session?.user.isGlobalAdmin ? <Outlet /> : <Navigate to={appRoutes.overview} replace />;
}
