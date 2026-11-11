import { HttpException, Logger } from "@nestjs/common";
import type { CallToolResult } from "@modelcontextprotocol/server";
import type { McpScope } from "../auth/oauth-config.js";

const logger = new Logger("McpTools");

export const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
export const internalMutationAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;
export const notifyingMutationAnnotations = {
  ...internalMutationAnnotations,
  openWorldHint: true,
} as const;

export async function executeMutation(
  scopes: readonly string[],
  action: () => Promise<unknown>
): Promise<CallToolResult> {
  if (!scopes.includes("mcp:write" satisfies McpScope)) {
    return toolError("OAuth scope mcp:write is required");
  }
  return executeTool(action);
}

export async function executeTool(action: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const result = await action();
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: structuredResult(result),
    };
  } catch (error) {
    if (error instanceof HttpException && error.getStatus() < 500) {
      return toolError(error.message);
    }
    logger.error(error instanceof Error ? error.stack : String(error));
    return toolError("Request failed");
  }
}

export function toolError(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

function structuredResult(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}
