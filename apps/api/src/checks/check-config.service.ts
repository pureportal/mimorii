import { BadRequestException, Injectable } from "@nestjs/common";
import {
  databaseEngines,
  httpJsonAssertionOperators,
  httpMethods,
  type CheckConfig,
  type CheckType,
  type DatabaseCheckConfig,
  type DatabaseEngine,
  type DiskCheckConfig,
  type DnsCheckConfig,
  type DockerCheckConfig,
  type HostCheckConfig,
  type HttpCheckConfig,
  type HttpJsonAssertionNode,
  type HttpMethod,
  type IcmpCheckConfig,
  type TcpCheckConfig,
  type WanCheckConfig,
} from "@mimorii/contracts";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";

const dnsRecordTypes = new Set(["A", "AAAA", "CNAME", "MX", "NS", "SRV", "TXT"]);
const headerNamePattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

@Injectable()
export class CheckConfigService {
  validate(type: CheckType, value: Record<string, unknown>): CheckConfig {
    switch (type) {
      case "http":
        return this.http(value);
      case "tcp":
        return this.tcp(value);
      case "dns":
        return this.dns(value);
      case "icmp":
        return this.icmp(value);
      case "wan":
        return this.wan(value);
      case "host":
        return this.host(value);
      case "disk":
        return this.disk(value);
      case "docker":
        return this.docker(value);
      case "database":
        return this.database(value);
    }
  }

