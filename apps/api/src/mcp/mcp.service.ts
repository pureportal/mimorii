import { Injectable, Logger, OnApplicationShutdown, UnauthorizedException } from "@nestjs/common";
import {
  createMcpHandler,
  McpServer,
  type AuthInfo,
  type McpHttpHandler,
  type McpRequestContext,
} from "@modelcontextprotocol/server";
import { toNodeHandler, type NodeMcpRequestHandler } from "@modelcontextprotocol/node";
import type { Response } from "express";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { readBearerToken } from "../auth/bearer-token.js";
import type { AuthenticatedRequest } from "../auth/current-user.decorator.js";
import { mcpResourceUrl } from "../auth/oauth-config.js";
import { ChecksService } from "../checks/checks.service.js";
import { HeartbeatsService } from "../heartbeats/heartbeats.service.js";
import { IncidentsService } from "../incidents/incidents.service.js";
import { MaintenanceService } from "../maintenance/maintenance.service.js";
import { ObjectivesService } from "../objectives/objectives.service.js";
import { ResourcesService } from "../resources/resources.service.js";
import { TeamsService } from "../teams/teams.service.js";
import { applicationVersion } from "../version.js";
import { mcpAppsCapability, registerMcpAppResources } from "./mcp-app.js";
import { registerMcpTools, type McpToolServices } from "./mcp-tools.js";

interface McpNodeRequest extends AuthenticatedRequest {
  auth?: AuthInfo;
}

const capabilityCacheHint = { ttlMs: 5 * 60_000, cacheScope: "public" } as const;
const monitoringInstructions =
  "Use Mimorii tools for questions about current service and infrastructure status. " +
  "Call list_teams before concluding that no monitoring data is available. " +
  "For each relevant team, call get_team_overview; use list_resources and list_checks for resource and check details. " +
  "Treat returned status values and timestamps as the current monitoring state.";

@Injectable()
export class McpService implements OnApplicationShutdown {
  private readonly logger = new Logger(McpService.name);
  private readonly handler: McpHttpHandler;
  private readonly nodeHandler: NodeMcpRequestHandler;

  constructor(
    teams: TeamsService,
    resources: ResourcesService,
    checks: ChecksService,
    incidents: IncidentsService,
    maintenance: MaintenanceService,
    heartbeats: HeartbeatsService,
    analytics: AnalyticsService,
    objectives: ObjectivesService
  ) {
    const services: McpToolServices = {
      teams,
      resources,
      checks,
      incidents,
      maintenance,
      heartbeats,
      analytics,
      objectives,
    };
    this.handler = createMimoriiMcpHandler(services, (error) => this.logger.error(error.stack));
    this.nodeHandler = toNodeHandler(this.handler, {
      onerror: (error) => this.logger.error(error.stack),
    });
  }

  async handle(request: AuthenticatedRequest, response: Response, body: unknown): Promise<void> {
    const credential = request.authCredential;
    const token = readBearerToken(request);
    if (
      !credential ||
      credential.type !== "oauth" ||
      !token ||
      request.user.authMethod !== "oauth" ||
      typeof credential.clientId !== "string" ||
      credential.resource !== mcpResourceUrl().href
    ) {
      throw new UnauthorizedException("MCP OAuth access token required");
    }

    const mcpRequest = request as McpNodeRequest;
    mcpRequest.auth = {
      token,
      clientId: credential.clientId,
      scopes: credential.scopes,
      expiresAt: expiresAtSeconds(credential.expiresAt),
      resource: mcpResourceUrl(),
      extra: { userId: request.user.id },
    };
    response.set({ "Cache-Control": "no-store" });
    await this.nodeHandler(mcpRequest, response, body);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.handler.close();
  }
}

export function createMimoriiMcpHandler(
  services: McpToolServices,
  onerror?: (error: Error) => void
): McpHttpHandler {
  return createMcpHandler((context) => createServer(context, services), {
    legacy: "stateless",
    maxSubscriptions: 0,
    onerror,
  });
}

function createServer(context: McpRequestContext, services: McpToolServices): McpServer {
  const userId = context.authInfo?.extra?.userId;
  if (typeof userId !== "string" || !userId) {
    throw new UnauthorizedException("MCP authentication context is missing");
  }
  const server = new McpServer(
    { name: "mimorii", version: applicationVersion },
    {
      capabilities: {
        extensions: mcpAppsCapability,
      },
      instructions: monitoringInstructions,
      cacheHints: {
        "server/discover": capabilityCacheHint,
        "tools/list": capabilityCacheHint,
        "resources/list": capabilityCacheHint,
      },
    }
  );
  registerMcpAppResources(server);
  registerMcpTools(server, userId, context.authInfo?.scopes ?? [], services);
  return server;
}

function expiresAtSeconds(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  return Math.floor(new Date(value).getTime() / 1_000);
}
