import type { NotificationPushCapabilities } from "@mimorii/contracts";
import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { devicePushState, enablePush, type DevicePushState } from "../lib/push-notifications";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

const PROMPTED_KEY = "mimorii.notifications.prompted";

interface NotificationPromptState {
  capabilities: NotificationPushCapabilities;
  platform: Exclude<DevicePushState["platform"], null>;
}

export function DeviceNotificationPrompt() {
  const [prompt, setPrompt] = useState<NotificationPromptState | null>(null);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(PROMPTED_KEY)) return undefined;
    let active = true;
    void api<NotificationPushCapabilities>("/notifications/push")
      .then(async (capabilities) => ({
        capabilities,
        state: await devicePushState(capabilities),
      }))
      .then(({ capabilities, state }) => {
        if (
          !active ||
          !state.platform ||
          !state.available ||
          state.permission === "denied" ||
          state.permission === "unavailable" ||
          state.enabled
        )
          return;
        sessionStorage.setItem(PROMPTED_KEY, "true");
        setPrompt({ capabilities, platform: state.platform });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!prompt) return null;

  async function enable() {
    if (!prompt) return;
    setEnabling(true);
    try {
      await enablePush(prompt.capabilities);
      toast.success("Notifications enabled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Notifications could not be enabled");
    } finally {
      setPrompt(null);
      setEnabling(false);
    }
  }

  return (
    <Card
      role="region"
      aria-labelledby="device-notification-prompt-title"
      className="mb-6 flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
    >
      <BellRing className="size-5 shrink-0 text-violet-strong" />
      <h2 id="device-notification-prompt-title" className="min-w-0 flex-1 font-display font-bold">
        {prompt.platform === "web" ? "Enable browser notifications?" : "Enable notifications?"}
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
          onClick={() => setPrompt(null)}
        >
          Not now
        </Button>
      </div>
    </Card>
  );
}
