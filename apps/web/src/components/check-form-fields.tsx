import type { CheckFields, UpdateCheckField } from "./check-form-config";
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
            <option>GET</option>
            <option>HEAD</option>
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="http-json-pointer">JSON pointer</FieldLabel>
          <Input
            id="http-json-pointer"
            value={fields.jsonPointer}
            onChange={(event) => update("jsonPointer", event.target.value)}
            placeholder="/data/status"
            disabled={fields.method === "HEAD"}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="http-json-value">Expected JSON value</FieldLabel>
          <Input
            id="http-json-value"
            value={fields.expectedJsonValue}
            onChange={(event) => update("expectedJsonValue", event.target.value)}
            placeholder={'"ok"'}
            disabled={fields.method === "HEAD" || !fields.jsonPointer}
          />
        </Field>
      </div>
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

function ThresholdField({
  id,
  label,
  value,
  onChange,
  max,
  step,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max?: number;
  step?: number;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        min={step ?? 1}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
