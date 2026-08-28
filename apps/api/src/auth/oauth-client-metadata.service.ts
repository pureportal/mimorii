import { Injectable } from "@nestjs/common";
import type { IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import * as z from "zod/v4";
import { TargetSafetyService } from "../common/target-safety.service.js";
import { OAuthException } from "./oauth-error.js";

const maximumMetadataBytes = 5 * 1_024;
const retrievalTimeoutMs = 5_000;
const cacheDurationMs = 10 * 60_000;
const maximumCacheEntries = 500;

const metadataSchema = z.object({
  client_id: z.string().min(1).max(2_048),
  client_name: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[^\p{Cc}\p{Cf}]+$/u),
  redirect_uris: z.array(z.string().min(1).max(2_048)).min(1).max(20),
  grant_types: z.array(z.string().min(1).max(256)).max(10).optional(),
  response_types: z.array(z.string().min(1).max(256)).max(10).optional(),
  token_endpoint_auth_method: z.literal("none").optional(),
});

export interface OAuthClientMetadata {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  allowRefresh: boolean;
}

interface CachedMetadata {
  value: OAuthClientMetadata;
  expiresAt: number;
}

interface RetrievedMetadata {
  body: string;
  cacheDurationMs: number;
}

@Injectable()
export class OAuthClientMetadataService {
  private readonly cache = new Map<string, CachedMetadata>();

  constructor(private readonly targets: TargetSafetyService) {}

  async resolve(clientId: string): Promise<OAuthClientMetadata> {
    const url = validateClientIdUrl(clientId);
    const cached = this.cache.get(clientId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (cached) this.cache.delete(clientId);

    try {
      const addresses = await this.targets.resolveStrictPublicHost(url.hostname);
      const metadata = await this.retrieve(url, addresses[0]!.address);
      const value = parseClientMetadata(metadata.body, clientId);
      if (metadata.cacheDurationMs > 0) {
        if (this.cache.size >= maximumCacheEntries) {
          this.cache.delete(this.cache.keys().next().value!);
        }
        this.cache.set(clientId, {
          value,
          expiresAt: Date.now() + metadata.cacheDurationMs,
        });
      }
      return value;
    } catch (error) {
      if (error instanceof OAuthException) throw error;
      throw new OAuthException("invalid_client", "OAuth client metadata could not be verified");
    }
  }

  private retrieve(url: URL, address: string): Promise<RetrievedMetadata> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer: NodeJS.Timeout | undefined;
      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        action();
      };
      const request = httpsRequest(
        {
          hostname: address,
          port: url.port || 443,
          path: url.pathname,
          method: "GET",
          headers: {
            accept: "application/json",
            "accept-encoding": "identity",
            host: url.host,
            "user-agent": "Mimorii OAuth client metadata",
          },
          maxHeaderSize: 16 * 1_024,
          servername: url.hostname,
          rejectUnauthorized: true,
        },
        (response) => {
          if (response.statusCode !== 200 || !isJsonContentType(response.headers)) {
            response.resume();
            finish(() => reject(new Error("OAuth client metadata response is invalid")));
            return;
          }
          const contentLength = Number(response.headers["content-length"]);
          if (Number.isFinite(contentLength) && contentLength > maximumMetadataBytes) {
            response.destroy();
            finish(() => reject(new Error("OAuth client metadata is too large")));
            return;
          }
          const chunks: Buffer[] = [];
          let bytes = 0;
          response.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > maximumMetadataBytes) {
              response.destroy();
              finish(() => reject(new Error("OAuth client metadata is too large")));
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () =>
            finish(() =>
              resolve({
                body: Buffer.concat(chunks).toString("utf8"),
                cacheDurationMs: clientMetadataCacheDuration(response.headers),
              })
            )
          );
          response.on("error", (error) => finish(() => reject(error)));
        }
      );
      request.on("error", (error) => finish(() => reject(error)));
      request.setTimeout(retrievalTimeoutMs, () => request.destroy());
      timer = setTimeout(
        () => request.destroy(new Error("OAuth client metadata request timed out")),
        retrievalTimeoutMs
      );
      request.end();
    });
  }
}

