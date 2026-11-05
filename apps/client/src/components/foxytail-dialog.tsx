import type { CreatedHeartbeatMonitor } from "@mimorii/contracts";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, jsonBody } from "../lib/api";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "./ui/dialog";
import { Field, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

export function FoxytailDialog({
  teamId,
  onClose,
  onSaved,
}: {
  teamId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [created, setCreated] = useState<CreatedHeartbeatMonitor | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get("name");
    setSaving(true);
    try {
      const result = await api<CreatedHeartbeatMonitor>(`/teams/${teamId}/heartbeats/foxytail`, {
        method: "POST",
        ...jsonBody({ name }),
      });
      setCreated(result);
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enrollment failed. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(created!.pingToken);
      setCopied(true);
    } catch {
      toast.error("Code could not be copied. Select and copy it manually.");
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader title="Connect Foxytail" />
        {created ? (
          <div className="grid gap-4">
            <p className="text-sm text-muted">
              Paste this code in Foxytail → Settings → Monitoring.
            </p>
            <Field>
              <FieldLabel htmlFor="foxytail-code">Enrollment code</FieldLabel>
              <Input id="foxytail-code" value={created.pingToken} readOnly className="font-mono" />
            </Field>
            <DialogFooter>
              <Button variant="outline" onClick={() => void copy()}>
                {copied ? "Copied" : "Copy code"}
              </Button>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={submit}>
            <Field>
              <FieldLabel htmlFor="foxytail-name">Server name</FieldLabel>
              <Input
                id="foxytail-name"
                name="name"
                defaultValue="Foxytail"
                required
                maxLength={100}
                disabled={saving}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="coral" disabled={saving}>
                {saving ? "Creating…" : "Create enrollment code"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