  private http(value: Record<string, unknown>): HttpCheckConfig {
    const target = this.object(value.target, "HTTP target");
    if (typeof target.url !== "string" || target.url.length > 2048)
      this.invalid("HTTP URL is invalid");
    let url: URL;
    try {
      url = new URL(target.url as string);
    } catch {
      throw new BadRequestException("HTTP URL is invalid");
    }
    if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) {
      this.invalid("HTTP URL must use HTTP or HTTPS without credentials");
    }
    this.hostName(url.hostname, "HTTP host");
    const method = target.method ?? "GET";
    if (!this.httpMethod(method)) this.invalid("HTTP method is invalid");
    const statuses = value.expectedStatuses ?? [200];
    if (
      !Array.isArray(statuses) ||
      statuses.length === 0 ||
      statuses.length > 20 ||
      statuses.some((status) => !Number.isInteger(status) || status < 100 || status > 599)
    ) {
      this.invalid("Expected status codes are invalid");
    }
    if (value.responseContains !== undefined) {
      if (typeof value.responseContains !== "string" || value.responseContains.length > 512) {
        this.invalid("Response content match is invalid");
      }
      if (method === "HEAD") this.invalid("Response content is not available for HEAD");
    }
    const expectedHeaders = this.headers(value.expectedHeaders);
    const requestHeaders = this.headers(target.headers);
    const secretHeaderName = target.secretHeaderName;
    if (
      secretHeaderName !== undefined &&
      (typeof secretHeaderName !== "string" ||
        !headerNamePattern.test(secretHeaderName) ||
        new Set(["host", "content-length", "connection"]).has(secretHeaderName.toLowerCase()) ||
        Object.hasOwn(requestHeaders ?? {}, secretHeaderName.toLowerCase()))
    ) {
      this.invalid("Secret header name is invalid");
    }
    const body = target.body;
    if (
      body !== undefined &&
      (typeof body !== "string" || body.length > 65_536 || method === "HEAD")
    ) {
      this.invalid("HTTP request body is invalid");
    }
    const jsonAssertions = value.jsonAssertions;
    if (jsonAssertions !== undefined && method === "HEAD") {
      this.invalid("JSON assertions are not available for HEAD");
    }
    const normalizedAssertions =
      jsonAssertions === undefined ? undefined : this.jsonAssertion(jsonAssertions, 0);
    if (normalizedAssertions !== undefined && normalizedAssertions.kind !== "group") {
      this.invalid("JSON assertion group is invalid");
    }
    const latencyWarningMs =
      value.latencyWarningMs === undefined
        ? undefined
        : this.number(value.latencyWarningMs, 1, 30_000, "Latency threshold");
    const certificateWarningDays =
      value.certificateWarningDays === undefined
        ? undefined
        : this.number(value.certificateWarningDays, 1, 365, "Certificate threshold");
    if (certificateWarningDays !== undefined && url.protocol !== "https:") {
      this.invalid("Certificate threshold requires HTTPS");
    }
    return {
      target: {
        url: url.toString(),
        method,
        ...(requestHeaders ? { headers: requestHeaders } : {}),
        ...(typeof secretHeaderName === "string"
          ? { secretHeaderName: secretHeaderName.toLowerCase() }
          : {}),
        ...(body === undefined ? {} : { body: body as string }),
      },
      expectedStatuses: [...new Set(statuses as number[])],
      ...(value.responseContains ? { responseContains: value.responseContains as string } : {}),
      ...(expectedHeaders ? { expectedHeaders } : {}),
      ...(normalizedAssertions ? { jsonAssertions: normalizedAssertions } : {}),
      ...(latencyWarningMs === undefined ? {} : { latencyWarningMs }),
      ...(certificateWarningDays === undefined ? {} : { certificateWarningDays }),
      followRedirects: value.followRedirects === true,
      validateTls: value.validateTls !== false,
    };
  }

  private tcp(value: Record<string, unknown>): TcpCheckConfig {
    const target = this.object(value.target, "TCP target");
    const host = this.hostName(target.host, "TCP host");
    if (
      !Number.isInteger(target.port) ||
      (target.port as number) < 1 ||
      (target.port as number) > 65_535
    ) {
      this.invalid("TCP port is invalid");
    }
    return {
      target: {
        host,
        port: target.port as number,
      },
    };
  }

  private dns(value: Record<string, unknown>): DnsCheckConfig {
    const target = this.object(value.target, "DNS target");
    const hostname = this.hostName(target.hostname, "DNS hostname", true);
    const recordType = value.recordType ?? "A";
    if (typeof recordType !== "string" || !dnsRecordTypes.has(recordType)) {
      this.invalid("DNS record type is invalid");
    }
    if (value.expectedValue !== undefined) {
      if (typeof value.expectedValue !== "string" || value.expectedValue.length > 512) {
        this.invalid("Expected DNS value is invalid");
      }
    }
    return {
      target: { hostname },
      recordType: recordType as DnsCheckConfig["recordType"],
      ...(value.expectedValue ? { expectedValue: value.expectedValue as string } : {}),
    };
  }

  private icmp(value: Record<string, unknown>): IcmpCheckConfig {
    const target = this.object(value.target, "ICMP target");
    const host = this.hostName(target.host, "ICMP host");
    return {
      target: { host },
      packetCount: this.integer(value.packetCount ?? 3, 1, 10, "Packet count"),
      minimumSuccessPercent: this.number(
        value.minimumSuccessPercent ?? 100,
        1,
        100,
        "Minimum success"
      ),
      ...(value.latencyWarningMs === undefined
        ? {}
        : {
            latencyWarningMs: this.number(value.latencyWarningMs, 1, 30_000, "Latency threshold"),
          }),
    };
  }

  private wan(value: Record<string, unknown>): WanCheckConfig {
    if (!Array.isArray(value.targets) || value.targets.length < 1 || value.targets.length > 12) {
      this.invalid("WAN targets are invalid");
    }
    const targets = value.targets.map((item) => {
      const target = this.object(item, "WAN target");
      if (typeof target.name !== "string" || !target.name.trim() || target.name.length > 80) {
        this.invalid("WAN target name is invalid");
      }
      return {
        name: target.name.trim(),
        host: this.hostName(target.host, "WAN target host"),
      };
    });
    if (new Set(targets.map((target) => target.name.toLowerCase())).size !== targets.length) {
      this.invalid("WAN target names must be unique");
    }
    return {
      targets,
      requiredSuccessfulTargets: this.integer(
        value.requiredSuccessfulTargets ?? targets.length,
        1,
        targets.length,
        "Required successful targets"
      ),
      packetCount: this.integer(value.packetCount ?? 2, 1, 10, "Packet count"),
      ...(value.latencyWarningMs === undefined
        ? {}
        : {
            latencyWarningMs: this.number(value.latencyWarningMs, 1, 30_000, "Latency threshold"),
          }),
    };
  }

  private host(value: Record<string, unknown>): HostCheckConfig {
    const cpuWarningPercent = this.percentage(value.cpuWarningPercent ?? 90, "CPU warning");
    const memoryWarningPercent = this.percentage(
      value.memoryWarningPercent ?? 90,
      "Memory warning"
    );
    if ((value.loadWarning === undefined) !== (value.loadCritical === undefined)) {
      this.invalid("Load warning and critical thresholds must be configured together");
    }
    const loadWarning =
      value.loadWarning === undefined
        ? undefined
        : this.number(value.loadWarning, 0.1, 10_000, "Load warning");
    const swapWarningPercent = this.percentage(value.swapWarningPercent ?? 90, "Swap warning");
    return {
      cpuWarningPercent,
      cpuCriticalPercent: this.criticalPercentage(
        value.cpuCriticalPercent ?? Math.max(98, cpuWarningPercent),
        cpuWarningPercent,
        "CPU critical"
      ),
      memoryWarningPercent,
      memoryCriticalPercent: this.criticalPercentage(
        value.memoryCriticalPercent ?? Math.max(98, memoryWarningPercent),
        memoryWarningPercent,
        "Memory critical"
      ),
      ...(loadWarning === undefined
        ? {}
        : {
            loadWarning,
            loadCritical: this.criticalNumber(
              value.loadCritical,
              loadWarning,
              10_000,
              "Load critical"
            ),
          }),
      swapWarningPercent,
      swapCriticalPercent: this.criticalPercentage(
        value.swapCriticalPercent ?? Math.max(98, swapWarningPercent),
        swapWarningPercent,
        "Swap critical"
      ),
    };
  }

  private disk(value: Record<string, unknown>): DiskCheckConfig {
    if (typeof value.mount !== "string" || !value.mount.trim() || value.mount.length > 260) {
      this.invalid("Disk mount is invalid");
    }
    const warningPercent = this.percentage(value.warningPercent ?? 85, "Disk warning");
    return {
      mount: value.mount.trim(),
      warningPercent,
      criticalPercent: this.criticalPercentage(
        value.criticalPercent ?? Math.max(95, warningPercent),
        warningPercent,
        "Disk critical"
      ),
    };
  }

  private docker(value: Record<string, unknown>): DockerCheckConfig {
    if (
      value.containerNamePattern !== undefined &&
      (typeof value.containerNamePattern !== "string" ||
        !value.containerNamePattern.trim() ||
        value.containerNamePattern.length > 120)
    ) {
      this.invalid("Container name pattern is invalid");
    }
    return {
      ...(value.containerNamePattern
        ? { containerNamePattern: (value.containerNamePattern as string).trim() }
        : {}),
      requireHealthy: value.requireHealthy !== false,
      requireRunning: value.requireRunning !== false,
      maximumRestarts: this.integer(value.maximumRestarts ?? 3, 0, 100_000, "Maximum restarts"),
      cpuWarningPercent: this.percentage(value.cpuWarningPercent ?? 90, "Container CPU warning"),
      memoryWarningPercent: this.percentage(
        value.memoryWarningPercent ?? 90,
        "Container memory warning"
      ),
    };
  }

  private database(value: Record<string, unknown>): DatabaseCheckConfig {
    const target = this.object(value.target, "Database target");
    const engine = target.engine;
    if (typeof engine !== "string" || !databaseEngines.some((candidate) => candidate === engine)) {
      this.invalid("Database engine is invalid");
    }
    const database = target.database;
    if (
      database !== undefined &&
      (typeof database !== "string" || !database.trim() || database.length > 128)
    ) {
      this.invalid("Database name is invalid");
    }
    const username = target.username;
    if (
      username !== undefined &&
      (typeof username !== "string" || !username.trim() || username.length > 128)
    ) {
      this.invalid("Database username is invalid");
    }
    if (engine !== "redis" && (!database || !username)) {
      this.invalid("Database and username are required");
    }
    if (
      engine === "redis" &&
      database !== undefined &&
      (!/^\d+$/.test(database) || Number(database) > 2_147_483_647)
    ) {
      this.invalid("Redis database must be a non-negative integer");
    }
    const query = value.query === undefined ? undefined : this.databaseQuery(value.query, engine);
    return {
      target: {
        engine: engine as DatabaseEngine,
        host: this.hostName(target.host, "Database host"),
        port: this.integer(
          target.port ?? (engine === "postgresql" ? 5432 : engine === "mysql" ? 3306 : 6379),
          1,
          65_535,
          "Database port"
        ),
        ...(database ? { database: database.trim() } : {}),
        ...(username ? { username: username.trim() } : {}),
        tls: target.tls === true,
      },
      connectionWarningPercent: this.percentage(
        value.connectionWarningPercent ?? 85,
        "Connection warning"
      ),
      ...(value.replicationLagWarningSeconds === undefined
        ? {}
        : {
            replicationLagWarningSeconds: this.number(
              value.replicationLagWarningSeconds,
              0,
              86_400,
              "Replication lag warning"
            ),
          }),
      ...(value.slowQueryWarningCount === undefined
        ? {}
        : {
            slowQueryWarningCount: this.integer(
              value.slowQueryWarningCount,
              0,
              1_000_000_000,
              "Slow query warning"
            ),
          }),
      ...(query ? { query } : {}),
    };
  }

  private databaseQuery(value: unknown, engine: string): DatabaseCheckConfig["query"] {
    if (engine === "redis") this.invalid("Custom queries are not available for Redis");
    const query = this.object(value, "Database query");
    if (
      typeof query.statement !== "string" ||
      !query.statement.trim() ||
      query.statement.length > 4_096 ||
      !/^(select|show)\b/i.test(query.statement.trim()) ||
      query.statement.trim().slice(0, -1).includes(";")
    ) {
      this.invalid("Database query must be one read-only statement");
    }
    const hasExpectedValue = Object.hasOwn(query, "expectedValue");
    if (hasExpectedValue) this.scalar(query.expectedValue, "Expected database value");
    return {
      statement: query.statement.trim().replace(/;\s*$/, ""),
      ...(hasExpectedValue
        ? { expectedValue: query.expectedValue as string | number | boolean | null }
        : {}),
    };
  }

  private jsonAssertion(value: unknown, depth: number): HttpJsonAssertionNode {
    if (depth > 4) this.invalid("JSON assertion nesting is too deep");
    const node = this.object(value, "JSON assertion");
    if (node.kind === "group") {
      if (
        (node.operator !== "and" && node.operator !== "or") ||
        !Array.isArray(node.conditions) ||
        node.conditions.length < 1 ||
        node.conditions.length > 20
      ) {
        this.invalid("JSON assertion group is invalid");
      }
      return {
        kind: "group",
        operator: node.operator,
        conditions: node.conditions.map((condition) => this.jsonAssertion(condition, depth + 1)),
      };
    }
    if (
      node.kind !== "assertion" ||
      typeof node.name !== "string" ||
      !node.name.trim() ||
      node.name.length > 80 ||
      typeof node.pointer !== "string" ||
      !node.pointer.startsWith("/") ||
      node.pointer.length > 512 ||
      typeof node.operator !== "string" ||
      !httpJsonAssertionOperators.some((operator) => operator === node.operator)
    ) {
      this.invalid("JSON assertion is invalid");
    }
    const requiresExpected = node.operator !== "exists";
    if (requiresExpected && !Object.hasOwn(node, "expectedValue")) {
      this.invalid("JSON assertion expected value is required");
    }
    if (Object.hasOwn(node, "expectedValue"))
      this.scalar(node.expectedValue, "Expected JSON value");
    return {
      kind: "assertion",
      name: node.name.trim(),
      pointer: node.pointer,
      operator: node.operator as Exclude<HttpJsonAssertionNode, { kind: "group" }>["operator"],
      ...(Object.hasOwn(node, "expectedValue")
        ? { expectedValue: node.expectedValue as string | number | boolean | null }
        : {}),
    };
  }

  private headers(value: unknown): Record<string, string> | undefined {
    if (value === undefined) return undefined;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      this.invalid("Expected headers are invalid");
    }
    const entries = Object.entries(value);
    if (entries.length === 0 || entries.length > 20) this.invalid("Expected headers are invalid");
    const headers: Record<string, string> = {};
    for (const [name, expected] of entries) {
      if (
        !headerNamePattern.test(name) ||
        name.toLowerCase() === "authorization" ||
        new Set(["host", "content-length", "connection"]).has(name.toLowerCase()) ||
        typeof expected !== "string" ||
        expected.length > 512 ||
        /[\r\n]/.test(expected)
      ) {
        this.invalid("Expected headers are invalid");
      }
      headers[name.toLowerCase()] = expected;
    }
    return headers;
  }

  private percentage(value: unknown, label: string): number {
    return this.number(value, 1, 100, label);
  }

  private integer(value: unknown, minimum: number, maximum: number, label: string): number {
    const result = this.number(value, minimum, maximum, label);
    if (!Number.isInteger(result)) this.invalid(`${label} is invalid`);
    return result;
  }

  private hostName(value: unknown, label: string, allowServiceLabels = false): string {
    if (typeof value !== "string") {
      this.invalid(`${label} is invalid`);
    }
    const unwrapped = value.trim().replace(/^\[|\]$/g, "");
    if (!unwrapped || unwrapped.length > 253) this.invalid(`${label} is invalid`);
    if (isIP(unwrapped)) return unwrapped.toLowerCase();

    const ascii = domainToASCII(unwrapped).toLowerCase().replace(/\.$/, "");
    const labelPattern = allowServiceLabels
      ? /^(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?|\*)$/
      : /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
    if (!ascii || ascii.length > 253 || ascii.split(".").some((part) => !labelPattern.test(part))) {
      this.invalid(`${label} is invalid`);
    }
    return ascii;
  }

  private object(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      this.invalid(`${label} is invalid`);
    }
    return value as Record<string, unknown>;
  }

  private scalar(value: unknown, label: string): void {
    if (
      (value !== null && !["string", "number", "boolean"].includes(typeof value)) ||
      (typeof value === "string" && value.length > 2_000) ||
      (typeof value === "number" && !Number.isFinite(value))
    ) {
      this.invalid(`${label} is invalid`);
    }
  }

  private httpMethod(value: unknown): value is HttpMethod {
    return typeof value === "string" && httpMethods.some((method) => method === value);
  }

  private criticalPercentage(value: unknown, warning: number, label: string): number {
    return this.criticalNumber(value, warning, 100, label);
  }

  private criticalNumber(value: unknown, warning: number, maximum: number, label: string): number {
    const critical = this.number(value, warning, maximum, label);
    if (critical < warning) this.invalid(`${label} must be at least the warning threshold`);
    return critical;
  }

  private number(value: unknown, minimum: number, maximum: number, label: string): number {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < minimum ||
      value > maximum
    ) {
      this.invalid(`${label} is invalid`);
    }
    return value as number;
  }

  private invalid(message: string): never {
    throw new BadRequestException(message);
  }
}
