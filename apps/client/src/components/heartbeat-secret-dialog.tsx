import { appDefinitions, type AppKind, type CreatedHeartbeatMonitor } from "@mimorii/contracts";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";
import { Input } from "./ui/input";

export function HeartbeatSecretDialog({
  created,
  onClose,
  app = null,
}: {
  created: CreatedHeartbeatMonitor | null;
  onClose: () => void;
  app?: AppKind | null;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const appDefinition = app ? appDefinitions[app] : null;
  const endpoints = created
    ? appDefinition
      ? [{ label: "Enrollment code", value: created.pingToken }]
      : [
          { label: "Success", value: created.pingUrl },
          { label: "Start", value: `${created.pingUrl}/start` },
          { label: "Failure", value: `${created.pingUrl}/fail` },
        ]
    : [];

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      toast.error("Endpoint could not be copied");
    }
  }

  return (
    <Dialog open={Boolean(created)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader
          title={appDefinition ? `${appDefinition.name} enrollment code` : "Heartbeat endpoints"}
        >
          {appDefinition
            ? `Paste this code in ${appDefinition.connectIn}.`
            : "Store these endpoints now. Rotating the token invalidates them."}
        </DialogHeader>
        <div className="grid gap-4">
          {endpoints.map((endpoint) => (
            <div key={endpoint.label}>
              <p className="mb-1.5 text-xs font-semibold text-muted">{endpoint.label}</p>
              <div className="flex gap-2">
                <Input value={endpoint.value} readOnly className="font-mono" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Copy ${endpoint.label.toLowerCase()} endpoint`}
                  onClick={() => void copy(endpoint.label, endpoint.value)}
                >
                  {copied === endpoint.label ? <Check /> : <Copy />}
                </Button>
              </div>
            </div>
          ))}
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
