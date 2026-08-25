import type {
  CheckType,
  HttpJsonAssertionGroup,
  HttpJsonAssertionNode,
  HttpJsonAssertionOperator,
} from "@mimorii/contracts";

export interface JsonAssertionField {
  kind: "assertion";
  id: string;
  name: string;
  pointer: string;
  operator: HttpJsonAssertionOperator;
  expectedValue: string;
}

export interface JsonAssertionGroupField {
  kind: "group";
  id: string;
  operator: "and" | "or";
  conditions: JsonAssertionNodeField[];
}

export type JsonAssertionNodeField = JsonAssertionField | JsonAssertionGroupField;

export const initialCheckFields = {
  url: "https://example.com/",
  method: "GET",
  requestHeaders: "",
  secretHeaderName: "",
  requestBody: "",
  statuses: "200",
  content: "",
  expectedHeaders: "",
  jsonAssertions: {
    kind: "group",
    id: "assertion-root",
    operator: "and",
    conditions: [],
  } as JsonAssertionGroupField,
  latencyWarningMs: "",
  certificateWarningDays: "30",
  followRedirects: true,
  validateTls: true,
  host: "example.com",
  port: "443",
  hostname: "example.com",
  recordType: "A",
  expectedValue: "",
  icmpHost: "1.1.1.1",
  packetCount: "3",
  minimumSuccessPercent: "100",
  wanTargets: "Cloudflare: 1.1.1.1\nGoogle: 8.8.8.8",
  requiredSuccessfulTargets: "2",
  cpu: "90",
  cpuCritical: "98",
  memory: "90",
  memoryCritical: "98",
  load: "4",
  loadCritical: "8",
  monitorLoad: true,
  swap: "90",
  swapCritical: "98",
  mount: "/",
  disk: "85",
  diskCritical: "95",
  containerNamePattern: "*",
  requireHealthy: true,
  requireRunning: true,
  maximumRestarts: "3",
  containerCpu: "90",
  containerMemory: "90",
  databaseEngine: "postgresql" as "postgresql" | "mysql" | "redis",
  databaseHost: "localhost",
  databasePort: "5432",
  databaseName: "",
  databaseUsername: "",
  databaseTls: false,
  connectionWarningPercent: "85",
  replicationLagWarningSeconds: "",
  slowQueryWarningCount: "",
  databaseQuery: "",
  databaseExpectedValue: "",
};

export type CheckFields = typeof initialCheckFields;
export type UpdateCheckField = <K extends keyof CheckFields>(key: K, value: CheckFields[K]) => void;

export function checkFields(value: unknown): CheckFields {
  const config = isRecord(value) ? value : undefined;
  const target = isRecord(config?.target) ? config.target : undefined;
  const databaseEngine = stringField(target?.engine, "postgresql");
  const assertions = isRecord(config?.jsonAssertions) ? config.jsonAssertions : undefined;
  const query = isRecord(config?.query) ? config.query : undefined;
  return {
    ...initialCheckFields,
    url: stringField(target?.url, initialCheckFields.url),
    method: stringField(target?.method, initialCheckFields.method),
    requestHeaders: headersField(target?.headers),
    secretHeaderName: stringField(target?.secretHeaderName, ""),
    requestBody: stringField(target?.body, ""),
    statuses: statusField(config?.expectedStatuses),
    content: stringField(config?.responseContains, ""),
    expectedHeaders: headersField(config?.expectedHeaders),
    jsonAssertions: assertionFields(assertions),
    latencyWarningMs: stringField(config?.latencyWarningMs, ""),
    certificateWarningDays: stringField(config?.certificateWarningDays, "30"),
    followRedirects: config?.followRedirects !== false,
    validateTls: config?.validateTls !== false,
    host: stringField(target?.host, initialCheckFields.host),
    port: stringField(target?.port, initialCheckFields.port),
    hostname: stringField(target?.hostname, initialCheckFields.hostname),
    recordType: stringField(config?.recordType, initialCheckFields.recordType),
    expectedValue: stringField(config?.expectedValue, ""),
    icmpHost: stringField(target?.host, initialCheckFields.icmpHost),
    packetCount: stringField(config?.packetCount, initialCheckFields.packetCount),
    minimumSuccessPercent: stringField(
      config?.minimumSuccessPercent,
      initialCheckFields.minimumSuccessPercent
    ),
    wanTargets: wanTargetsField(config?.targets),
    requiredSuccessfulTargets: stringField(
      config?.requiredSuccessfulTargets,
      initialCheckFields.requiredSuccessfulTargets
    ),
    cpu: stringField(config?.cpuWarningPercent, initialCheckFields.cpu),
    cpuCritical: stringField(config?.cpuCriticalPercent, initialCheckFields.cpuCritical),
    memory: stringField(config?.memoryWarningPercent, initialCheckFields.memory),
    memoryCritical: stringField(config?.memoryCriticalPercent, initialCheckFields.memoryCritical),
    load: stringField(config?.loadWarning, initialCheckFields.load),
    loadCritical: stringField(config?.loadCritical, initialCheckFields.loadCritical),
    monitorLoad:
      config === undefined || config.loadWarning !== undefined || config.loadCritical !== undefined,
    swap: stringField(config?.swapWarningPercent, initialCheckFields.swap),
    swapCritical: stringField(config?.swapCriticalPercent, initialCheckFields.swapCritical),
    mount: stringField(config?.mount, initialCheckFields.mount),
    disk: stringField(config?.warningPercent, initialCheckFields.disk),
    diskCritical: stringField(config?.criticalPercent, initialCheckFields.diskCritical),
    containerNamePattern: stringField(config?.containerNamePattern, "*"),
    requireHealthy: config?.requireHealthy !== false,
    requireRunning: config?.requireRunning !== false,
    maximumRestarts: stringField(config?.maximumRestarts, initialCheckFields.maximumRestarts),
    containerCpu: stringField(config?.cpuWarningPercent, initialCheckFields.containerCpu),
    containerMemory: stringField(config?.memoryWarningPercent, initialCheckFields.containerMemory),
    databaseEngine:
      databaseEngine === "mysql" || databaseEngine === "redis" ? databaseEngine : "postgresql",
    databaseHost: stringField(target?.host, initialCheckFields.databaseHost),
    databasePort: stringField(target?.port, databasePort(databaseEngine)),
    databaseName: stringField(target?.database, ""),
    databaseUsername: stringField(target?.username, ""),
    databaseTls: target?.tls === true,
    connectionWarningPercent: stringField(
      config?.connectionWarningPercent,
      initialCheckFields.connectionWarningPercent
    ),
    replicationLagWarningSeconds: stringField(config?.replicationLagWarningSeconds, ""),
    slowQueryWarningCount: stringField(config?.slowQueryWarningCount, ""),
    databaseQuery: stringField(query?.statement, ""),
    databaseExpectedValue: jsonScalarField(query, "expectedValue"),
  };
}

