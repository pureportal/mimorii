import {
  checkTypes,
  type CheckSummary,
  type CheckType,
  type ResourceSummary,
} from "@mimorii/contracts";
import { useEffect, useState, type FormEvent } from "react";
import {
  buildCheckConfig,
  checkFields,
  initialCheckFields,
  type UpdateCheckField,
} from "./check-form-config";
import {
  DiskCheckFields,
  DnsCheckFields,
  HostCheckFields,
  HttpCheckFields,
  TcpCheckFields,
} from "./check-form-fields";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";
import { Field, FieldError, FieldLabel } from "./ui/field";
import { Input, Select } from "./ui/input";

export interface CheckPayload {
  resourceId: string;
  name: string;
  type: CheckType;
  config: Record<string, unknown>;
  intervalSeconds: number;
  timeoutMs: number;
  failureThreshold: number;
  recoveryThreshold: number;
  enabled: boolean;
}

interface CheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resources: ResourceSummary[];
  initial?: CheckSummary | null;
  defaultResourceId?: string;
  onSubmit: (payload: CheckPayload) => Promise<void>;
}

export function CheckDialog({
  open,
  onOpenChange,
  resources,
  initial,
  defaultResourceId,
  onSubmit,
}: CheckDialogProps) {
  const [resourceId, setResourceId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<CheckType>("http");
  const [fields, setFields] = useState(initialCheckFields);
  const [interval, setInterval] = useState("60");
  const [timeout, setTimeoutValue] = useState("5000");
  const [failureThreshold, setFailureThreshold] = useState("2");
  const [recoveryThreshold, setRecoveryThreshold] = useState("1");
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const selectedResource = resources.find(
      (resource) => resource.id === (initial?.resourceId || defaultResourceId)
    );
    setResourceId(selectedResource?.id ?? resources[0]?.id ?? "");
    setName(initial?.name ?? "Availability");
    setType(initial?.type ?? "http");
    setInterval(String(initial?.intervalSeconds ?? 60));
    setTimeoutValue(String(initial?.timeoutMs ?? 5000));
    setFailureThreshold(String(initial?.failureThreshold ?? 2));
    setRecoveryThreshold(String(initial?.recoveryThreshold ?? 1));
    setEnabled(initial?.enabled ?? true);
    setFields(checkFields(initial?.config));
    setError("");
  }, [defaultResourceId, initial, open, resources]);

  const update: UpdateCheckField = (key, value) => {
    setFields((current) => ({ ...current, [key]: value }));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSubmit({
        resourceId,
        name,
        type,
        config: buildCheckConfig(type, fields),
        intervalSeconds: Number(interval),
        timeoutMs: Number(timeout),
        failureThreshold: Number(failureThreshold),
        recoveryThreshold: Number(recoveryThreshold),
        enabled,
      });
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Check could not be saved");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={initial ? "Edit check" : "Add check"} />
        <form className="grid gap-5" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="check-resource">Resource</FieldLabel>
              <Select
                id="check-resource"
                value={resourceId}
                onChange={(event) => setResourceId(event.target.value)}
                required
              >
                {resources.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="check-name">Name</FieldLabel>
              <Input
                id="check-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                required
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="check-type">Type</FieldLabel>
            <Select
              id="check-type"
              value={type}
              onChange={(event) => {
                const next = checkTypes.find((value) => value === event.target.value);
                if (next) setType(next);
              }}
            >
              <option value="http">HTTP</option>
              <option value="tcp">TCP port</option>
              <option value="dns">DNS record</option>
              <option value="host">Server health</option>
              <option value="disk">Disk usage</option>
            </Select>
          </Field>

          {type === "http" ? <HttpCheckFields fields={fields} update={update} /> : null}
          {type === "tcp" ? <TcpCheckFields fields={fields} update={update} /> : null}
          {type === "dns" ? <DnsCheckFields fields={fields} update={update} /> : null}
          {type === "host" ? <HostCheckFields fields={fields} update={update} /> : null}
          {type === "disk" ? <DiskCheckFields fields={fields} update={update} /> : null}

          <AdvancedFields
            interval={interval}
            timeout={timeout}
            failureThreshold={failureThreshold}
            recoveryThreshold={recoveryThreshold}
            enabled={enabled}
            onIntervalChange={setInterval}
            onTimeoutChange={setTimeoutValue}
            onFailureThresholdChange={setFailureThreshold}
            onRecoveryThresholdChange={setRecoveryThreshold}
            onEnabledChange={setEnabled}
          />

          <FieldError>{error}</FieldError>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="coral" disabled={busy || resources.length === 0}>
              {busy ? "Saving…" : "Save check"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdvancedFields({
  interval,
  timeout,
  failureThreshold,
  recoveryThreshold,
  enabled,
  onIntervalChange,
  onTimeoutChange,
  onFailureThresholdChange,
  onRecoveryThresholdChange,
  onEnabledChange,
}: {
  interval: string;
  timeout: string;
  failureThreshold: string;
  recoveryThreshold: string;
  enabled: boolean;
  onIntervalChange: (value: string) => void;
  onTimeoutChange: (value: string) => void;
  onFailureThresholdChange: (value: string) => void;
  onRecoveryThresholdChange: (value: string) => void;
  onEnabledChange: (value: boolean) => void;
}) {
  return (
    <details className="rounded-2xl border border-line px-4 py-3">
      <summary className="text-sm font-semibold text-ink">Advanced</summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <NumberField
          id="interval"
          label="Interval · seconds"
          value={interval}
          min={30}
          max={86400}
          onChange={onIntervalChange}
        />
        <NumberField
          id="timeout"
          label="Timeout · ms"
          value={timeout}
          min={250}
          max={30000}
          onChange={onTimeoutChange}
        />
        <NumberField
          id="failure-threshold"
          label="Failures before down"
          value={failureThreshold}
          min={1}
          max={10}
          onChange={onFailureThresholdChange}
        />
        <NumberField
          id="recovery-threshold"
          label="Successes before recovery"
          value={recoveryThreshold}
          min={1}
          max={10}
          onChange={onRecoveryThresholdChange}
        />
        <label className="flex items-center gap-2.5 text-sm font-medium">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
            className="size-4 accent-[var(--color-lavender)]"
          />{" "}
          Enabled
        </label>
      </div>
    </details>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  min: number;
  max: number;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </Field>
  );
}
