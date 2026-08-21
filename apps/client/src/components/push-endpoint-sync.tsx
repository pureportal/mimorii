import { useEffect } from "react";
import { useAuth } from "../lib/auth";
import { listenForPushRegistrationChanges, syncPushEndpoint } from "../lib/push-notifications";

export function PushEndpointSync() {
  const { session } = useAuth();

  useEffect(() => {
    if (!session) return undefined;
    let disposed = false;
    let stop: () => void = () => undefined;
    void syncPushEndpoint().catch(() => undefined);
    void listenForPushRegistrationChanges().then((listener) => {
      if (disposed) listener();
      else stop = listener;
    });
    return () => {
      disposed = true;
      stop();
    };
  }, [session]);

  return null;
}
