import { Injectable } from "@nestjs/common";
import type { DnsCheckConfig, HttpCheckConfig, TcpCheckConfig } from "@mimorii/contracts";
import { Resolver } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { connect } from "node:net";
import { TLSSocket } from "node:tls";
import type { ExecutedCheckResult, RunnableCheck } from "./checks.types.js";
import { TargetSafetyService } from "../common/target-safety.service.js";

const MAX_HTTP_BODY_BYTES = 512 * 1024;

@Injectable()
export class CheckRunnerService {
  constructor(private readonly targets: TargetSafetyService) {}

  async run(check: RunnableCheck): Promise<ExecutedCheckResult> {
    const checkedAt = new Date().toISOString();
    try {
      switch (check.type) {
        case "http":
          return await this.http(check.config as HttpCheckConfig, check.timeoutMs, checkedAt);
        case "tcp":
          return await this.tcp(check.config as TcpCheckConfig, check.timeoutMs, checkedAt);
        case "dns":
          return await this.dns(check.config as DnsCheckConfig, check.timeoutMs, checkedAt);
        case "host":
        case "disk":
          return this.down("Check requires an agent", checkedAt);
      }
    } catch (error) {
      return this.down(this.safeError(error), checkedAt);
    }
  }

  private async http(
    config: HttpCheckConfig,
    timeoutMs: number,
    checkedAt: string,
    redirects = 0
  ): Promise<ExecutedCheckResult> {
    const url = this.targets.validateHttpUrl(config.url);
    const addresses = await this.targets.resolvePublicHost(url.hostname);
    const started = performance.now();
    const response = await this.requestHttp(url, addresses[0]!, config, timeoutMs);
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
      return this.http({ ...config, url: nextUrl.toString() }, timeoutMs, checkedAt, redirects + 1);
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
    if (config.jsonPointer) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(response.body) as unknown;
      } catch {
        return this.down("Response is not valid JSON", checkedAt, latencyMs, response.statusCode, {
          responseBytes: response.bytes,
          ...response.metrics,
        });
      }
      const assertion = this.jsonPointer(parsed, config.jsonPointer);
      if (!assertion.found) {
        return this.down(
          "Expected JSON value was not found",
          checkedAt,
          latencyMs,
          response.statusCode,
          { responseBytes: response.bytes, ...response.metrics }
        );
      }
      if (
        Object.hasOwn(config, "expectedJsonValue") &&
        assertion.value !== config.expectedJsonValue
      ) {
        return this.down("JSON value did not match", checkedAt, latencyMs, response.statusCode, {
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
          method: config.method,
          headers: {
            host: url.host,
            accept: "*/*",
            "user-agent": "Mimorii/0.1 uptime-check",
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
      request.end();
    });
  }

  private async tcp(
    config: TcpCheckConfig,
    timeoutMs: number,
    checkedAt: string
  ): Promise<ExecutedCheckResult> {
    const addresses = await this.targets.resolvePublicHost(config.host);
    const started = performance.now();
    await new Promise<void>((resolve, reject) => {
      const socket = connect({ host: addresses[0]!, port: config.port });
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
      metrics: { port: config.port },
      checkedAt,
    };
  }

  private async dns(
    config: DnsCheckConfig,
    timeoutMs: number,
    checkedAt: string
  ): Promise<ExecutedCheckResult> {
    this.targets.normalizeHost(config.hostname);
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

  private async resolveRecords(resolver: Resolver, config: DnsCheckConfig): Promise<string[]> {
    switch (config.recordType) {
      case "A":
        return resolver.resolve4(config.hostname);
      case "AAAA":
        return resolver.resolve6(config.hostname);
      case "CNAME":
        return resolver.resolveCname(config.hostname);
      case "MX":
        return (await resolver.resolveMx(config.hostname)).map(
          (record) => `${record.priority} ${record.exchange}`
        );
      case "NS":
        return resolver.resolveNs(config.hostname);
      case "SRV":
        return (await resolver.resolveSrv(config.hostname)).map(
          (record) => `${record.priority} ${record.weight} ${record.port} ${record.name}`
        );
      case "TXT":
        return (await resolver.resolveTxt(config.hostname)).map((record) => record.join(""));
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
    if (error instanceof Error && "code" in error) {
      const code = String((error as Error & { code?: string }).code ?? "");
      if (code === "ENOTFOUND" || code === "ENODATA") return "Target could not be resolved";
      if (code === "ECONNREFUSED") return "Connection was refused";
      if (code.startsWith("CERT_") || code.includes("TLS")) return "TLS validation failed";
    }
    return "Connection failed";
  }
}
