import { useEffect } from "react";
import { useAuth } from "../lib/auth";
import { listenForPushSubscriptionChanges, syncPushEndpoint } from "../lib/push-notifications";

export function PushEndpointSync() {
  const { session, activeTeam } = useAuth();

  useEffect(() => {
    if (!session || !activeTeam) return undefined;
    void syncPushEndpoint(activeTeam.id).catch(() => undefined);
    return listenForPushSubscriptionChanges(activeTeam.id);
  }, [activeTeam, session]);

  return null;
}