export function buildCheckConfig(type: CheckType, fields: CheckFields): Record<string, unknown> {
  switch (type) {
    case "http":
      return {
        target: {
          url: fields.url,
          method: fields.method,
          ...(fields.requestHeaders.trim() ? { headers: parseHeaders(fields.requestHeaders) } : {}),
          ...(fields.secretHeaderName.trim()
            ? { secretHeaderName: fields.secretHeaderName.trim() }
            : {}),
          ...(fields.requestBody ? { body: fields.requestBody } : {}),
        },
        expectedStatuses: commaNumbers(fields.statuses),
        ...(fields.content ? { responseContains: fields.content } : {}),
        ...(fields.expectedHeaders.trim()
          ? { expectedHeaders: parseHeaders(fields.expectedHeaders) }
          : {}),
        ...(fields.jsonAssertions.conditions.length
          ? {
              jsonAssertions: buildAssertion(fields.jsonAssertions),
            }
          : {}),
        ...(fields.latencyWarningMs ? { latencyWarningMs: Number(fields.latencyWarningMs) } : {}),
        ...(fields.certificateWarningDays && fields.url.trim().toLowerCase().startsWith("https://")
          ? { certificateWarningDays: Number(fields.certificateWarningDays) }
          : {}),
        followRedirects: fields.followRedirects,
        validateTls: fields.validateTls,
      };
    case "tcp":
      return { target: { host: fields.host, port: Number(fields.port) } };
    case "dns":
      return {
        target: { hostname: fields.hostname },
        recordType: fields.recordType,
        ...(fields.expectedValue ? { expectedValue: fields.expectedValue } : {}),
      };
    case "icmp":
      return {
        target: { host: fields.icmpHost },
        packetCount: Number(fields.packetCount),
        minimumSuccessPercent: Number(fields.minimumSuccessPercent),
        ...(fields.latencyWarningMs ? { latencyWarningMs: Number(fields.latencyWarningMs) } : {}),
      };
    case "wan": {
      const targets = parseWanTargets(fields.wanTargets);
      return {
        targets,
        requiredSuccessfulTargets: Number(fields.requiredSuccessfulTargets),
        packetCount: Number(fields.packetCount),
        ...(fields.latencyWarningMs ? { latencyWarningMs: Number(fields.latencyWarningMs) } : {}),
      };
    }
    case "host":
      return {
        cpuWarningPercent: Number(fields.cpu),
        cpuCriticalPercent: Number(fields.cpuCritical),
        memoryWarningPercent: Number(fields.memory),
        memoryCriticalPercent: Number(fields.memoryCritical),
        ...(fields.monitorLoad
          ? { loadWarning: Number(fields.load), loadCritical: Number(fields.loadCritical) }
          : {}),
        swapWarningPercent: Number(fields.swap),
        swapCriticalPercent: Number(fields.swapCritical),
      };
    case "disk":
      return {
        mount: fields.mount,
        warningPercent: Number(fields.disk),
        criticalPercent: Number(fields.diskCritical),
      };
    case "docker":
      return {
        ...(fields.containerNamePattern && fields.containerNamePattern !== "*"
          ? { containerNamePattern: fields.containerNamePattern }
          : {}),
        requireHealthy: fields.requireHealthy,
        requireRunning: fields.requireRunning,
        maximumRestarts: Number(fields.maximumRestarts),
        cpuWarningPercent: Number(fields.containerCpu),
        memoryWarningPercent: Number(fields.containerMemory),
      };
    case "database":
      return {
        target: {
          engine: fields.databaseEngine,
          host: fields.databaseHost,
          port: Number(fields.databasePort),
          ...(fields.databaseName ? { database: fields.databaseName } : {}),
          ...(fields.databaseUsername ? { username: fields.databaseUsername } : {}),
          tls: fields.databaseTls,
        },
        connectionWarningPercent: Number(fields.connectionWarningPercent),
        ...(fields.replicationLagWarningSeconds
          ? { replicationLagWarningSeconds: Number(fields.replicationLagWarningSeconds) }
          : {}),
        ...(fields.slowQueryWarningCount
          ? { slowQueryWarningCount: Number(fields.slowQueryWarningCount) }
          : {}),
        ...(fields.databaseQuery
          ? {
              query: {
                statement: fields.databaseQuery,
                ...(fields.databaseExpectedValue
                  ? { expectedValue: parseJsonValue(fields.databaseExpectedValue) }
                  : {}),
              },
            }
          : {}),
      };
    default:
      throw new Error("Unsupported check type");
  }
}

