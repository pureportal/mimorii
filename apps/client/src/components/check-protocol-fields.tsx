import { smtpSecurityModes, type SmtpSecurityMode } from "@mimorii/contracts";
import type { CheckFields, UpdateCheckField } from "./check-form-config";
import { Checkbox, ThresholdField } from "./check-form-fields";
import { Field, FieldLabel } from "./ui/field";
import { Input, Select } from "./ui/input";

interface ProtocolFieldsProps {
  fields: CheckFields;
  update: UpdateCheckField;
}

const smtpSecurityLabels: Record<SmtpSecurityMode, string> = {
  starttls: "STARTTLS",
  tls: "TLS",
  none: "None",
};

const smtpPorts: Record<SmtpSecurityMode, string> = { starttls: "587", tls: "465", none: "25" };

function HostPortFields({ id, fields, update }: ProtocolFieldsProps & { id: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_130px]">
      <Field>
        <FieldLabel htmlFor={`${id}-host`}>Host</FieldLabel>
        <Input
          id={`${id}-host`}
          placeholder={id === "ntp" ? "pool.ntp.org" : "example.com"}
          value={fields.host}
          onChange={(event) => update("host", event.target.value)}
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-port`}>Port</FieldLabel>
        <Input
          id={`${id}-port`}
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

export function TlsCheckFields({ fields, update }: ProtocolFieldsProps) {
  return (
    <div className="grid gap-4">
      <HostPortFields id="tls" fields={fields} update={update} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="tls-server-name">Server name</FieldLabel>
          <Input
            id="tls-server-name"
            value={fields.serverName}
            onChange={(event) => update("serverName", event.target.value)}
            placeholder={fields.host}
          />
        </Field>
        <ThresholdField
          id="tls-warning"
          label="Expiry warning · days"
          value={fields.certificateWarningDays}
          onChange={(value) => update("certificateWarningDays", value)}
          max={365}
        />
      </div>
      <div className="flex gap-5 text-sm">
        <Checkbox
          label="Validate certificate"
          checked={fields.validateTls}
          onChange={(value) => update("validateTls", value)}
        />
      </div>
    </div>
  );
}

export function SmtpCheckFields({ fields, update }: ProtocolFieldsProps) {
  return (
    <div className="grid gap-4">
      <HostPortFields id="smtp" fields={fields} update={update} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="smtp-security">Security</FieldLabel>
          <Select
            id="smtp-security"
            value={fields.smtpSecurity}
            onChange={(event) => {
              const mode = smtpSecurityModes.find((value) => value === event.target.value);
              if (!mode) return;
              update("smtpSecurity", mode);
              if (Object.values(smtpPorts).includes(fields.port)) update("port", smtpPorts[mode]);
            }}
          >
            {smtpSecurityModes.map((mode) => (
              <option key={mode} value={mode}>
                {smtpSecurityLabels[mode]}
              </option>
            ))}
          </Select>
        </Field>
        {fields.smtpSecurity === "none" ? null : (
          <ThresholdField
            id="smtp-warning"
            label="Certificate warning · days"
            value={fields.certificateWarningDays}
            onChange={(value) => update("certificateWarningDays", value)}
            max={365}
          />
        )}
      </div>
      {fields.smtpSecurity === "none" ? null : (
        <div className="flex gap-5 text-sm">
          <Checkbox
            label="Validate certificate"
            checked={fields.validateTls}
            onChange={(value) => update("validateTls", value)}
          />
        </div>
      )}
    </div>
  );
}

export function GrpcCheckFields({ fields, update }: ProtocolFieldsProps) {
  return (
    <div className="grid gap-4">
      <HostPortFields id="grpc" fields={fields} update={update} />
      <Field>
        <FieldLabel htmlFor="grpc-service">Service</FieldLabel>
        <Input
          id="grpc-service"
          value={fields.grpcService}
          onChange={(event) => update("grpcService", event.target.value)}
          placeholder="package.Service"
          maxLength={200}
        />
      </Field>
      <div className="flex flex-wrap gap-5 text-sm">
        <Checkbox
          label="TLS"
          checked={fields.grpcTls}
          onChange={(value) => update("grpcTls", value)}
        />
        {fields.grpcTls ? (
          <Checkbox
            label="Validate certificate"
            checked={fields.validateTls}
            onChange={(value) => update("validateTls", value)}
          />
        ) : null}
      </div>
    </div>
  );
}

export function NtpCheckFields({ fields, update }: ProtocolFieldsProps) {
  return (
    <div className="grid gap-4">
      <HostPortFields id="ntp" fields={fields} update={update} />
      <ThresholdField
        id="ntp-offset"
        label="Offset warning · ms"
        value={fields.offsetWarningMs}
        onChange={(value) => update("offsetWarningMs", value)}
        max={60000}
      />
    </div>
  );
}

export function DomainCheckFields({ fields, update }: ProtocolFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
      <Field>
        <FieldLabel htmlFor="domain-name">Domain</FieldLabel>
        <Input
          id="domain-name"
          value={fields.domain}
          onChange={(event) => update("domain", event.target.value)}
          placeholder="example.com"
          required
        />
      </Field>
      <ThresholdField
        id="domain-warning"
        label="Expiry warning · days"
        value={fields.expiryWarningDays}
        onChange={(value) => update("expiryWarningDays", value)}
        max={365}
      />
    </div>
  );
}
