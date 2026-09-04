import {
  checkTypes,
  type CheckExecution,
  type CheckSummary,
  type CheckType,
  type ResourceSummary,
} from "@mimorii/contracts";
import { useEffect, useState, type FormEvent } from "react";
import {
  buildCheckConfig,
  checkFields,
  initialCheckFields,
  type CheckFields,
  type UpdateCheckField,
} from "./check-form-config";
import {
  DockerCheckFields,
  DatabaseCheckFields,
  DiskCheckFields,
  DnsCheckFields,
  HostCheckFields,
  HttpCheckFields,
  IcmpCheckFields,
  TcpCheckFields,
  WanCheckFields,
} from "./check-form-fields";
import { resourceOptionLabels } from "../lib/resource-option-labels";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";
import { Field, FieldError, FieldLabel } from "./ui/field";
import { Input, PasswordInput, Select } from "./ui/input";

export interface CheckPayload {
  resourceId: string;
  name: string;
  type: CheckType;
  config: Record<string, unknown>;
  execution: CheckExecution;
  secret?: string | null;
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

const checkTypeNames: Record<CheckType, string> = {
  http: "HTTP",
  tcp: "TCP port",
  dns: "DNS record",
  icmp: "ICMP ping",
  wan: "WAN reachability",
  host: "Host health",
  disk: "Disk usage",
  docker: "Docker",
  database: "Database",
};

function localFieldsForResource(fields: CheckFields, resource: ResourceSummary): CheckFields {
  const windows = resource.agent?.platform?.toLowerCase().includes("windows") === true;
  return {
    ...fields,
    monitorLoad: !windows,
    mount: windows ? "C:" : "/",
  };
}

export function CheckDialog({
  open,
  onOpenChange,
  resources,
  initial,
  defaultResourceId,
  onSubmit,
}: CheckDialogProps) {
  const resourceLabels = resourceOptionLabels(resources);
  const [resourceId, setResourceId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<CheckType>("http");
  const [fields, setFields] = useState(initialCheckFields);
  const [interval, setInterval] = useState("60");
  const [timeout, setTimeoutValue] = useState("5000");
  const [failureThreshold, setFailureThreshold] = useState("2");
  const [recoveryThreshold, setRecoveryThreshold] = useState("1");
  const [enabled, setEnabled] = useState(true);
  const [executionKind, setExecutionKind] = useState<"direct" | "agent">("direct");
  const [agentId, setAgentId] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const selectedResource = resources.find(
      (resource) => resource.id === (initial?.resourceId || defaultResourceId)
    );
    setResourceId(selectedResource?.id ?? resources[0]?.id ?? "");
    setName(initial?.name ?? "");
    setType(initial?.type ?? "http");
    setInterval(String(initial?.intervalSeconds ?? 60));
    setTimeoutValue(String(initial?.timeoutMs ?? 5000));
    setFailureThreshold(String(initial?.failureThreshold ?? 2));
    setRecoveryThreshold(String(initial?.recoveryThreshold ?? 1));
    setEnabled(initial?.enabled ?? true);
    setExecutionKind(initial?.execution.kind ?? "direct");
    setAgentId(initial?.execution.kind === "agent" ? initial.execution.agentId : "");
    setSecret("");
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
        name: name.trim() ? name : checkTypeNames[type],
        type,
        config: buildCheckConfig(type, fields),
        execution: executionKind === "agent" ? { kind: "agent", agentId } : { kind: "direct" },
        ...(secret
          ? { secret }
          : initial?.secretConfigured && type === "http" && !fields.secretHeaderName.trim()
            ? { secret: null }
            : {}),
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
                onChange={(event) => {
                  setResourceId(event.target.value);
                  if (["host", "disk", "docker"].includes(type)) {
                    const resource = resources.find((item) => item.id === event.target.value);
                    if (resource?.agent) setAgentId(resource.agent.id);
                    if ((type === "host" || type === "disk") && resource) {
                      setFields((current) => localFieldsForResource(current, resource));
                    }
                  }
                }}
                required
              >
                {resources
                  .filter(
                    (resource) =>
                      !["host", "disk", "docker"].includes(type) ||
                      resource.agent?.kind === "desktop"
                  )
                  .map((resource) => (
                    <option key={resource.id} value={resource.id}>
                      {resourceLabels.get(resource.id)}
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
                if (next) {
                  setType(next);
                  if (["host", "disk", "docker"].includes(next)) {
                    const resource =
                      resources.find(
                        (item) => item.id === resourceId && item.agent?.kind === "desktop"
                      ) ?? resources.find((item) => item.agent?.kind === "desktop");
                    if (resource?.agent) {
                      setResourceId(resource.id);
                      setExecutionKind("agent");
                      setAgentId(resource.agent.id);
                      if (next === "host" || next === "disk") {
                        setFields((current) => localFieldsForResource(current, resource));
                      }
                    }
                  }
                }
              }}
            >
              {checkTypes.map((value) => (
                <option key={value} value={value}>
                  {checkTypeNames[value]}
                </option>
              ))}
            </Select>
          </Field>

          {type === "http" ? <HttpCheckFields fields={fields} update={update} /> : null}
          {type === "tcp" ? <TcpCheckFields fields={fields} update={update} /> : null}
          {type === "dns" ? <DnsCheckFields fields={fields} update={update} /> : null}
          {type === "icmp" ? <IcmpCheckFields fields={fields} update={update} /> : null}
          {type === "wan" ? <WanCheckFields fields={fields} update={update} /> : null}
          {type === "host" ? <HostCheckFields fields={fields} update={update} /> : null}
          {type === "disk" ? <DiskCheckFields fields={fields} update={update} /> : null}
          {type === "docker" ? <DockerCheckFields fields={fields} update={update} /> : null}
          {type === "database" ? <DatabaseCheckFields fields={fields} update={update} /> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="check-execution">Execution</FieldLabel>
              <Select
                id="check-execution"
                value={executionKind}
                disabled={["host", "disk", "docker"].includes(type)}
                onChange={(event) => {
                  const kind = event.target.value === "agent" ? "agent" : "direct";
                  setExecutionKind(kind);
                  if (kind === "agent" && !agentId) {
                    setAgentId(
                      resources.find((resource) => resource.agent?.kind === "desktop")?.agent?.id ??
                        ""
                    );
                  }
                }}
              >
                <option value="direct">Direct</option>
                <option value="agent">Agent</option>
              </Select>
            </Field>
            {executionKind === "agent" ? (
              <Field>
                <FieldLabel htmlFor="check-agent">Agent</FieldLabel>
                <Select
                  id="check-agent"
                  value={agentId}
                  onChange={(event) => setAgentId(event.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select agent
                  </option>
                  {resources
                    .filter((resource) => resource.agent?.kind === "desktop")
                    .map((resource) => (
                      <option key={resource.agent!.id} value={resource.agent!.id}>
                        {resourceLabels.get(resource.id)}
                      </option>
                    ))}
                </Select>
              </Field>
            ) : null}
            {type === "database" || (type === "http" && fields.secretHeaderName.trim()) ? (
              <Field>
                <FieldLabel htmlFor="check-secret">
                  {type === "database" ? "Password" : "Secret header value"}
                </FieldLabel>
                <PasswordInput
                  id="check-secret"
                  visibilityLabel={type === "database" ? "password" : "secret header value"}
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  autoComplete="new-password"
                />
              </Field>
            ) : null}
          </div>

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
          label="Consecutive breaches before alert"
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