function buildAssertion(field: JsonAssertionNodeField): HttpJsonAssertionNode {
  if (field.kind === "group") {
    return {
      kind: "group",
      operator: field.operator,
      conditions: field.conditions.map(buildAssertion),
    } satisfies HttpJsonAssertionGroup;
  }
  return {
    kind: "assertion",
    name: field.name,
    pointer: field.pointer,
    operator: field.operator,
    ...(field.operator === "exists" ? {} : { expectedValue: parseJsonValue(field.expectedValue) }),
  };
}

function assertionFields(group: Record<string, unknown> | undefined): JsonAssertionGroupField {
  return {
    kind: "group",
    id: "assertion-root",
    operator: group?.operator === "or" ? "or" : "and",
    conditions: assertionNodes(group?.conditions, "assertion-root"),
  };
}

function assertionNodes(value: unknown, parentId: string): JsonAssertionNodeField[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<JsonAssertionNodeField[]>((nodes, condition, index) => {
    if (!isRecord(condition)) return nodes;
    const id = `${parentId}-${index}`;
    if (condition.kind === "group") {
      nodes.push({
        kind: "group" as const,
        id,
        operator: condition.operator === "or" ? ("or" as const) : ("and" as const),
        conditions: assertionNodes(condition.conditions, id),
      });
      return nodes;
    }
    if (condition.kind !== "assertion") return nodes;
    const operator = assertionOperator(condition.operator);
    nodes.push({
      kind: "assertion" as const,
      id,
      name: stringField(condition.name, `Assertion ${index + 1}`),
      pointer: stringField(condition.pointer, ""),
      operator,
      expectedValue: operator === "exists" ? "" : jsonScalarField(condition, "expectedValue"),
    });
    return nodes;
  }, []);
}

function assertionOperator(value: unknown): HttpJsonAssertionOperator {
  return value === "notEquals" ||
    value === "contains" ||
    value === "exists" ||
    value === "greaterThan" ||
    value === "greaterThanOrEqual" ||
    value === "lessThan" ||
    value === "lessThanOrEqual"
    ? value
    : "equals";
}

function parseWanTargets(value: string): Array<{ name: string; host: string }> {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(":");
      if (separator < 1) throw new Error("WAN targets must use name: host");
      return { name: line.slice(0, separator).trim(), host: line.slice(separator + 1).trim() };
    });
}

function wanTargetsField(value: unknown): string {
  if (!Array.isArray(value)) return initialCheckFields.wanTargets;
  return value
    .flatMap((item) =>
      isRecord(item) && typeof item.name === "string" && typeof item.host === "string"
        ? [`${item.name}: ${item.host}`]
        : []
    )
    .join("\n");
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
  if (!isRecord(value)) return "";
  return Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([name, expected]) => `${name}: ${expected}`)
    .join("\n");
}

function jsonScalarField(config: Record<string, unknown> | undefined, key: string): string {
  if (!config || !Object.hasOwn(config, key)) return "";
  return JSON.stringify(config[key]) ?? "";
}

function parseHeaders(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(":");
        if (separator < 1) throw new Error("Headers must use name: value");
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      })
  );
}

function parseJsonValue(value: string): string | number | boolean | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("Expected value is invalid JSON");
  }
  if (
    parsed === null ||
    typeof parsed === "string" ||
    typeof parsed === "number" ||
    typeof parsed === "boolean"
  )
    return parsed;
  throw new Error("Expected value must be a JSON scalar");
}

function commaNumbers(value: string): number[] {
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter(Number.isFinite);
}

function databasePort(engine: string): string {
  return engine === "mysql" ? "3306" : engine === "redis" ? "6379" : "5432";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
