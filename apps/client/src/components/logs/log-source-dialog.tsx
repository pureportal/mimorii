import {
  logLabelNamePattern,
  type CreatedLogSource,
  type LogSourceSummary,
} from "@mimorii/contracts";
import { LoaderCircle, Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, jsonBody } from "../../lib/api";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "../ui/dialog";
import { Field, FieldError, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";

interface LabelRow {
  name: string;
  value: string;
}

export function LogSourceDialog({
  teamId,
  source,
  onOpenChange,
  onSaved,
}: {
  teamId: string;
  source: LogSourceSummary | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (created: CreatedLogSource | null) => Promise<void>;
}) {
  const [name, setName] = useState(source?.name ?? "");
  const [labels, setLabels] = useState<LabelRow[]>(() => {
    const rows = Object.entries(source?.labels ?? {}).map(([labelName, value]) => ({
      name: labelName,
      value,
    }));
    return rows.length ? rows : [{ name: "service", value: "" }];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateLabel(index: number, change: Partial<LabelRow>) {
    setLabels((rows) =>
      rows.map((row, position) => (position === index ? { ...row, ...change } : row))
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const filled = labels.filter((row) => row.name.trim() || row.value.trim());
    const invalid = filled.find(
      (row) =>
        !logLabelNamePattern.test(row.name.trim()) ||
        row.name.trim() === "level" ||
        !row.value.trim()
    );
    if (invalid) {
      setError(
        invalid.name.trim() === "level"
          ? '"level" is set from each log entry'
          : "Labels need a name of letters, digits, or underscores and a value"
      );
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      name: name.trim(),
      labels: Object.fromEntries(filled.map((row) => [row.name.trim(), row.value.trim()])),
    };
    try {
      if (source) {
        await api(`/teams/${teamId}/logs/sources/${source.id}`, {
          method: "PATCH",
          ...jsonBody(payload),
        });
        toast.success("Source updated");
        await onSaved(null);
      } else {
        const created = await api<CreatedLogSource>(`/teams/${teamId}/logs/sources`, {
          method: "POST",
          ...jsonBody(payload),
        });
        await onSaved(created);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The source could not be saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={source ? "Edit source" : "Add source"} />
        <form className="grid gap-4" onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor="log-source-name">Name</FieldLabel>
            <Input
              id="log-source-name"
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium text-ink">Labels</legend>
            {labels.map((row, index) => (
              <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                <Input
                  aria-label="Label name"
                  value={row.name}
                  spellCheck={false}
                  maxLength={64}
                  onChange={(event) => updateLabel(index, { name: event.target.value })}
                  className="font-mono text-[13px]"
                />
                <Input
                  aria-label="Label value"
                  value={row.value}
                  spellCheck={false}
                  maxLength={256}
                  onChange={(event) => updateLabel(index, { value: event.target.value })}
                  className="font-mono text-[13px]"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove label"
                  onClick={() =>
                    setLabels((rows) => rows.filter((_, position) => position !== index))
                  }
                >
                  <X />
                </Button>
              </div>
            ))}
            {labels.length < 15 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="justify-self-start"
                onClick={() => setLabels((rows) => [...rows, { name: "", value: "" }])}
              >
                <Plus /> Label
              </Button>
            ) : null}
          </fieldset>
          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="coral" disabled={saving}>
              {saving ? <LoaderCircle className="animate-spin" /> : null}
              {source ? "Save source" : "Add source"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
