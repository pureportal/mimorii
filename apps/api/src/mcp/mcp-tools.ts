import { HttpException, Logger } from "@nestjs/common";
import {
  incidentImpacts,
  incidentStatuses,
  resourceKinds,
  type CheckSummary,
  type IncidentSummary,
} from "@mimorii/contracts";
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { AnalyticsService } from "../analytics/analytics.service.js";
import type { McpScope } from "../auth/oauth-config.js";
import type { ChecksService } from "../checks/checks.service.js";
import type { HeartbeatsService } from "../heartbeats/heartbeats.service.js";
import type { IncidentsService } from "../incidents/incidents.service.js";
import type { MaintenanceService } from "../maintenance/maintenance.service.js";
import type { ObjectivesService } from "../objectives/objectives.service.js";
import type { ResourcesService } from "../resources/resources.service.js";
import type { TeamsService } from "../teams/teams.service.js";

export interface McpToolServices {
  teams: Pick<TeamsService, "list">;
  resources: Pick<ResourcesService, "list" | "get" | "update">;
  checks: Pick<ChecksService, "list" | "get" | "history">;
  incidents: Pick<IncidentsService, "list" | "get" | "create" | "addUpdate">;
  maintenance: Pick<MaintenanceService, "list" | "get">;
  heartbeats: Pick<HeartbeatsService, "list" | "get" | "history">;
  analytics: Pick<AnalyticsService, "overview" | "report">;
  objectives: Pick<ObjectivesService, "list">;
}

