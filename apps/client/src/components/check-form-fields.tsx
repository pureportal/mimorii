import { httpJsonAssertionOperators, httpMethods } from "@mimorii/contracts";
import { FolderPlus, Plus, Trash2 } from "lucide-react";
import type {
  CheckFields,
  JsonAssertionField,
  JsonAssertionGroupField,
  JsonAssertionNodeField,
  UpdateCheckField,
} from "./check-form-config";
import { Button } from "./ui/button";
import { Field, FieldLabel } from "./ui/field";
import { Input, Select, Textarea } from "./ui/input";

interface CheckFormFieldsProps {
  fields: CheckFields;
  update: UpdateCheckField;
}

export function HttpCheckFields({ fields, update }: CheckFormFieldsProps) {
  return (
    <div className="grid gap-4">
      <Field>
        <FieldLabel htmlFor="http-url">URL</FieldLabel>
        <Input
          id="http-url"
          type="url"
          value={fields.url}
          onChange={(event) => update("url", event.target.value)}
          required
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="http-method">Method</FieldLabel>
          <Select
            id="http-method"
            value={fields.method}
            onChange={(event) => update("method", event.target.value)}
          >
            {httpMethods.map((method) => (
              <option key={method}>{method}</option>
            ))}
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="http-statuses">Expected status</FieldLabel>
          <Input
            id="http-statuses"
            value={fields.statuses}
            onChange={(event) => update("statuses", event.target.value)}
            placeholder="200, 204"
            required
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="http-secret-header">Secret header</FieldLabel>
        <Input
          id="http-secret-header"
          value={fields.secretHeaderName}
          onChange={(event) => update("secretHeaderName", event.target.value)}
          placeholder="authorization"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="http-request-headers">Request headers</FieldLabel>
          <Textarea
            id="http-request-headers"
            value={fields.requestHeaders}
            onChange={(event) => update("requestHeaders", event.target.value)}
            placeholder="x-probe: mimorii"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="http-request-body">Request body</FieldLabel>
          <Textarea
            id="http-request-body"
            value={fields.requestBody}
            onChange={(event) => update("requestBody", event.target.value)}
            disabled={fields.method === "GET" || fields.method === "HEAD"}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="http-content">Response contains</FieldLabel>
        <Input
          id="http-content"
          value={fields.content}
          onChange={(event) => update("content", event.target.value)}
          disabled={fields.method === "HEAD"}
          maxLength={512}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="http-headers">Expected headers</FieldLabel>
        <Textarea
          id="http-headers"
          value={fields.expectedHeaders}
          onChange={(event) => update("expectedHeaders", event.target.value)}
          placeholder="content-type: application/json"
        />
      </Field>
      <JsonAssertionGroupEditor
        group={fields.jsonAssertions}
        disabled={fields.method === "HEAD"}
        depth={0}
        root
        onChange={(value) => update("jsonAssertions", value)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="http-latency-warning">Latency warning · ms</FieldLabel>
          <Input
            id="http-latency-warning"
            type="number"
            min={1}
            max={30000}
            value={fields.latencyWarningMs}
            onChange={(event) => update("latencyWarningMs", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="http-certificate-warning">Certificate warning · days</FieldLabel>
          <Input
            id="http-certificate-warning"
            type="number"
            min={1}
            max={365}
            value={fields.certificateWarningDays}
            onChange={(event) => update("certificateWarningDays", event.target.value)}
            disabled={!fields.url.trim().toLowerCase().startsWith("https://")}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-5 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={fields.followRedirects}
            onChange={(event) => update("followRedirects", event.target.checked)}
            className="size-4 accent-[var(--color-lavender)]"
          />{" "}
          Follow redirects
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={fields.validateTls}
            onChange={(event) => update("validateTls", event.target.checked)}
            className="size-4 accent-[var(--color-lavender)]"
          />{" "}
          Validate TLS
        </label>
      </div>
    </div>
  );
}

function JsonAssertionGroupEditor({
  group,
  disabled,
  depth,
  root = false,
  onChange,
  onRemove,
}: {
  group: JsonAssertionGroupField;
  disabled: boolean;
  depth: number;
  root?: boolean;
  onChange: (value: JsonAssertionGroupField) => void;
  onRemove?: () => void;
}) {
  const updateNode = (
    id: string,
    transform: (node: JsonAssertionNodeField) => JsonAssertionNodeField
  ) => onChange(updateAssertionNode(group, id, transform));
  const removeNode = (id: string) => onChange(removeAssertionNode(group, id));
  const addAssertion = () =>
    onChange({
      ...group,
      conditions: [...group.conditions, newAssertion(group.conditions.length + 1)],
    });
  const addGroup = () =>
    onChange({
      ...group,
      conditions: [...group.conditions, newAssertionGroup(group.conditions.length + 1)],
    });

  return (
    <div className={`grid gap-3 ${root ? "" : "rounded-2xl border border-line p-3"}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field className="w-32">
          <FieldLabel htmlFor={root ? "http-json-operator" : `json-group-${group.id}`}>
            {root ? "JSON assertions" : "Group"}
          </FieldLabel>
          <Select
            id={root ? "http-json-operator" : `json-group-${group.id}`}
            value={group.operator}
            onChange={(event) =>
              onChange({ ...group, operator: event.target.value === "or" ? "or" : "and" })
            }
            disabled={disabled}
          >
            <option value="and">All</option>
            <option value="or">Any</option>
          </Select>
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={addAssertion}
            disabled={disabled || group.conditions.length >= 20}
          >
            <Plus className="size-4" /> Add assertion
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={addGroup}
            disabled={disabled || depth >= 3 || group.conditions.length >= 20}
          >
            <FolderPlus className="size-4" /> Add group
          </Button>
          {onRemove ? (
            <Button type="button" variant="ghost" aria-label="Remove group" onClick={onRemove}>
              <Trash2 className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>
      {group.conditions.map((node) =>
        node.kind === "group" ? (
          <JsonAssertionGroupEditor
            key={node.id}
            group={node}
            disabled={disabled}
            depth={depth + 1}
            onChange={(value) => updateNode(node.id, () => value)}
            onRemove={root || group.conditions.length > 1 ? () => removeNode(node.id) : undefined}
          />
        ) : (
          <JsonAssertionEditor
            key={node.id}
            assertion={node}
            disabled={disabled}
            removable={root || group.conditions.length > 1}
            onChange={(value) => updateNode(node.id, () => value)}
            onRemove={() => removeNode(node.id)}
          />
        )
      )}
    </div>
  );
}

function JsonAssertionEditor({
  assertion,
  disabled,
  removable,
  onChange,
  onRemove,
}: {
  assertion: JsonAssertionField;
  disabled: boolean;
  removable: boolean;
  onChange: (value: JsonAssertionField) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-2 rounded-2xl border border-line p-3 sm:grid-cols-[1fr_1fr_150px_1fr_auto]">
      <Input
        aria-label="Assertion name"
        value={assertion.name}
        onChange={(event) => onChange({ ...assertion, name: event.target.value })}
        disabled={disabled}
        required
      />
      <Input
        aria-label="JSON pointer"
        value={assertion.pointer}
        onChange={(event) => onChange({ ...assertion, pointer: event.target.value })}
        placeholder="/service/status"
        disabled={disabled}
        required
      />
      <Select
        aria-label="Assertion operator"
        value={assertion.operator}
        onChange={(event) => {
          const operator = httpJsonAssertionOperators.find((item) => item === event.target.value);
          if (operator) onChange({ ...assertion, operator });
        }}
        disabled={disabled}
      >
        {httpJsonAssertionOperators.map((operator) => (
          <option key={operator} value={operator}>
            {operator}
          </option>
        ))}
      </Select>
      <Input
        aria-label="Expected JSON value"
        value={assertion.expectedValue}
        onChange={(event) => onChange({ ...assertion, expectedValue: event.target.value })}
        disabled={disabled || assertion.operator === "exists"}
        required={assertion.operator !== "exists"}
      />
      <Button
        type="button"
        variant="ghost"
        aria-label="Remove assertion"
        onClick={onRemove}
        disabled={disabled || !removable}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function newAssertion(index: number): JsonAssertionField {
  return {
    kind: "assertion",
    id: crypto.randomUUID(),
    name: `Assertion ${index}`,
    pointer: "",
    operator: "equals",
    expectedValue: '"ok"',
  };
}

function newAssertionGroup(index: number): JsonAssertionGroupField {
  return {
    kind: "group",
    id: crypto.randomUUID(),
    operator: "and",
    conditions: [newAssertion(index)],
  };
}

function updateAssertionNode(
  group: JsonAssertionGroupField,
  id: string,
  transform: (node: JsonAssertionNodeField) => JsonAssertionNodeField
): JsonAssertionGroupField {
  return {
    ...group,
    conditions: group.conditions.map((node) => {
      if (node.id === id) return transform(node);
      return node.kind === "group" ? updateAssertionNode(node, id, transform) : node;
    }),
  };
}

function removeAssertionNode(group: JsonAssertionGroupField, id: string): JsonAssertionGroupField {
  return {
    ...group,
    conditions: group.conditions
      .filter((node) => node.id !== id)
      .map((node) => (node.kind === "group" ? removeAssertionNode(node, id) : node)),
  };
}

export function TcpCheckFields({ fields, update }: CheckFormFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_130px]">
      <Field>
        <FieldLabel htmlFor="tcp-host">Host</FieldLabel>
        <Input
          id="tcp-host"
          value={fields.host}
          onChange={(event) => update("host", event.target.value)}
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="tcp-port">Port</FieldLabel>
        <Input
          id="tcp-port"
          type="number"
          min={1}
          max={65535}
          value={fields.port}
          onChange={(event) => update("port", event.target.value)}
          required
        />
      </Field>
    </div>
  );
}

export function DnsCheckFields({ fields, update }: CheckFormFieldsProps) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <Field>
          <FieldLabel htmlFor="dns-host">Hostname</FieldLabel>
          <Input
            id="dns-host"
            value={fields.hostname}
            onChange={(event) => update("hostname", event.target.value)}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="dns-type">Record</FieldLabel>
          <Select
            id="dns-type"
            value={fields.recordType}
            onChange={(event) => update("recordType", event.target.value)}
          >
            {["A", "AAAA", "CNAME", "MX", "NS", "SRV", "TXT"].map((type) => (
              <option key={type}>{type}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="dns-value">Expected value</FieldLabel>
        <Input
          id="dns-value"
          value={fields.expectedValue}
          onChange={(event) => update("expectedValue", event.target.value)}
          maxLength={512}
        />
      </Field>
    </div>
  );
}

export function HostCheckFields({ fields, update }: CheckFormFieldsProps) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <ThresholdField
          id="host-cpu"
          label="CPU warning · %"
          value={fields.cpu}
          onChange={(value) => update("cpu", value)}
          max={100}
        />
        <ThresholdField
          id="host-cpu-critical"
          label="CPU critical · %"
          value={fields.cpuCritical}
          onChange={(value) => update("cpuCritical", value)}
          max={100}
        />
        <ThresholdField
          id="host-memory"
          label="Memory warning · %"
          value={fields.memory}
          onChange={(value) => update("memory", value)}
          max={100}
        />
        <ThresholdField
          id="host-memory-critical"
          label="Memory critical · %"
          value={fields.memoryCritical}
          onChange={(value) => update("memoryCritical", value)}
          max={100}
        />
        <ThresholdField
          id="host-swap"
          label="Swap warning · %"
          value={fields.swap}
          onChange={(value) => update("swap", value)}
          max={100}
        />
        <ThresholdField
          id="host-swap-critical"
          label="Swap critical · %"
          value={fields.swapCritical}
          onChange={(value) => update("swapCritical", value)}
          max={100}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={fields.monitorLoad}
          onChange={(event) => update("monitorLoad", event.target.checked)}
          className="size-4 accent-[var(--color-lavender)]"
        />
        Load average
      </label>
      {fields.monitorLoad ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <ThresholdField
            id="host-load"
            label="Load warning"
            value={fields.load}
            onChange={(value) => update("load", value)}
            step={0.1}
          />
          <ThresholdField
            id="host-load-critical"
            label="Load critical"
            value={fields.loadCritical}
            onChange={(value) => update("loadCritical", value)}
            step={0.1}
          />
        </div>
      ) : null}
    </div>
  );
}

export function DiskCheckFields({ fields, update }: CheckFormFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_140px_140px]">
      <Field>
        <FieldLabel htmlFor="disk-mount">Mount</FieldLabel>
        <Input
          id="disk-mount"
          value={fields.mount}
          onChange={(event) => update("mount", event.target.value)}
          required
        />
      </Field>
      <ThresholdField
        id="disk-warning"
        label="Warning · %"
        value={fields.disk}
        onChange={(value) => update("disk", value)}
        max={100}
      />
      <ThresholdField
        id="disk-critical"
        label="Critical · %"
        value={fields.diskCritical}
        onChange={(value) => update("diskCritical", value)}
        max={100}
      />
    </div>
  );
}

export function IcmpCheckFields({ fields, update }: CheckFormFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field>
        <FieldLabel htmlFor="icmp-host">Host</FieldLabel>
        <Input
          id="icmp-host"
          value={fields.icmpHost}
          onChange={(event) => update("icmpHost", event.target.value)}
          required
        />
      </Field>
      <ThresholdField
        id="icmp-packets"
        label="Packets"
        value={fields.packetCount}
        onChange={(value) => update("packetCount", value)}
        max={10}
      />
      <ThresholdField
        id="icmp-success"
        label="Minimum success · %"
        value={fields.minimumSuccessPercent}
        onChange={(value) => update("minimumSuccessPercent", value)}
        max={100}
      />
      <ThresholdField
        id="icmp-latency"
        label="Latency warning · ms"
        value={fields.latencyWarningMs}
        onChange={(value) => update("latencyWarningMs", value)}
        max={30000}
      />
    </div>
  );
}

export function WanCheckFields({ fields, update }: CheckFormFieldsProps) {
  return (
    <div className="grid gap-4">
      <Field>
        <FieldLabel htmlFor="wan-targets">Targets</FieldLabel>
        <Textarea
          id="wan-targets"
          value={fields.wanTargets}
          onChange={(event) => update("wanTargets", event.target.value)}
          placeholder="Cloudflare: 1.1.1.1"
          required
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <ThresholdField
          id="wan-required"
          label="Required targets"
          value={fields.requiredSuccessfulTargets}
          onChange={(value) => update("requiredSuccessfulTargets", value)}
          max={12}
        />
        <ThresholdField
          id="wan-packets"
          label="Packets per target"
          value={fields.packetCount}
          onChange={(value) => update("packetCount", value)}
          max={10}
        />
        <ThresholdField
          id="wan-latency"
          label="Latency warning · ms"
          value={fields.latencyWarningMs}
          onChange={(value) => update("latencyWarningMs", value)}
          max={30000}
        />
      </div>
    </div>
  );
}

export function DockerCheckFields({ fields, update }: CheckFormFieldsProps) {
  return (
    <div className="grid gap-4">
      <Field>
        <FieldLabel htmlFor="docker-pattern">Container name</FieldLabel>
        <Input
          id="docker-pattern"
          value={fields.containerNamePattern}
          onChange={(event) => update("containerNamePattern", event.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <ThresholdField
          id="docker-restarts"
          label="Maximum restarts"
          value={fields.maximumRestarts}
          onChange={(value) => update("maximumRestarts", value)}
          min={0}
        />
        <ThresholdField
          id="docker-cpu"
          label="CPU warning · %"
          value={fields.containerCpu}
          onChange={(value) => update("containerCpu", value)}
          max={100}
        />
        <ThresholdField
          id="docker-memory"
          label="Memory warning · %"
          value={fields.containerMemory}
          onChange={(value) => update("containerMemory", value)}
          max={100}
        />
      </div>
      <div className="flex gap-5 text-sm">
        <Checkbox
          label="Require running"
          checked={fields.requireRunning}
          onChange={(value) => update("requireRunning", value)}
        />
        <Checkbox
          label="Require healthy"
          checked={fields.requireHealthy}
          onChange={(value) => update("requireHealthy", value)}
        />
      </div>
    </div>
  );
}

export function DatabaseCheckFields({ fields, update }: CheckFormFieldsProps) {
  const changeEngine = (engine: "postgresql" | "mysql" | "redis") => {
    update("databaseEngine", engine);
    update("databasePort", engine === "mysql" ? "3306" : engine === "redis" ? "6379" : "5432");
  };
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-[150px_1fr_120px]">
        <Field>
          <FieldLabel htmlFor="database-engine">Engine</FieldLabel>
          <Select
            id="database-engine"
            value={fields.databaseEngine}
            onChange={(event) =>
              changeEngine(event.target.value as "postgresql" | "mysql" | "redis")
            }
          >
            <option value="postgresql">PostgreSQL</option>
            <option value="mysql">MySQL</option>
            <option value="redis">Redis</option>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="database-host">Host</FieldLabel>
          <Input
            id="database-host"
            value={fields.databaseHost}
            onChange={(event) => update("databaseHost", event.target.value)}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="database-port">Port</FieldLabel>
          <Input
            id="database-port"
            type="number"
            min={1}
            max={65535}
            value={fields.databasePort}
            onChange={(event) => update("databasePort", event.target.value)}
            required
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="database-name">Database</FieldLabel>
          <Input
            id="database-name"
            value={fields.databaseName}
            onChange={(event) => update("databaseName", event.target.value)}
            required={fields.databaseEngine !== "redis"}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="database-username">Username</FieldLabel>
          <Input
            id="database-username"
            value={fields.databaseUsername}
            onChange={(event) => update("databaseUsername", event.target.value)}
            required={fields.databaseEngine !== "redis"}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <ThresholdField
          id="database-connections"
          label="Connection warning · %"
          value={fields.connectionWarningPercent}
          onChange={(value) => update("connectionWarningPercent", value)}
          max={100}
        />
        <ThresholdField
          id="database-replication"
          label="Replication lag · seconds"
          value={fields.replicationLagWarningSeconds}
          onChange={(value) => update("replicationLagWarningSeconds", value)}
        />
        <ThresholdField
          id="database-slow"
          label="Slow query count"
          value={fields.slowQueryWarningCount}
          onChange={(value) => update("slowQueryWarningCount", value)}
          min={0}
        />
      </div>
      {fields.databaseEngine !== "redis" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="database-query">Read-only query</FieldLabel>
            <Textarea
              id="database-query"
              value={fields.databaseQuery}
              onChange={(event) => update("databaseQuery", event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="database-expected">Expected value</FieldLabel>
            <Input
              id="database-expected"
              value={fields.databaseExpectedValue}
              onChange={(event) => update("databaseExpectedValue", event.target.value)}
              disabled={!fields.databaseQuery}
            />
          </Field>
        </div>
      ) : null}
      <Checkbox
        label="TLS"
        checked={fields.databaseTls}
        onChange={(value) => update("databaseTls", value)}
      />
    </div>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-[var(--color-lavender)]"
      />{" "}
      {label}
    </label>
  );
}

function ThresholdField({
  id,
  label,
  value,
  onChange,
  max,
  min,
  step,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max?: number;
  min?: number;
  step?: number;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        min={min ?? step ?? 1}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
