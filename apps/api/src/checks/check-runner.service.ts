import { Injectable } from "@nestjs/common";
import type {
  DatabaseCheckConfig,
  DnsCheckConfig,
  HttpCheckConfig,
  HttpJsonAssertionNode,
  IcmpCheckConfig,
  TcpCheckConfig,
  WanCheckConfig,
} from "@mimorii/contracts";
import { Resolver } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { connect } from "node:net";
import { TLSSocket } from "node:tls";
import type { ExecutedCheckResult, RunnableCheck } from "./checks.types.js";
import { TargetSafetyService } from "../common/target-safety.service.js";
import { DatabaseCheckService } from "./database-check.service.js";
import { IcmpService, type IcmpProbeResult } from "./icmp.service.js";

const MAX_HTTP_BODY_BYTES = 512 * 1024;

@Injectable()
export class CheckRunnerService {
  constructor(
    private readonly targets: TargetSafetyService,
    private readonly icmpChecks: IcmpService,
    private readonly databaseChecks: DatabaseCheckService
  ) {}

  async run(check: RunnableCheck): Promise<ExecutedCheckResult> {
    const checkedAt = new Date().toISOString();
    try {
      switch (check.type) {
        case "http":
          return await this.http(
            check.config as HttpCheckConfig,
            check.secret,
            check.timeoutMs,
            checkedAt
          );
        case "tcp":
          return await this.tcp(check.config as TcpCheckConfig, check.timeoutMs, checkedAt);
        case "dns":
          return await this.dns(check.config as DnsCheckConfig, check.timeoutMs, checkedAt);
        case "icmp":
          return await this.icmp(check.config as IcmpCheckConfig, check.timeoutMs, checkedAt);
        case "wan":
          return await this.wan(check.config as WanCheckConfig, check.timeoutMs, checkedAt);
        case "database":
          return await this.database(
            check.config as DatabaseCheckConfig,
            check.secret,
            check.timeoutMs,
            checkedAt
          );
        case "host":
        case "docker":
          return this.down("Check requires an agent", checkedAt);
      }
    } catch (error) {
      return this.down(this.safeError(error), checkedAt);
    }
  }

