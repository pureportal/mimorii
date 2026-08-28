import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configuredMcpHostnames,
  hostnameFromHostHeader,
  originFromHeader,
  McpRequestGuard,
} from "./mcp-request.guard.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("MCP request validation", () => {
  it("normalizes configured public and additional hosts", () => {
    expect(
      configuredMcpHostnames("https://Mimorii.Example:8443", "api.example,internal.example:4310")
    ).toEqual([
      "localhost",
      "127.0.0.1",
      "[::1]",
      "mimorii.example",
      "api.example",
      "internal.example",
    ]);
  });

  it("rejects malformed host and origin values", () => {
    expect(hostnameFromHostHeader("evil.example@localhost")).toBeUndefined();
    expect(hostnameFromHostHeader("localhost/path")).toBeUndefined();
    expect(originFromHeader("null")).toBeUndefined();
    expect(originFromHeader("file://localhost/path")).toBeUndefined();
    expect(originFromHeader("https://ai.example/path")).toBeUndefined();
  });

  it("accepts configured hosts and browser origins", () => {
    vi.stubEnv("MIMORII_PUBLIC_URL", "https://mimorii.example");
    vi.stubEnv("MIMORII_CORS_ORIGINS", "https://ai.example:9443");
    const guard = new McpRequestGuard();

    expect(
      guard.canActivate(context({ host: "mimorii.example", origin: "https://ai.example:9443" }))
    ).toBe(true);
    expect(guard.canActivate(context({ host: "mimorii.example" }))).toBe(true);
  });

  it("rejects unconfigured hosts and origins", () => {
    vi.stubEnv("MIMORII_PUBLIC_URL", "https://mimorii.example");
    vi.stubEnv("MIMORII_CORS_ORIGINS", "https://ai.example");
    const guard = new McpRequestGuard();

    expect(() => guard.canActivate(context({ host: "attacker.example" }))).toThrow(
      ForbiddenException
    );
    expect(() =>
      guard.canActivate(context({ host: "mimorii.example", origin: "https://attacker.example" }))
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(context({ host: "mimorii.example", origin: "https://ai.example:9443" }))
    ).toThrow(ForbiddenException);
  });
});

function context(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
      getResponse: () => ({ setHeader: vi.fn(), vary: vi.fn() }),
    }),
  } as unknown as ExecutionContext;
}
