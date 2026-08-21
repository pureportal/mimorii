import { useLocation, useNavigate } from "react-router-dom";
import { useAndroidBackHandler } from "../lib/android-back";

export function AndroidRouteBackHandler({ enabled }: { enabled: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const root = location.pathname === "/app" || location.pathname === "/login";
  useAndroidBackHandler(() => void navigate(-1), enabled && !root);
  return null;
}
