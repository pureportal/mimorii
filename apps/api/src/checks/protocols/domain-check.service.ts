import { Injectable } from "@nestjs/common";
import type { DomainCheckConfig } from "@mimorii/contracts";
import {
  pinnedRequest,
  RequestTimeoutError,
  ResponseTooLargeError,
} from "../../common/pinned-request.js";
import { TargetSafetyService } from "../../common/target-safety.service.js";
import { CheckFailure, failedOutcome, type CheckOutcome } from "../check-outcome.js";

export interface DomainRegistration {
  expiresAt: Date | null;
  registrar: string | null;
  pendingDeletion: boolean;
}

interface RegistryResponse {
  status: number;
  body: unknown;
}

const bootstrapUrl = "https://data.iana.org/rdap/dns.json";
const bootstrapLifetimeMs = 86_400_000;
const maximumResponseBytes = 1024 * 1024;
const maximumRedirects = 3;
const deletionStatuses = new Set(["pending delete", "redemption period"]);

@Injectable()
export class DomainCheckService {
  private registries: { loadedAt: number; servers: Promise<Map<string, string>> } | null = null;

  constructor(private readonly targets: TargetSafetyService) {}

  async run(config: DomainCheckConfig, timeoutMs: number): Promise<CheckOutcome> {
    const domain = config.target.domain;
    const suffix = domain.slice(domain.lastIndexOf(".") + 1);
    const server = (await this.registryServers(timeoutMs)).get(suffix);
    if (!server) return failedOutcome(`Registration data isn't published for .${suffix} domains`);
    const response = await this.request(new URL(`domain/${domain}`, server), timeoutMs);
    if (response.status === 404) {
      return failedOutcome("Domain registration was not found", null, {}, 404);
    }
    if (response.status !== 200) {
      return failedOutcome("Registry lookup failed", null, {}, response.status);
    }
    const registration = domainRegistration(response.body);
    const remainingMs = registration.expiresAt
      ? registration.expiresAt.getTime() - Date.now()
      : null;
    const metrics = {
      registrar: registration.registrar,
      domainExpiresAt: registration.expiresAt?.toISOString() ?? null,
      domainDaysRemaining: remainingMs === null ? null : Math.floor(remainingMs / 86_400_000),
    };
    if (registration.pendingDeletion) {
      return failedOutcome("Domain is pending deletion", null, metrics);
    }
    if (remainingMs === null) {
      return {
        status: "degraded",
        latencyMs: null,
        statusCode: null,
        message: "Registry doesn't publish an expiration date",
        metrics,
      };
    }
    if (remainingMs <= 0) return failedOutcome("Domain registration has expired", null, metrics);
    const expiring = metrics.domainDaysRemaining! <= config.expiryWarningDays;
    return {
      status: expiring ? "degraded" : "up",
      latencyMs: null,
      statusCode: null,
      message: expiring ? "Domain registration is nearing expiration" : null,
      metrics,
    };
  }

  private registryServers(timeoutMs: number): Promise<Map<string, string>> {
    if (this.registries && Date.now() - this.registries.loadedAt < bootstrapLifetimeMs) {
      return this.registries.servers;
    }
    const servers = this.request(new URL(bootstrapUrl), timeoutMs).then((response) => {
      if (response.status !== 200) throw new CheckFailure("Registry directory is unavailable");
      return registryServers(response.body);
    });
    this.registries = { loadedAt: Date.now(), servers };
    servers.catch(() => {
      if (this.registries?.servers === servers) this.registries = null;
    });
    return servers;
  }

  private async request(url: URL, timeoutMs: number): Promise<RegistryResponse> {
    const deadline = Date.now() + timeoutMs;
    let current = url;
    try {
      for (let redirects = 0; ; redirects += 1) {
        if (current.protocol !== "https:") throw new CheckFailure("Registry lookup failed");
        const [resolved] = await this.targets.resolveStrictPublicHost(current.hostname);
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) throw new RequestTimeoutError();
        const response = await pinnedRequest(current, resolved!.address, {
          method: "GET",
          headers: {
            accept: "application/rdap+json, application/json",
            "accept-encoding": "identity",
            "user-agent": "Mimorii domain-check",
          },
          timeoutMs: remainingMs,
          maximumBytes: maximumResponseBytes,
        });
        const location = response.headers.location;
        if (response.status >= 300 && response.status < 400 && location) {
          if (redirects >= maximumRedirects) throw new CheckFailure("Registry lookup failed");
          current = new URL(location, current);
          continue;
        }
        if (response.status !== 200) return { status: response.status, body: null };
        return { status: 200, body: JSON.parse(response.body.toString("utf8")) as unknown };
      }
    } catch (error) {
      if (error instanceof RequestTimeoutError) throw new Error("timeout", { cause: error });
      if (error instanceof SyntaxError || error instanceof ResponseTooLargeError) {
        throw new CheckFailure("Registry lookup failed", { cause: error });
      }
      throw error;
    }
  }
}

export function registryServers(document: unknown): Map<string, string> {
  const servers = new Map<string, string>();
  const services = isRecord(document) && Array.isArray(document.services) ? document.services : [];
  for (const service of services) {
    if (!Array.isArray(service) || !Array.isArray(service[0]) || !Array.isArray(service[1])) {
      continue;
    }
    const url = (service[1] as unknown[]).find(
      (candidate): candidate is string =>
        typeof candidate === "string" && candidate.startsWith("https://")
    );
    if (!url) continue;
    for (const suffix of service[0] as unknown[]) {
      if (typeof suffix === "string") {
        servers.set(suffix.toLowerCase(), url.endsWith("/") ? url : `${url}/`);
      }
    }
  }
  if (servers.size === 0) throw new CheckFailure("Registry directory is unavailable");
  return servers;
}

export function domainRegistration(record: unknown): DomainRegistration {
  if (!isRecord(record)) throw new CheckFailure("Registry lookup failed");
  const events = Array.isArray(record.events) ? record.events : [];
  const expiration = events.find(
    (event): event is { eventDate: string } =>
      isRecord(event) && event.eventAction === "expiration" && typeof event.eventDate === "string"
  );
  const expiresAt = expiration ? new Date(expiration.eventDate) : null;
  const statuses = Array.isArray(record.status)
    ? record.status.filter((status): status is string => typeof status === "string")
    : [];
  return {
    expiresAt: expiresAt && Number.isFinite(expiresAt.getTime()) ? expiresAt : null,
    registrar: registrarName(record.entities),
    pendingDeletion: statuses.some((status) => deletionStatuses.has(status.toLowerCase())),
  };
}

function registrarName(entities: unknown): string | null {
  if (!Array.isArray(entities)) return null;
  for (const entity of entities) {
    if (!isRecord(entity) || !Array.isArray(entity.roles) || !entity.roles.includes("registrar")) {
      continue;
    }
    const properties = Array.isArray(entity.vcardArray) ? entity.vcardArray[1] : null;
    if (!Array.isArray(properties)) continue;
    const name = properties.find(
      (property): property is [string, unknown, string, string] =>
        Array.isArray(property) && property[0] === "fn" && typeof property[3] === "string"
    );
    if (name?.[3].trim()) return name[3].trim().slice(0, 200);
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