  private async http(
    config: HttpCheckConfig,
    secret: string | null,
    timeoutMs: number,
    checkedAt: string,
    redirects = 0
  ): Promise<ExecutedCheckResult> {
    const url = this.targets.validateHttpUrl(config.target.url);
    const addresses = await this.targets.resolvePublicHost(url.hostname);
    const started = performance.now();
    const response = await this.requestHttp(url, addresses[0]!, config, secret, timeoutMs);
    const latencyMs = Math.round((performance.now() - started) * 10) / 10;

    if (
      config.followRedirects &&
      response.statusCode >= 300 &&
      response.statusCode < 400 &&
      response.location
    ) {
      if (redirects >= 3)
        return this.down("Too many redirects", checkedAt, latencyMs, response.statusCode);
      const nextUrl = new URL(response.location, url);
      const redirectedSecret = nextUrl.origin === url.origin ? secret : null;
      return this.http(
        { ...config, target: { ...config.target, url: nextUrl.toString() } },
        redirectedSecret,
        timeoutMs,
        checkedAt,
        redirects + 1
      );
    }

    if (!config.expectedStatuses.includes(response.statusCode)) {
      return this.down("Unexpected HTTP status", checkedAt, latencyMs, response.statusCode, {
        responseBytes: response.bytes,
        ...response.metrics,
      });
    }
    if (config.responseContains && !response.body.includes(config.responseContains)) {
      return this.down(
        "Expected response content was not found",
        checkedAt,
        latencyMs,
        response.statusCode,
        {
          responseBytes: response.bytes,
          ...response.metrics,
        }
      );
    }
    for (const [name, expected] of Object.entries(config.expectedHeaders ?? {})) {
      if (!response.headers[name]?.includes(expected)) {
        return this.down(
          `Expected response header ${name} was not found`,
          checkedAt,
          latencyMs,
          response.statusCode,
          { responseBytes: response.bytes, ...response.metrics }
        );
      }
    }
    if (config.jsonAssertions) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(response.body) as unknown;
      } catch {
        return this.down("Response is not valid JSON", checkedAt, latencyMs, response.statusCode, {
          responseBytes: response.bytes,
          ...response.metrics,
        });
      }
      const assertion = this.evaluateJsonAssertions(parsed, config.jsonAssertions);
      Object.assign(response.metrics, assertion.metrics);
      if (!assertion.matches) {
        return this.down(assertion.message, checkedAt, latencyMs, response.statusCode, {
          responseBytes: response.bytes,
          ...response.metrics,
        });
      }
    }
    const certificateDaysRemaining = response.metrics.certificateDaysRemaining;
    if (
      config.certificateWarningDays !== undefined &&
      typeof certificateDaysRemaining === "number" &&
      certificateDaysRemaining <= 0
    ) {
      return this.down("TLS certificate has expired", checkedAt, latencyMs, response.statusCode, {
        responseBytes: response.bytes,
        ...response.metrics,
      });
    }
    const certificateWarning =
      config.certificateWarningDays !== undefined &&
      typeof certificateDaysRemaining === "number" &&
      certificateDaysRemaining <= config.certificateWarningDays;
    const latencyWarning = latencyMs >= (config.latencyWarningMs ?? Math.round(timeoutMs * 0.75));
    const message = certificateWarning
      ? "TLS certificate is nearing expiration"
      : latencyWarning
        ? "Response latency exceeded the warning threshold"
        : null;
    return {
      status: certificateWarning || latencyWarning ? "degraded" : "up",
      latencyMs,
      statusCode: response.statusCode,
      message,
      metrics: { responseBytes: response.bytes, ...response.metrics },
      checkedAt,
    };
  }

  private requestHttp(
    url: URL,
    address: string,
    config: HttpCheckConfig,
    secret: string | null,
    timeoutMs: number
  ): Promise<{
    statusCode: number;
    location?: string;
    body: string;
    bytes: number;
    headers: Record<string, string>;
    metrics: Record<string, number | string | boolean | null>;
  }> {
    return new Promise((resolve, reject) => {
      const requester = url.protocol === "https:" ? httpsRequest : httpRequest;
      const request = requester(
        {
          hostname: address,
          port: url.port || (url.protocol === "https:" ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: config.target.method,
          headers: {
            host: url.host,
            accept: "*/*",
            "user-agent": "Mimorii/0.1 uptime-check",
            ...config.target.headers,
            ...(config.target.secretHeaderName && secret
              ? { [config.target.secretHeaderName]: secret }
              : {}),
          },
          ...(url.protocol === "https:"
            ? { servername: url.hostname, rejectUnauthorized: config.validateTls }
            : {}),
        },
        (response) => {
          const chunks: Buffer[] = [];
          let bytes = 0;
          let collectedBytes = 0;
          response.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            const remaining = MAX_HTTP_BODY_BYTES - collectedBytes;
            if (remaining > 0) {
              const collected = chunk.subarray(0, remaining);
              chunks.push(collected);
              collectedBytes += collected.length;
            }
          });
          response.on("end", () => {
            const metrics: Record<string, number | string | boolean | null> = {};
            const headers = Object.fromEntries(
              Object.entries(response.headers).flatMap(([name, value]) => {
                if (value === undefined) return [];
                return [[name.toLowerCase(), Array.isArray(value) ? value.join(", ") : value]];
              })
            );
            if (typeof response.headers.server === "string")
              metrics.server = response.headers.server;
            if (typeof response.headers["x-powered-by"] === "string") {
              metrics.poweredBy = response.headers["x-powered-by"];
            }
            if (typeof response.headers["content-type"] === "string") {
              metrics.contentType = response.headers["content-type"];
            }
            if (response.socket instanceof TLSSocket) {
              metrics.tlsProtocol = response.socket.getProtocol();
              metrics.tlsCipher = response.socket.getCipher()?.name ?? null;
              const certificate = response.socket.getPeerCertificate();
              if (certificate.valid_to) {
                const expiresAt = new Date(certificate.valid_to);
                metrics.certificateExpiresAt = expiresAt.toISOString();
                metrics.certificateDaysRemaining = Math.floor(
                  (expiresAt.getTime() - Date.now()) / 86_400_000
                );
              }
              const issuer = certificate.issuer?.O ?? certificate.issuer?.CN ?? null;
              metrics.certificateIssuer = Array.isArray(issuer) ? issuer.join(", ") : issuer;
            }
            resolve({
              statusCode: response.statusCode ?? 0,
              ...(response.headers.location ? { location: response.headers.location } : {}),
              body: Buffer.concat(chunks).toString("utf8"),
              bytes,
              headers,
              metrics,
            });
          });
          response.on("error", reject);
        }
      );
      request.setTimeout(timeoutMs, () => request.destroy(new Error("timeout")));
      request.on("error", reject);
      request.end(config.target.body);
    });
  }

  private async tcp(
    config: TcpCheckConfig,
    timeoutMs: number,
    checkedAt: string
  ): Promise<ExecutedCheckResult> {
    const addresses = await this.targets.resolvePublicHost(config.target.host);
    const started = performance.now();
    await new Promise<void>((resolve, reject) => {
      const socket = connect({ host: addresses[0]!, port: config.target.port });
      socket.setTimeout(timeoutMs);
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("timeout", () => socket.destroy(new Error("timeout")));
      socket.once("error", reject);
    });
    const latencyMs = Math.round((performance.now() - started) * 10) / 10;
    return {
      status: latencyMs >= timeoutMs * 0.75 ? "degraded" : "up",
      latencyMs,
      statusCode: null,
      message: latencyMs >= timeoutMs * 0.75 ? "Connection is near the timeout" : null,
      metrics: { port: config.target.port },
      checkedAt,
    };
  }

  private async dns(
    config: DnsCheckConfig,
    timeoutMs: number,
    checkedAt: string
  ): Promise<ExecutedCheckResult> {
    this.targets.normalizeHost(config.target.hostname);
    const resolver = new Resolver({ timeout: timeoutMs, tries: 1 });
    const started = performance.now();
    const records = await this.resolveRecords(resolver, config);
    const latencyMs = Math.round((performance.now() - started) * 10) / 10;
    if (config.expectedValue && !records.some((record) => record.includes(config.expectedValue!))) {
      return this.down("Expected DNS value was not found", checkedAt, latencyMs, null, {
        recordCount: records.length,
      });
    }
    return {
      status: "up",
      latencyMs,
      statusCode: null,
      message: null,
      metrics: { recordCount: records.length },
      checkedAt,
    };
  }

  private async icmp(
    config: IcmpCheckConfig,
    timeoutMs: number,
    checkedAt: string
  ): Promise<ExecutedCheckResult> {
    const addresses = await this.targets.resolvePublicHost(config.target.host);
    const probe = await this.icmpChecks.probe(addresses[0]!, config.packetCount, timeoutMs);
    return this.icmpResult(probe, config.minimumSuccessPercent, config.latencyWarningMs, checkedAt);
  }

  private async wan(
    config: WanCheckConfig,
    timeoutMs: number,
    checkedAt: string
  ): Promise<ExecutedCheckResult> {
    const probes = await Promise.all(
      config.targets.map(async (target) => {
        const addresses = await this.targets.resolvePublicHost(target.host);
        const probe = await this.icmpChecks.probe(addresses[0]!, config.packetCount, timeoutMs);
        return { target, probe };
      })
    );
    const successful = probes.filter(({ probe }) => probe.received > 0).length;
    const latencies = probes.flatMap(({ probe }) =>
      probe.averageLatencyMs === null ? [] : [probe.averageLatencyMs]
    );
    const averageLatencyMs = latencies.length
      ? Math.round((latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length) * 10) /
        10
      : null;
    const metrics: Record<string, number | string | boolean | null> = {
      targetCount: probes.length,
      reachableTargets: successful,
      averageLatencyMs,
    };
    for (const { target, probe } of probes) {
      const key = target.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ".")
        .replace(/^\.|\.$/g, "");
      metrics[`target.${key}.reachable`] = probe.received > 0;
      metrics[`target.${key}.latencyMs`] = probe.averageLatencyMs;
      metrics[`target.${key}.lossPercent`] = probe.lossPercent;
    }
    if (successful < config.requiredSuccessfulTargets) {
      return this.down(
        "WAN availability requirement was not met",
        checkedAt,
        averageLatencyMs,
        null,
        metrics
      );
    }
    const latencyWarning =
      config.latencyWarningMs !== undefined &&
      averageLatencyMs !== null &&
      averageLatencyMs >= config.latencyWarningMs;
    const partial = successful < probes.length;
    return {
      status: latencyWarning || partial ? "degraded" : "up",
      latencyMs: averageLatencyMs,
      statusCode: null,
      message: partial
        ? "Some WAN targets are unreachable"
        : latencyWarning
          ? "WAN latency exceeded the warning threshold"
          : null,
      metrics,
      checkedAt,
    };
  }

  private async database(
    config: DatabaseCheckConfig,
    secret: string | null,
    timeoutMs: number,
    checkedAt: string
  ): Promise<ExecutedCheckResult> {
    const addresses = await this.targets.resolvePublicHost(config.target.host);
    const result = await this.databaseChecks.probe(config, secret, addresses[0]!, timeoutMs);
    return {
      status: result.degraded ? "degraded" : "up",
      latencyMs: result.latencyMs,
      statusCode: null,
      message: result.message,
      metrics: result.metrics,
      checkedAt,
    };
  }

  private icmpResult(
    probe: IcmpProbeResult,
    minimumSuccessPercent: number,
    latencyWarningMs: number | undefined,
    checkedAt: string
  ): ExecutedCheckResult {
    const successPercent = probe.sent ? (probe.received / probe.sent) * 100 : 0;
    const metrics = {
      packetsSent: probe.sent,
      packetsReceived: probe.received,
      packetLossPercent: probe.lossPercent,
      minimumLatencyMs: probe.minimumLatencyMs,
      maximumLatencyMs: probe.maximumLatencyMs,
    };
    if (successPercent < minimumSuccessPercent) {
      return this.down(
        "ICMP response requirement was not met",
        checkedAt,
        probe.averageLatencyMs,
        null,
        metrics
      );
    }
    const degraded =
      latencyWarningMs !== undefined &&
      probe.averageLatencyMs !== null &&
      probe.averageLatencyMs >= latencyWarningMs;
    return {
      status: degraded ? "degraded" : "up",
      latencyMs: probe.averageLatencyMs,
      statusCode: null,
      message: degraded ? "ICMP latency exceeded the warning threshold" : null,
      metrics,
      checkedAt,
    };
  }

  private async resolveRecords(resolver: Resolver, config: DnsCheckConfig): Promise<string[]> {
    switch (config.recordType) {
      case "A":
        return resolver.resolve4(config.target.hostname);
      case "AAAA":
        return resolver.resolve6(config.target.hostname);
      case "CNAME":
        return resolver.resolveCname(config.target.hostname);
      case "MX":
        return (await resolver.resolveMx(config.target.hostname)).map(
          (record) => `${record.priority} ${record.exchange}`
        );
      case "NS":
        return resolver.resolveNs(config.target.hostname);
      case "SRV":
        return (await resolver.resolveSrv(config.target.hostname)).map(
          (record) => `${record.priority} ${record.weight} ${record.port} ${record.name}`
        );
      case "TXT":
        return (await resolver.resolveTxt(config.target.hostname)).map((record) => record.join(""));
    }
  }

  private jsonPointer(root: unknown, pointer: string): { found: boolean; value?: unknown } {
    let current = root;
    for (const rawSegment of pointer.slice(1).split("/")) {
      const segment = rawSegment.replaceAll("~1", "/").replaceAll("~0", "~");
      if (Array.isArray(current)) {
        if (!/^\d+$/.test(segment)) return { found: false };
        const index = Number(segment);
        if (index >= current.length) return { found: false };
        current = current[index];
        continue;
      }
      if (!current || typeof current !== "object" || !Object.hasOwn(current, segment)) {
        return { found: false };
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return { found: true, value: current };
  }

  private evaluateJsonAssertions(
    root: unknown,
    node: HttpJsonAssertionNode
  ): {
    matches: boolean;
    message: string;
    metrics: Record<string, boolean>;
  } {
    if (node.kind === "group") {
      const results = node.conditions.map((condition) =>
        this.evaluateJsonAssertions(root, condition)
      );
      const matches =
        node.operator === "and"
          ? results.every((result) => result.matches)
          : results.some((result) => result.matches);
      return {
        matches,
        message: matches
          ? ""
          : results
              .filter((result) => !result.matches)
              .map((result) => result.message)
              .join("; ") || "JSON assertion group did not match",
        metrics: Object.assign({}, ...results.map((result) => result.metrics)),
      };
    }
    const actual = this.jsonPointer(root, node.pointer);
    const matches = this.jsonComparison(
      actual.found,
      actual.value,
      node.operator,
      node.expectedValue
    );
    const key = node.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.|\.$/g, "");
    return {
      matches,
      message: `${node.name} did not match`,
      metrics: { [`assertion.${key}.matched`]: matches },
    };
  }

  private jsonComparison(
    found: boolean,
    actual: unknown,
    operator: Exclude<HttpJsonAssertionNode, { kind: "group" }>["operator"],
    expected: unknown
  ): boolean {
    if (operator === "exists") return found;
    if (!found) return false;
    switch (operator) {
      case "equals":
        return actual === expected;
      case "notEquals":
        return actual !== expected;
      case "contains":
        return typeof actual === "string"
          ? actual.includes(String(expected))
          : Array.isArray(actual)
            ? actual.some((value) => value === expected)
            : false;
      case "greaterThan":
        return typeof actual === "number" && typeof expected === "number" && actual > expected;
      case "greaterThanOrEqual":
        return typeof actual === "number" && typeof expected === "number" && actual >= expected;
      case "lessThan":
        return typeof actual === "number" && typeof expected === "number" && actual < expected;
      case "lessThanOrEqual":
        return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    }
  }

  private down(
    message: string,
    checkedAt: string,
    latencyMs: number | null = null,
    statusCode: number | null = null,
    metrics: Record<string, number | string | boolean | null> = {}
  ): ExecutedCheckResult {
    return { status: "down", latencyMs, statusCode, message, metrics, checkedAt };
  }

  private safeError(error: unknown): string {
    if (error instanceof Error && error.message === "timeout") return "Check timed out";
    if (
      error instanceof Error &&
      new Set([
        "ICMP executor is unavailable",
        "Database query value did not match",
        "Database statistics are unavailable",
      ]).has(error.message)
    ) {
      return error.message;
    }
    if (error instanceof Error && "code" in error) {
      const code = String((error as Error & { code?: string }).code ?? "");
      if (code === "ENOTFOUND" || code === "ENODATA") return "Target could not be resolved";
      if (code === "ECONNREFUSED") return "Connection was refused";
      if (code.startsWith("CERT_") || code.includes("TLS")) return "TLS validation failed";
    }
    return "Connection failed";
  }
}
