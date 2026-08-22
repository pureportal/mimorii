import { BadRequestException, Injectable } from "@nestjs/common";
import {
  httpMethods,
  type CheckConfig,
  type CheckType,
  type DiskCheckConfig,
  type DnsCheckConfig,
  type HostCheckConfig,
  type HttpCheckConfig,
  type HttpMethod,
  type TcpCheckConfig,
} from "@mimorii/contracts";

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
      case "host":
        return this.host(value);
      case "disk":
        return this.disk(value);
    }
  }

  private http(value: Record<string, unknown>): HttpCheckConfig {
    if (typeof value.url !== "string" || value.url.length > 2048)
      this.invalid("HTTP URL is invalid");
    let url: URL;
    try {
      url = new URL(value.url as string);
    } catch {
      throw new BadRequestException("HTTP URL is invalid");
    }
    if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) {
      this.invalid("HTTP URL must use HTTP or HTTPS without credentials");
    }
    const method = value.method ?? "GET";
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
    const jsonPointer = value.jsonPointer;
    if (jsonPointer !== undefined) {
      if (
        typeof jsonPointer !== "string" ||
        !jsonPointer.startsWith("/") ||
        jsonPointer.length > 512
      ) {
        this.invalid("JSON pointer is invalid");
      }
      if (method === "HEAD") this.invalid("JSON assertions are not available for HEAD");
    }
    const hasExpectedJsonValue = Object.hasOwn(value, "expectedJsonValue");
    if (hasExpectedJsonValue) {
      const expected = value.expectedJsonValue;
      if (
        !jsonPointer ||
        (expected !== null && !["string", "number", "boolean"].includes(typeof expected)) ||
        (typeof expected === "string" && expected.length > 2_000) ||
        (typeof expected === "number" && !Number.isFinite(expected))
      ) {
        this.invalid("Expected JSON value is invalid");
      }
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
      url: url.toString(),
      method,
      expectedStatuses: [...new Set(statuses as number[])],
      ...(value.responseContains ? { responseContains: value.responseContains as string } : {}),
      ...(expectedHeaders ? { expectedHeaders } : {}),
      ...(jsonPointer ? { jsonPointer } : {}),
      ...(hasExpectedJsonValue
        ? { expectedJsonValue: value.expectedJsonValue as string | number | boolean | null }
        : {}),
      ...(latencyWarningMs === undefined ? {} : { latencyWarningMs }),
      ...(certificateWarningDays === undefined ? {} : { certificateWarningDays }),
      followRedirects: value.followRedirects === true,
      validateTls: value.validateTls !== false,
    };
  }

  private tcp(value: Record<string, unknown>): TcpCheckConfig {
    if (typeof value.host !== "string" || !value.host.trim() || value.host.length > 253) {
      this.invalid("TCP host is invalid");
    }
    if (
      !Number.isInteger(value.port) ||
      (value.port as number) < 1 ||
      (value.port as number) > 65_535
    ) {
      this.invalid("TCP port is invalid");
    }
    return { host: (value.host as string).trim().toLowerCase(), port: value.port as number };
  }

  private dns(value: Record<string, unknown>): DnsCheckConfig {
    if (
      typeof value.hostname !== "string" ||
      !value.hostname.trim() ||
      value.hostname.length > 253
    ) {
      this.invalid("DNS hostname is invalid");
    }
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
      hostname: (value.hostname as string).trim().toLowerCase(),
      recordType: recordType as DnsCheckConfig["recordType"],
      ...(value.expectedValue ? { expectedValue: value.expectedValue as string } : {}),
    };
  }

  private host(value: Record<string, unknown>): HostCheckConfig {
    const cpuWarningPercent = this.percentage(value.cpuWarningPercent ?? 90, "CPU warning");
    const memoryWarningPercent = this.percentage(
      value.memoryWarningPercent ?? 90,
      "Memory warning"
    );
    const loadWarning = this.number(value.loadWarning ?? 4, 0.1, 10_000, "Load warning");
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
      loadWarning,
      loadCritical: this.criticalNumber(
        value.loadCritical ?? Math.max(8, loadWarning),
        loadWarning,
        10_000,
        "Load critical"
      ),
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
      mount: (value.mount as string).trim(),
      warningPercent,
      criticalPercent: this.criticalPercentage(
        value.criticalPercent ?? Math.max(95, warningPercent),
        warningPercent,
        "Disk critical"
      ),
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
