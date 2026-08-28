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
const tokenEndpointAuthMethodSchema = z.string().min(1).max(256);

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
  token_endpoint_auth_method: tokenEndpointAuthMethodSchema.optional(),
  token_endpoint_auth_methods_supported: z
    .array(tokenEndpointAuthMethodSchema)
    .min(1)
    .max(10)
    .optional(),
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
  const supportedAuthMethods = parsed.data.token_endpoint_auth_methods_supported;
  if (
    (supportedAuthMethods && !supportedAuthMethods.includes("none")) ||
    (!supportedAuthMethods &&
      parsed.data.token_endpoint_auth_method !== undefined &&
      parsed.data.token_endpoint_auth_method !== "none")
  ) {
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

export function redirectUriMatches(registeredUri: string, requestedUri: string): boolean {
  if (!validRedirectUri(registeredUri) || !validRedirectUri(requestedUri)) return false;
  if (registeredUri === requestedUri) return true;

  const registered = new URL(registeredUri);
  const requested = new URL(requestedUri);
  if (
    registered.protocol !== "http:" ||
    requested.protocol !== "http:" ||
    registered.hostname !== requested.hostname ||
    !isLoopbackHostname(registered.hostname)
  ) {
    return false;
  }

  registered.port = "";
  requested.port = "";
  return registered.href === requested.href;
}

export function isLoopbackHostname(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname.toLowerCase());
}

export function clientMetadataCacheDuration(
  headers: IncomingHttpHeaders,
  now = Date.now()
): number {
  const cacheControl = headerValue(headers["cache-control"]);
  const vary = headerValue(headers.vary);
  const directives = (cacheControl ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (
    directives.some((value) =>
      ["no-store", "no-cache", "private"].includes(cacheDirectiveName(value))
    )
  ) {
    return 0;
  }
  if (vary?.split(",").some((value) => value.trim() === "*")) return 0;

  const currentAge = currentAgeSeconds(headers, now);
  if (currentAge === undefined) return 0;
  const sharedMaxAge = cacheDirectiveSeconds(directives, "s-maxage");
  if (sharedMaxAge !== undefined) return boundedCacheDuration(sharedMaxAge - currentAge);
  const maxAge = cacheDirectiveSeconds(directives, "max-age");
  if (maxAge !== undefined) return boundedCacheDuration(maxAge - currentAge);

  const expiresValue = headerValue(headers.expires);
  if (expiresValue !== undefined) {
    const expiresAt = Date.parse(expiresValue);
    if (!Number.isFinite(expiresAt)) return 0;
    const responseDate = Date.parse(headerValue(headers.date) ?? "");
    const freshnessLifetime =
      (expiresAt - (Number.isFinite(responseDate) ? responseDate : now)) / 1_000;
    return boundedCacheDuration(freshnessLifetime - currentAge);
  }
  return cacheDurationMs;
}

function cacheDirectiveName(value: string): string {
  const separator = value.indexOf("=");
  return (separator < 0 ? value : value.slice(0, separator)).trim();
}

function cacheDirectiveSeconds(directives: string[], name: string): number | undefined {
  const matching = directives.filter((value) => cacheDirectiveName(value) === name);
  if (matching.length === 0) return undefined;
  if (matching.length !== 1) return 0;
  const match = new RegExp(`^${name}\\s*=\\s*(?:"(\\d+)"|(\\d+))$`).exec(matching[0]!);
  if (!match) return 0;
  const seconds = Number(match[1] ?? match[2]);
  return Number.isSafeInteger(seconds) ? seconds : 0;
}

function currentAgeSeconds(headers: IncomingHttpHeaders, now: number): number | undefined {
  const ageValue = headerValue(headers.age);
  if (ageValue !== undefined && !/^\d+$/.test(ageValue)) return undefined;
  const age = Number(ageValue ?? 0);
  if (!Number.isSafeInteger(age)) return undefined;
  const responseDate = Date.parse(headerValue(headers.date) ?? "");
  const apparentAge = Number.isFinite(responseDate) ? Math.max(0, (now - responseDate) / 1_000) : 0;
  return Math.max(age, apparentAge);
}

function boundedCacheDuration(remainingSeconds: number): number {
  return Math.min(cacheDurationMs, Math.max(0, remainingSeconds * 1_000));
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
