import type { NotificationPushCapabilities } from "@mimorii/contracts";
import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { devicePushState, enablePush } from "../lib/push-notifications";
import { applicationRuntime } from "../lib/runtime";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

const PROMPTED_KEY = "mimorii.notifications.prompted";

export function BrowserNotificationPrompt() {
  const [capabilities, setCapabilities] = useState<NotificationPushCapabilities | null>(null);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    if (applicationRuntime !== "web" || sessionStorage.getItem(PROMPTED_KEY)) return undefined;
    let active = true;
    void api<NotificationPushCapabilities>("/notifications/push")
      .then(async (availableCapabilities) => ({
        capabilities: availableCapabilities,
        state: await devicePushState(availableCapabilities),
      }))
      .then(({ capabilities: availableCapabilities, state }) => {
        if (
          !active ||
          !state.available ||
          state.permission === "denied" ||
          state.permission === "unavailable" ||
          state.enabled
        )
          return;
        sessionStorage.setItem(PROMPTED_KEY, "true");
        setCapabilities(availableCapabilities);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!capabilities) return null;

  async function enable() {
    const availableCapabilities = capabilities;
    if (!availableCapabilities) return;
    setEnabling(true);
    try {
      await enablePush(availableCapabilities);
      toast.success("Notifications enabled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Notifications could not be enabled");
    } finally {
      setCapabilities(null);
      setEnabling(false);
    }
  }

  return (
    <Card
      role="region"
      aria-labelledby="browser-notification-prompt-title"
      className="mb-6 flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
    >
      <BellRing className="size-5 shrink-0 text-violet-strong" />
      <h2 id="browser-notification-prompt-title" className="min-w-0 flex-1 font-display font-bold">
        Enable browser notifications?
      </h2>
      <div className="flex gap-2">
        <Button type="button" variant="coral" size="sm" disabled={enabling} onClick={enable}>
          Enable
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={enabling}
          onClick={() => setCapabilities(null)}
        >
          Not now
        </Button>
      </div>
    </Card>
  );
}