const logger = new Logger("McpTools");
const identifier = z.uuid();
const offsetSchema = z.number().int().min(0).max(10_000).default(0);
const limitSchema = z.number().int().min(1).max(100).default(50);
const timestampSchema = z.iso.datetime({ offset: true });
const checkHistoryInputSchema = z
  .object({
    teamId: identifier,
    checkId: identifier,
    from: timestampSchema.optional(),
    to: timestampSchema.optional(),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict()
  .refine(({ from, to }) => !from || !to || new Date(from).getTime() <= new Date(to).getTime(), {
    message: "History start must not be after its end",
  });
const availabilityReportInputSchema = z
  .object({
    teamId: identifier,
    from: timestampSchema.optional(),
    to: timestampSchema.optional(),
    resourceId: identifier.optional(),
    checkId: identifier.optional(),
  })
  .strict()
  .refine(({ resourceId, checkId }) => !resourceId || !checkId, {
    message: "Choose either a resource or a check",
  })
  .refine(({ from, to }) => !from || !to || new Date(from).getTime() < new Date(to).getTime(), {
    message: "Report start must be before its end",
  });
const writeToolNames = new Set(["update_resource", "create_incident", "add_incident_update"]);
const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const internalMutationAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;
const notifyingMutationAnnotations = {
  ...internalMutationAnnotations,
  openWorldHint: true,
} as const;

export function requiresMcpWriteScope(toolName: string | undefined): boolean {
  return toolName !== undefined && writeToolNames.has(toolName);
}

export function registerMcpTools(
  server: McpServer,
  userId: string,
  scopes: readonly string[],
  services: McpToolServices
): void {
  server.registerTool(
    "list_teams",
    {
      description: "List teams available to the authenticated user.",
      inputSchema: z.object({ offset: offsetSchema, limit: limitSchema }).strict(),
      annotations: readOnlyAnnotations,
    },
    ({ offset, limit }) =>
      executeTool(async () => page(await services.teams.list(userId), offset, limit))
  );

  server.registerTool(
    "get_team_overview",
    {
      description: "Get current monitoring health and recent incidents for a team.",
      inputSchema: z.object({ teamId: identifier }).strict(),
      annotations: readOnlyAnnotations,
    },
    ({ teamId }) =>
      executeTool(async () => {
        const { incidents, ...overview } = await services.analytics.overview(userId, teamId);
        return { ...overview, incidents: incidents.map(incidentListItem) };
      })
  );

  server.registerTool(
    "get_availability_report",
    {
      description:
        "Get availability, latency, and recovery metrics for a team, resource, or check.",
      inputSchema: availabilityReportInputSchema,
      annotations: readOnlyAnnotations,
    },
    ({ teamId, from, to, resourceId, checkId }) =>
      executeTool(() =>
        services.analytics.report(userId, teamId, { from, to, resourceId, checkId })
      )
  );

  server.registerTool(
    "list_service_objectives",
    {
      description: "List service-level objectives and error-budget status for a team.",
      inputSchema: z
        .object({ teamId: identifier, offset: offsetSchema, limit: limitSchema })
        .strict(),
      annotations: readOnlyAnnotations,
    },
    ({ teamId, offset, limit }) =>
      executeTool(async () => page(await services.objectives.list(userId, teamId), offset, limit))
  );

  server.registerTool(
    "list_resources",
    {
      description: "List resources in a team.",
      inputSchema: z
        .object({ teamId: identifier, offset: offsetSchema, limit: limitSchema })
        .strict(),
      annotations: readOnlyAnnotations,
    },
    ({ teamId, offset, limit }) =>
      executeTool(async () => page(await services.resources.list(userId, teamId), offset, limit))
  );

  server.registerTool(
    "get_resource",
    {
      description: "Get one resource.",
      inputSchema: z.object({ teamId: identifier, resourceId: identifier }).strict(),
      annotations: readOnlyAnnotations,
    },
    ({ teamId, resourceId }) =>
      executeTool(() => services.resources.get(userId, teamId, resourceId))
  );

  server.registerTool(
    "update_resource",
    {
      description: "Update a resource's name, kind, description, or tags.",
      inputSchema: z
        .object({
          teamId: identifier,
          resourceId: identifier,
          name: z.string().trim().min(1).max(100).optional(),
          kind: z.enum(resourceKinds).optional(),
          description: z.string().trim().max(500).optional(),
          tags: z.array(z.string().trim().min(1).max(32)).max(12).optional(),
        })
        .strict()
        .refine(
          ({ name, kind, description, tags }) =>
            name !== undefined ||
            kind !== undefined ||
            description !== undefined ||
            tags !== undefined,
          { message: "Provide at least one resource field to update" }
        ),
      annotations: internalMutationAnnotations,
    },
    ({ teamId, resourceId, name, kind, description, tags }) =>
      executeMutation(scopes, () =>
        services.resources.update(userId, teamId, resourceId, {
          name,
          kind,
          description,
          tags,
        })
      )
  );

  server.registerTool(
    "list_checks",
    {
      description: "List check status without check configuration.",
      inputSchema: z
        .object({
          teamId: identifier,
          resourceId: identifier.optional(),
          offset: offsetSchema,
          limit: limitSchema,
        })
        .strict(),
      annotations: readOnlyAnnotations,
    },
    ({ teamId, resourceId, offset, limit }) =>
      executeTool(async () => {
        const checks = await services.checks.list(userId, teamId, resourceId);
        return page(checks.map(withoutCheckConfiguration), offset, limit);
      })
  );

  server.registerTool(
    "get_check",
    {
      description: "Get check status without its configuration.",
      inputSchema: z.object({ teamId: identifier, checkId: identifier }).strict(),
      annotations: readOnlyAnnotations,
    },
    ({ teamId, checkId }) =>
      executeTool(async () =>
        withoutCheckConfiguration(await services.checks.get(userId, teamId, checkId))
      )
  );

  server.registerTool(
    "get_check_history",
    {
      description: "Get recent results for a check.",
      inputSchema: checkHistoryInputSchema,
      annotations: readOnlyAnnotations,
    },
    ({ teamId, checkId, from, to, limit }) =>
      executeTool(async () => ({
        items: await services.checks.history(userId, teamId, checkId, { from, to, limit }),
      }))
  );

  server.registerTool(
    "list_heartbeats",
    {
      description: "List heartbeat monitor status.",
      inputSchema: z
        .object({
          teamId: identifier,
          resourceId: identifier.optional(),
          offset: offsetSchema,
          limit: limitSchema,
        })
        .strict(),
      annotations: readOnlyAnnotations,
    },
    ({ teamId, resourceId, offset, limit }) =>
      executeTool(async () =>
        page(await services.heartbeats.list(userId, teamId, resourceId), offset, limit)
      )
  );

  server.registerTool(
    "get_heartbeat",
    {
      description: "Get one heartbeat monitor's status.",
      inputSchema: z.object({ teamId: identifier, heartbeatId: identifier }).strict(),
      annotations: readOnlyAnnotations,
    },
    ({ teamId, heartbeatId }) =>
      executeTool(() => services.heartbeats.get(userId, teamId, heartbeatId))
  );

  server.registerTool(
    "get_heartbeat_history",
    {
      description: "Get recent events for a heartbeat monitor.",
      inputSchema: z
        .object({
          teamId: identifier,
          heartbeatId: identifier,
          limit: z.number().int().min(1).max(100).default(50),
        })
        .strict(),
      annotations: readOnlyAnnotations,
    },
    ({ teamId, heartbeatId, limit }) =>
      executeTool(async () => ({
        items: await services.heartbeats.history(userId, teamId, heartbeatId, limit),
      }))
  );

  server.registerTool(
    "list_incidents",
    {
      description: "List incidents in a team.",
      inputSchema: z
        .object({
          teamId: identifier,
          status: z.enum(["active", "resolved"]).optional(),
          limit: limitSchema,
        })
        .strict(),
      annotations: readOnlyAnnotations,
    },
    ({ teamId, status, limit }) =>
      executeTool(async () => ({
        items: (await services.incidents.list(userId, teamId, { status, limit })).map(
          incidentListItem
        ),
      }))
  );

  server.registerTool(
    "get_incident",
    {
      description: "Get one incident and its recent updates.",
      inputSchema: z
        .object({
          teamId: identifier,
          incidentId: identifier,
          updateLimit: z.number().int().min(1).max(100).default(50),
        })
        .strict(),
      annotations: readOnlyAnnotations,
    },
    ({ teamId, incidentId, updateLimit }) =>
      executeTool(async () =>
        incidentDetail(await services.incidents.get(userId, teamId, incidentId), updateLimit)
      )
  );

  server.registerTool(
    "create_incident",
    {
      description: "Create a manual incident and publish its initial update.",
      inputSchema: z
        .object({
          teamId: identifier,
          title: z.string().trim().min(1).max(160),
          impact: z.enum(incidentImpacts),
          resourceIds: z.array(identifier).min(1).max(200),
          message: z.string().trim().min(1).max(2_000),
          status: z.enum(["investigating", "identified", "monitoring"]).optional(),
          startedAt: timestampSchema.optional(),
        })
        .strict(),
      annotations: notifyingMutationAnnotations,
    },
    ({ teamId, ...input }) =>
      executeMutation(scopes, async () =>
        incidentDetail(await services.incidents.create(userId, teamId, input), 50)
      )
  );

  server.registerTool(
    "add_incident_update",
    {
      description: "Publish an incident update and change its status.",
      inputSchema: z
        .object({
          teamId: identifier,
          incidentId: identifier,
          status: z.enum(incidentStatuses),
          message: z.string().trim().max(2_000),
        })
        .strict(),
      annotations: notifyingMutationAnnotations,
    },
    ({ teamId, incidentId, status, message }) =>
      executeMutation(scopes, async () =>
        incidentDetail(
          await services.incidents.addUpdate(userId, teamId, incidentId, { status, message }),
          50
        )
      )
  );

  server.registerTool(
    "list_maintenance",
    {
      description: "List maintenance windows in a team.",
      inputSchema: z
        .object({ teamId: identifier, offset: offsetSchema, limit: limitSchema })
        .strict(),
      annotations: readOnlyAnnotations,
    },
    ({ teamId, offset, limit }) =>
      executeTool(async () => page(await services.maintenance.list(userId, teamId), offset, limit))
  );

  server.registerTool(
    "get_maintenance",
    {
      description: "Get one maintenance window.",
      inputSchema: z.object({ teamId: identifier, maintenanceId: identifier }).strict(),
      annotations: readOnlyAnnotations,
    },
    ({ teamId, maintenanceId }) =>
      executeTool(() => services.maintenance.get(userId, teamId, maintenanceId))
  );
}

async function executeMutation(
  scopes: readonly string[],
  action: () => Promise<unknown>
): Promise<CallToolResult> {
  if (!scopes.includes("mcp:write" satisfies McpScope)) {
    return toolError("OAuth scope mcp:write is required");
  }
  return executeTool(action);
}

async function executeTool(action: () => Promise<unknown>): Promise<CallToolResult> {
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

function toolError(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

function structuredResult(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

function page<T>(items: T[], start: number, pageSize: number) {
  const nextOffset = start + pageSize < items.length ? start + pageSize : null;
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    nextOffset,
  };
}

function withoutCheckConfiguration(check: CheckSummary): Omit<CheckSummary, "config"> {
  const { config: _config, ...summary } = check;
  return summary;
}

function incidentListItem(incident: IncidentSummary) {
  const { updates, ...summary } = incident;
  return {
    ...summary,
    updateCount: updates.length,
    latestUpdate: updates[0] ?? null,
  };
}

function incidentDetail(incident: IncidentSummary, updateLimit: number) {
  return {
    ...incident,
    updates: incident.updates.slice(0, updateLimit),
    updateCount: incident.updates.length,
    updatesTruncated: incident.updates.length > updateLimit,
  };
}
