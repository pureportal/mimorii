import type {
  CreatedHeartbeatMonitor,
  HeartbeatMonitorSummary,
  ResourceSummary,
} from "@mimorii/contracts";
import { Radio } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, jsonBody } from "../lib/api";
import { resourceOptionLabels } from "../lib/resource-option-labels";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";
import { Field, FieldLabel } from "./ui/field";
import { Input, Select } from "./ui/input";

export function HeartbeatDialog({
  open,
  onOpenChange,
  heartbeat,
  resources,
  defaultResourceId,
  teamId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heartbeat: HeartbeatMonitorSummary | null;
  resources: ResourceSummary[];
  defaultResourceId?: string;
  teamId: string;
  onSaved: (created?: CreatedHeartbeatMonitor) => Promise<void>;
}) {
  const resourceLabels = resourceOptionLabels(resources);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const maxRuntime = form.get("maxRuntimeSeconds");
    const payload = {
      resourceId: form.get("resourceId"),
      name: form.get("name"),
      intervalSeconds: Number(form.get("intervalSeconds")),
      graceSeconds: Number(form.get("graceSeconds")),
      maxRuntimeSeconds: maxRuntime ? Number(maxRuntime) : null,
      enabled: form.get("enabled") === "on",
    };
    setSaving(true);
    try {
      if (heartbeat) {
        await api(`/teams/${teamId}/heartbeats/${heartbeat.id}`, {
          method: "PATCH",
          ...jsonBody(payload),
        });
        onOpenChange(false);
        await onSaved();
      } else {
        const created = await api<CreatedHeartbeatMonitor>(`/teams/${teamId}/heartbeats`, {
          method: "POST",
          ...jsonBody(payload),
        });
        onOpenChange(false);
        await onSaved(created);
      }
      toast.success(heartbeat ? "Heartbeat updated" : "Heartbeat added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Heartbeat could not be saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={heartbeat ? "Edit heartbeat" : "Add heartbeat"} />
        <form className="grid gap-4" onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor="heartbeat-name">Name</FieldLabel>
            <Input
              id="heartbeat-name"
              name="name"
              defaultValue={heartbeat?.name}
              required
              maxLength={100}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="heartbeat-resource">Resource</FieldLabel>
            <Select
              id="heartbeat-resource"
              name="resourceId"
              defaultValue={heartbeat?.resourceId ?? defaultResourceId ?? resources[0]?.id}
              required
            >
              {resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resourceLabels.get(resource.id)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="heartbeat-interval">Interval (seconds)</FieldLabel>
              <Input
                id="heartbeat-interval"
                name="intervalSeconds"
                type="number"
                min={60}
                max={2_592_000}
                defaultValue={heartbeat?.intervalSeconds ?? 300}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="heartbeat-grace">Grace (seconds)</FieldLabel>
              <Input
                id="heartbeat-grace"
                name="graceSeconds"
                type="number"
                min={0}
                max={86_400}
                defaultValue={heartbeat?.graceSeconds ?? 60}
                required
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="heartbeat-runtime">Maximum runtime (seconds)</FieldLabel>
            <Input
              id="heartbeat-runtime"
              name="maxRuntimeSeconds"
              type="number"
              min={60}
              max={2_592_000}
              defaultValue={heartbeat?.maxRuntimeSeconds ?? heartbeat?.intervalSeconds ?? 300}
            />
          </Field>
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              name="enabled"
              type="checkbox"
              defaultChecked={heartbeat?.enabled ?? true}
              className="size-4 accent-violet-strong"
            />
            Enabled
          </label>
          <Button type="submit" disabled={saving || resources.length === 0}>
            <Radio /> {heartbeat ? "Save heartbeat" : "Add heartbeat"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
