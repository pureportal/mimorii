import type { CheckType } from "@mimorii/contracts";

export const initialCheckFields = {
  url: "https://example.com/",
  method: "GET",
  statuses: "200",
  content: "",
  expectedHeaders: "",
  jsonPointer: "",
  expectedJsonValue: "",
  latencyWarningMs: "",
  certificateWarningDays: "30",
  followRedirects: true,
  validateTls: true,
  host: "example.com",
  port: "443",
  hostname: "example.com",
  recordType: "A",
  expectedValue: "",
  cpu: "90",
  cpuCritical: "98",
  memory: "90",
  memoryCritical: "98",
  load: "4",
  loadCritical: "8",
  swap: "90",
  swapCritical: "98",
  mount: "/",
  disk: "85",
  diskCritical: "95",
};

export type CheckFields = typeof initialCheckFields;
export type UpdateCheckField = <K extends keyof CheckFields>(key: K, value: CheckFields[K]) => void;

export function checkFields(value: unknown): CheckFields {
  const config = isRecord(value) ? value : undefined;
  return {
    url: stringField(config?.url, initialCheckFields.url),
    method: stringField(config?.method, initialCheckFields.method),
    statuses: statusField(config?.expectedStatuses),
    content: stringField(config?.responseContains, ""),
    expectedHeaders: headersField(config?.expectedHeaders),
    jsonPointer: stringField(config?.jsonPointer, ""),
    expectedJsonValue: jsonValueField(config),
    latencyWarningMs: stringField(config?.latencyWarningMs, ""),
    certificateWarningDays: stringField(config?.certificateWarningDays, "30"),
    followRedirects: config?.followRedirects !== false,
    validateTls: config?.validateTls !== false,
    host: stringField(config?.host, initialCheckFields.host),
    port: stringField(config?.port, initialCheckFields.port),
    hostname: stringField(config?.hostname, initialCheckFields.hostname),
    recordType: stringField(config?.recordType, initialCheckFields.recordType),
    expectedValue: stringField(config?.expectedValue, ""),
    cpu: stringField(config?.cpuWarningPercent, initialCheckFields.cpu),
    cpuCritical: stringField(config?.cpuCriticalPercent, initialCheckFields.cpuCritical),
    memory: stringField(config?.memoryWarningPercent, initialCheckFields.memory),
    memoryCritical: stringField(config?.memoryCriticalPercent, initialCheckFields.memoryCritical),
    load: stringField(config?.loadWarning, initialCheckFields.load),
    loadCritical: stringField(config?.loadCritical, initialCheckFields.loadCritical),
    swap: stringField(config?.swapWarningPercent, initialCheckFields.swap),
    swapCritical: stringField(config?.swapCriticalPercent, initialCheckFields.swapCritical),
    mount: stringField(config?.mount, initialCheckFields.mount),
    disk: stringField(config?.warningPercent, initialCheckFields.disk),
    diskCritical: stringField(config?.criticalPercent, initialCheckFields.diskCritical),
  };
}

export function buildCheckConfig(type: CheckType, fields: CheckFields): Record<string, unknown> {
  switch (type) {
    case "http":
      return {
        url: fields.url,
        method: fields.method,
        expectedStatuses: fields.statuses
          .split(",")
          .map((value) => Number(value.trim()))
          .filter(Number.isFinite),
        ...(fields.content ? { responseContains: fields.content } : {}),
        ...(fields.expectedHeaders.trim()
          ? { expectedHeaders: parseHeaders(fields.expectedHeaders) }
          : {}),
        ...(fields.jsonPointer ? { jsonPointer: fields.jsonPointer } : {}),
        ...(fields.jsonPointer && fields.expectedJsonValue.trim()
          ? { expectedJsonValue: parseJsonValue(fields.expectedJsonValue) }
          : {}),
        ...(fields.latencyWarningMs ? { latencyWarningMs: Number(fields.latencyWarningMs) } : {}),
        ...(fields.certificateWarningDays && fields.url.trim().toLowerCase().startsWith("https://")
          ? { certificateWarningDays: Number(fields.certificateWarningDays) }
          : {}),
        followRedirects: fields.followRedirects,
        validateTls: fields.validateTls,
      };
    case "tcp":
      return { host: fields.host, port: Number(fields.port) };
    case "dns":
      return {
        hostname: fields.hostname,
        recordType: fields.recordType,
        ...(fields.expectedValue ? { expectedValue: fields.expectedValue } : {}),
      };
    case "host":
      return {
        cpuWarningPercent: Number(fields.cpu),
        cpuCriticalPercent: Number(fields.cpuCritical),
        memoryWarningPercent: Number(fields.memory),
        memoryCriticalPercent: Number(fields.memoryCritical),
        loadWarning: Number(fields.load),
        loadCritical: Number(fields.loadCritical),
        swapWarningPercent: Number(fields.swap),
        swapCriticalPercent: Number(fields.swapCritical),
      };
    case "disk":
      return {
        mount: fields.mount,
        warningPercent: Number(fields.disk),
        criticalPercent: Number(fields.diskCritical),
      };
  }
  throw new Error("Unsupported check type");
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function statusField(value: unknown): string {
  return Array.isArray(value) && value.every((status) => typeof status === "number")
    ? value.join(", ")
    : initialCheckFields.statuses;
}

function headersField(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([name, expected]) => `${name}: ${expected}`)
    .join("\n");
}

function jsonValueField(config: Record<string, unknown> | undefined): string {
  if (!config || !Object.hasOwn(config, "expectedJsonValue")) return "";
  return JSON.stringify(config.expectedJsonValue) ?? "";
}

function parseHeaders(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(":");
        if (separator < 1) throw new Error("Expected headers must use name: value");
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      })
  );
}

function parseJsonValue(value: string): string | number | boolean | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("Expected JSON value is invalid");
  }
  if (parsed === null || typeof parsed === "string") return parsed;
  if (typeof parsed === "number" || typeof parsed === "boolean") return parsed;
  throw new Error("Expected JSON value must be a string, number, boolean, or null");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