export function validateClientIdUrl(clientId: string): URL {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    throw new OAuthException("invalid_client", "OAuth client ID is invalid");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    clientId.includes("#") ||
    clientId.includes("?") ||
    url.pathname === "/" ||
    hasDotPathSegment(clientId)
  ) {
    throw new OAuthException("invalid_client", "OAuth client ID is invalid");
  }
  return url;
}

function hasDotPathSegment(value: string): boolean {
  const pathStart = value.indexOf("/", "https://".length);
  if (pathStart < 0) return false;
  const path = value.slice(pathStart).split(/[?#]/, 1)[0]!;
  return path.split("/").some((segment) => {
    const decodedDots = segment.replace(/%2e/gi, ".");
    return decodedDots === "." || decodedDots === "..";
  });
}

export function parseClientMetadata(body: string, clientId: string): OAuthClientMetadata {
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    throw new OAuthException("invalid_client", "OAuth client metadata is invalid");
  }
  const parsed = metadataSchema.safeParse(input);
  if (!parsed.success || parsed.data.client_id !== clientId) {
    throw new OAuthException("invalid_client", "OAuth client metadata is invalid");
  }
  if (parsed.data.grant_types && !parsed.data.grant_types.includes("authorization_code")) {
    throw new OAuthException("invalid_client", "OAuth client metadata is invalid");
  }
  if (parsed.data.response_types && !parsed.data.response_types.includes("code")) {
    throw new OAuthException("invalid_client", "OAuth client metadata is invalid");
  }
  const redirectUris = [...new Set(parsed.data.redirect_uris)];
  if (!redirectUris.every(validRedirectUri)) {
    throw new OAuthException("invalid_client", "OAuth client redirect URI is invalid");
  }
  return {
    clientId,
    clientName: parsed.data.client_name,
    redirectUris,
    allowRefresh: parsed.data.grant_types?.includes("refresh_token") ?? false,
  };
}

export function validRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash || value.includes("#")) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}

export function isLoopbackHostname(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname.toLowerCase());
}

export function clientMetadataCacheDuration(
  headers: IncomingHttpHeaders,
  now = Date.now()
): number {
  const cacheControl = headerValue(headers["cache-control"]);
  if (cacheControl) {
    const directives = cacheControl
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (
      directives.some(
        (value) => value === "no-store" || value === "no-cache" || value.startsWith("no-cache=")
      )
    ) {
      return 0;
    }
    const maxAgeDirective = directives.find((value) => /^max-age\s*=/.test(value));
    if (maxAgeDirective) {
      const match = /^max-age\s*=\s*(?:"(\d+)"|(\d+))$/.exec(maxAgeDirective);
      if (!match) return 0;
      const maxAge = Number(match[1] ?? match[2]);
      if (!Number.isSafeInteger(maxAge)) return 0;
      const ageValue = headerValue(headers.age) ?? "0";
      const age = /^\d+$/.test(ageValue) ? Number(ageValue) : 0;
      const remainingSeconds = Math.max(0, maxAge - (Number.isSafeInteger(age) ? age : 0));
      return Math.min(cacheDurationMs, remainingSeconds * 1_000);
    }
  }
  const expiresAt = Date.parse(headerValue(headers.expires) ?? "");
  if (Number.isFinite(expiresAt)) {
    return Math.min(cacheDurationMs, Math.max(0, expiresAt - now));
  }
  return cacheDurationMs;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(",") : value;
}

function isJsonContentType(headers: IncomingHttpHeaders): boolean {
  const contentType = headers["content-type"];
  if (!contentType) return false;
  const value = Array.isArray(contentType) ? contentType[0] : contentType;
  return /^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)(?:\s*;|$)/i.test(value ?? "");
}
