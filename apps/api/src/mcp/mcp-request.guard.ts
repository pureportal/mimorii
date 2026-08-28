import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { publicOrigin } from "../auth/oauth-config.js";
import { configuredCorsOrigins } from "../cors.js";

const localhostNames = ["localhost", "127.0.0.1", "[::1]"];

@Injectable()
export class McpRequestGuard implements CanActivate {
  private readonly allowedHosts = new Set(configuredMcpHostnames());
  private readonly allowedOrigins = new Set(configuredMcpOrigins());

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader("Cache-Control", "no-store");
    response.vary("Authorization");
    response.vary("Origin");
    const host = hostnameFromHostHeader(request.headers.host);
    if (!host || !this.allowedHosts.has(host)) {
      throw new ForbiddenException("MCP request host is not allowed");
    }

    const origin = request.headers.origin;
    if (origin !== undefined) {
      const normalizedOrigin = originFromHeader(origin);
      if (!normalizedOrigin || !this.allowedOrigins.has(normalizedOrigin)) {
        throw new ForbiddenException("MCP request origin is not allowed");
      }
    }

    return true;
  }
}

export function configuredMcpHostnames(
  publicUrl = process.env.MIMORII_PUBLIC_URL ?? "http://localhost:4310",
  additionalHosts = process.env.MIMORII_MCP_ALLOWED_HOSTS
): string[] {
  const hostnames = new Set(localhostNames);
  hostnames.add(hostnameFromUrl(publicUrl));
  for (const host of commaSeparated(additionalHosts)) {
    const hostname = hostnameFromHostHeader(host);
    if (!hostname) throw new Error(`Invalid MIMORII_MCP_ALLOWED_HOSTS entry: ${host}`);
    hostnames.add(hostname);
  }
  return [...hostnames];
}

export function configuredMcpOrigins(
  publicUrl = process.env.MIMORII_PUBLIC_URL ?? "http://localhost:4310",
  corsOrigins = configuredCorsOrigins()
): string[] {
  const origins = new Set([originFromUrl(publicUrl)]);
  for (const origin of corsOrigins) {
    const normalizedOrigin = originFromHeader(origin);
    if (normalizedOrigin) origins.add(normalizedOrigin);
  }
  return [...origins];
}

export function hostnameFromHostHeader(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(`http://${value}`);
    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return undefined;
    }
    return normalizeHostname(parsed.hostname);
  } catch {
    return undefined;
  }
}

export function originFromHeader(value: string): string | undefined {
  try {
    const parsed = new URL(value);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return undefined;
    }
    return parsed.origin;
  } catch {
    return undefined;
  }
}

function hostnameFromUrl(value: string): string {
  const parsed = publicOrigin(value);
  return normalizeHostname(parsed.hostname);
}

function originFromUrl(value: string): string {
  return publicOrigin(value).origin;
}

function normalizeHostname(value: string): string {
  const normalized = value.toLowerCase();
  return normalized.endsWith(".") ? normalized.slice(0, -1) : normalized;
}

function commaSeparated(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
