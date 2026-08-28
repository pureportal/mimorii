import { ForbiddenException } from "@nestjs/common";
import type {
  AnalyticsReport,
  CheckSummary,
  IncidentSummary,
  OverviewAnalytics,
  ResourceSummary,
  ServiceLevelObjectiveSummary,
  TeamSummary,
} from "@mimorii/contracts";
import type { AuthInfo, McpHttpHandler } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { McpToolServices } from "./mcp-tools.js";
import { createMimoriiMcpHandler } from "./mcp.service.js";

const protocolVersion = "2026-07-28";
const teamId = "11111111-1111-4111-8111-111111111111";
const resourceId = "22222222-2222-4222-8222-222222222222";
const checkId = "33333333-3333-4333-8333-333333333333";
const incidentId = "44444444-4444-4444-8444-444444444444";
const handlers: McpHttpHandler[] = [];

afterEach(async () => {
  await Promise.all(handlers.splice(0).map((handler) => handler.close()));
});

describe("Mimorii MCP handler", () => {
  it("publishes the scoped operational tool surface", async () => {
    const handler = createHandler();
    const response = await send(handler, auth("user-1"), "tools/list", {});
    const discovery = await send(handler, auth("user-1"), "server/discover", {});

    expect(response.status).toBe(200);
    const body = await json(response);
    const tools = body.result!.tools!;
    expect(tools.map((tool) => tool.name)).toEqual([
      "list_teams",
      "get_team_overview",
      "get_availability_report",
      "list_service_objectives",
      "list_resources",
      "get_resource",
      "update_resource",
      "list_checks",
      "get_check",
      "get_check_history",
      "list_heartbeats",
      "get_heartbeat",
      "get_heartbeat_history",
      "list_incidents",
      "get_incident",
      "create_incident",
      "add_incident_update",
      "list_maintenance",
      "get_maintenance",
    ]);
    expect(body.result).toMatchObject({ ttlMs: 300_000, cacheScope: "public" });
    expect((await json(discovery)).result).toMatchObject({
      ttlMs: 300_000,
      cacheScope: "public",
    });
    for (const tool of tools.filter(
      (item) => !item.name.includes("update") && item.name !== "create_incident"
    )) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }
    expect(tools.find((tool) => tool.name === "update_resource")!.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    });
    expect(tools.find((tool) => tool.name === "create_incident")!.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    });
  });

  it("binds calls to the authenticated user and bounds structured list results", async () => {
    const list = vi.fn(async (userId: string, requestedTeamId: string) =>
      Array.from(
        { length: 18 },
        (_, index): ResourceSummary => resource(`${userId}-${index}`, requestedTeamId, index)
      )
    );
    const handler = createHandler({ resources: { ...emptyServices().resources, list } });
    const response = await send(
      handler,
      auth("user-7"),
      "tools/call",
      {
        name: "list_resources",
        arguments: { teamId, offset: 5, limit: 4 },
      },
      "list_resources"
    );

    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith("user-7", teamId);
    const body = await json(response);
    const result = toolResult<{
      items: Array<{ id: string; name: string }>;
      total: number;
      nextOffset: number | null;
    }>(body);
    expect(result).toMatchObject({ total: 18, nextOffset: 9 });
    expect(result.items).toHaveLength(4);
    expect(result.items[0]).toMatchObject({ name: "user-7-5" });
    expect(body.result!.structuredContent).toEqual(result);
  });

  it("removes check configuration from tool output", async () => {
    const get = vi.fn(async (): Promise<CheckSummary> => checkSummary());
    const handler = createHandler({ checks: { ...emptyServices().checks, get } });
    const response = await send(
      handler,
      auth("user-1"),
      "tools/call",
      { name: "get_check", arguments: { teamId, checkId } },
      "get_check"
    );

    const result = toolResult<Record<string, unknown>>(await json(response));
    expect(result).toMatchObject({ id: checkId, status: "up" });
    expect(result).not.toHaveProperty("config");
    expect(JSON.stringify(result)).not.toContain("Authorization");
    expect(JSON.stringify(result)).not.toContain("private.example");
  });

  it("bounds incident updates in list and detail output", async () => {
    const incident = incidentSummary("investigating", 120);
    const list = vi.fn(async () => [incident]);
    const get = vi.fn(async () => incident);
    const handler = createHandler({
      incidents: { ...emptyServices().incidents, list, get },
    });
    const listed = await send(
      handler,
      auth("user-1"),
      "tools/call",
      { name: "list_incidents", arguments: { teamId } },
      "list_incidents"
    );
    const detailed = await send(
      handler,
      auth("user-1"),
      "tools/call",
      { name: "get_incident", arguments: { teamId, incidentId, updateLimit: 3 } },
      "get_incident"
    );

    const listResult = toolResult<{
      items: Array<{ updateCount: number; latestUpdate: unknown; updates?: unknown[] }>;
    }>(await json(listed));
    expect(listResult.items[0]).toMatchObject({ updateCount: 120 });
    expect(listResult.items[0]!.latestUpdate).toBeDefined();
    expect(listResult.items[0]).not.toHaveProperty("updates");
    const detailResult = toolResult<{ updates: unknown[]; updatesTruncated: boolean }>(
      await json(detailed)
    );
    expect(detailResult).toMatchObject({
      updates: expect.any(Array),
      updatesTruncated: true,
    });
    expect(detailResult.updates).toHaveLength(3);
  });

  it("binds analytics and objectives to the authenticated user", async () => {
    const overview = vi.fn(async (): Promise<OverviewAnalytics> => overviewAnalytics(120));
    const report = vi.fn(async (): Promise<AnalyticsReport> => availabilityReport());
    const list = vi.fn(
      async (): Promise<ServiceLevelObjectiveSummary[]> => [objective("First"), objective("Second")]
    );
    const handler = createHandler({
      analytics: { overview, report },
      objectives: { list },
    });

    const overviewResponse = await send(
      handler,
      auth("analyst"),
      "tools/call",
      { name: "get_team_overview", arguments: { teamId } },
      "get_team_overview"
    );
    const reportResponse = await send(
      handler,
      auth("analyst"),
      "tools/call",
      {
        name: "get_availability_report",
        arguments: {
          teamId,
          resourceId,
          from: "2026-08-01T00:00:00.000Z",
          to: "2026-08-28T00:00:00.000Z",
        },
      },
      "get_availability_report"
    );
    const objectivesResponse = await send(
      handler,
      auth("analyst"),
      "tools/call",
      { name: "list_service_objectives", arguments: { teamId, offset: 1, limit: 1 } },
      "list_service_objectives"
    );

    expect(overview).toHaveBeenCalledWith("analyst", teamId);
    const overviewResult = toolResult<{
      incidents: Array<{ updateCount: number; updates?: unknown[] }>;
    }>(await json(overviewResponse));
    expect(overviewResult.incidents[0]).toMatchObject({ updateCount: 120 });
    expect(overviewResult.incidents[0]).not.toHaveProperty("updates");
    expect(report).toHaveBeenCalledWith("analyst", teamId, {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-28T00:00:00.000Z",
      resourceId,
      checkId: undefined,
    });
    expect(toolResult<AnalyticsReport>(await json(reportResponse))).toMatchObject({
      availabilityPercent: 99.9,
    });
    expect(list).toHaveBeenCalledWith("analyst", teamId);
    expect(
      toolResult<{ items: ServiceLevelObjectiveSummary[] }>(await json(objectivesResponse)).items
    ).toEqual([expect.objectContaining({ name: "Second" })]);
  });

  it("rejects ambiguous analytics filters before calling the domain service", async () => {
    const report = vi.fn(async (): Promise<AnalyticsReport> => availabilityReport());
    const handler = createHandler({
      analytics: { ...emptyServices().analytics, report },
    });
    const response = await send(
      handler,
      auth("analyst"),
      "tools/call",
      {
        name: "get_availability_report",
        arguments: { teamId, resourceId, checkId },
      },
      "get_availability_report"
    );

    expect((await json(response)).result!.isError).toBe(true);
    expect(report).not.toHaveBeenCalled();
  });

  it("returns domain authorization failures as tool errors", async () => {
    const get = vi.fn(async () => {
      throw new ForbiddenException("You do not have access to this team");
    });
    const handler = createHandler({ resources: { ...emptyServices().resources, get } });
    const response = await send(
      handler,
      auth("user-1"),
      "tools/call",
      { name: "get_resource", arguments: { teamId, resourceId } },
      "get_resource"
    );

    const body = await json(response);
    expect(body.result!.isError).toBe(true);
    expect(body.result!.content![0]!.text).toBe("You do not have access to this team");
  });

  it("keeps concurrent caller identities isolated", async () => {
    const list = vi.fn(async (userId: string): Promise<TeamSummary[]> => {
      if (userId === "user-a") await new Promise((resolve) => setTimeout(resolve, 10));
      return [{ id: teamId, name: userId, role: "viewer", createdAt: "2026-01-01" }];
    });
    const handler = createHandler({ teams: { list } });

    const [first, second] = await Promise.all([
      send(
        handler,
        auth("user-a"),
        "tools/call",
        { name: "list_teams", arguments: {} },
        "list_teams"
      ),
      send(
        handler,
        auth("user-b"),
        "tools/call",
        { name: "list_teams", arguments: {} },
        "list_teams"
      ),
    ]);

    expect(toolResult<{ items: TeamSummary[] }>(await json(first)).items[0]!.name).toBe("user-a");
    expect(toolResult<{ items: TeamSummary[] }>(await json(second)).items[0]!.name).toBe("user-b");
  });

  it("requires write scope before invoking a mutation", async () => {
    const update = vi.fn(async () => resource("Renamed", teamId));
    const handler = createHandler({ resources: { ...emptyServices().resources, update } });
    const params = {
      name: "update_resource",
      arguments: { teamId, resourceId, name: "Renamed" },
    };

    const denied = await send(handler, auth("user-1"), "tools/call", params, "update_resource");
    expect((await json(denied)).result!.content![0]!.text).toContain("mcp:write");
    expect(update).not.toHaveBeenCalled();

    const allowed = await send(
      handler,
      auth("user-1", ["mcp:read", "mcp:write"]),
      "tools/call",
      params,
      "update_resource"
    );
    expect(update).toHaveBeenCalledWith("user-1", teamId, resourceId, {
      name: "Renamed",
      kind: undefined,
      description: undefined,
      tags: undefined,
    });
    expect(toolResult<{ name: string }>(await json(allowed)).name).toBe("Renamed");
  });

  it("preserves domain role boundaries for write-scoped tokens", async () => {
    const update = vi.fn(async () => {
      throw new ForbiddenException("You do not have access to this team");
    });
    const handler = createHandler({ resources: { ...emptyServices().resources, update } });
    const response = await send(
      handler,
      auth("viewer", ["mcp:read", "mcp:write"]),
      "tools/call",
      { name: "update_resource", arguments: { teamId, resourceId, tags: ["edge"] } },
      "update_resource"
    );

    expect((await json(response)).result!.content![0]!.text).toBe(
      "You do not have access to this team"
    );
    expect(update).toHaveBeenCalledWith("viewer", teamId, resourceId, expect.any(Object));
  });

  it("creates and updates incidents through the authenticated user's domain service", async () => {
    const create = vi.fn(
      async (_userId: string, _teamId: string): Promise<IncidentSummary> =>
        incidentSummary("investigating")
    );
    const addUpdate = vi.fn(
      async (_userId: string, _teamId: string): Promise<IncidentSummary> =>
        incidentSummary("resolved")
    );
    const handler = createHandler({
      incidents: { ...emptyServices().incidents, create, addUpdate },
    });

    const created = await send(
      handler,
      auth("operator", ["mcp:read", "mcp:write"]),
      "tools/call",
      {
        name: "create_incident",
        arguments: {
          teamId,
          title: " Database unavailable ",
          impact: "major",
          resourceIds: [resourceId],
          message: " Investigating ",
          status: "investigating",
        },
      },
      "create_incident"
    );
    expect(toolResult<{ status: string }>(await json(created)).status).toBe("investigating");
    expect(create).toHaveBeenCalledWith("operator", teamId, {
      title: "Database unavailable",
      impact: "major",
      resourceIds: [resourceId],
      message: "Investigating",
      status: "investigating",
    });

    const updated = await send(
      handler,
      auth("operator", ["mcp:read", "mcp:write"]),
      "tools/call",
      {
        name: "add_incident_update",
        arguments: { teamId, incidentId, status: "resolved", message: "" },
      },
      "add_incident_update"
    );
    expect(toolResult<{ status: string }>(await json(updated)).status).toBe("resolved");
    expect(addUpdate).toHaveBeenCalledWith("operator", teamId, incidentId, {
      status: "resolved",
      message: "",
    });
  });

  it("validates mutation inputs before calling domain services", async () => {
    const create = vi.fn();
    const handler = createHandler({ incidents: { ...emptyServices().incidents, create } });
    const response = await send(
      handler,
      auth("user-1", ["mcp:read", "mcp:write"]),
      "tools/call",
      {
        name: "create_incident",
        arguments: {
          teamId,
          title: "Database unavailable",
          impact: "major",
          resourceIds: [],
          message: "Investigating",
        },
      },
      "create_incident"
    );

    expect((await json(response)).result!.isError).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects unknown tool arguments and invalid history ranges", async () => {
    const history = vi.fn(async () => []);
    const handler = createHandler({ checks: { ...emptyServices().checks, history } });
    const unknown = await send(
      handler,
      auth("user-1"),
      "tools/call",
      { name: "get_resource", arguments: { teamId, resourceId, userId: "someone-else" } },
      "get_resource"
    );
    const range = await send(
      handler,
      auth("user-1"),
      "tools/call",
      {
        name: "get_check_history",
        arguments: {
          teamId,
          checkId,
          from: "2026-08-29T00:00:00.000Z",
          to: "2026-08-28T00:00:00.000Z",
        },
      },
      "get_check_history"
    );

    expect((await json(unknown)).result!.isError).toBe(true);
    expect((await json(range)).result!.isError).toBe(true);
    expect(history).not.toHaveBeenCalled();
  });

  it("rejects routing headers that disagree with the request body", async () => {
    const list = vi.fn(async () => []);
    const handler = createHandler({ teams: { list } });
    const response = await send(
      handler,
      auth("user-1"),
      "tools/call",
      { name: "list_teams", arguments: {} },
      "get_resource"
    );

    expect(response.status).toBe(400);
    expect((await json(response)).error!.code).toBe(-32_020);
    expect(list).not.toHaveBeenCalled();
  });

  it("rejects legacy initialize traffic", async () => {
    const handler = createHandler();
    const request = new Request("https://mimorii.example/api/mcp", {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "legacy-client", version: "1.0.0" },
        },
      }),
    });

    const response = await handler.fetch(request, { authInfo: auth("user-1") });
    expect(response.status).toBe(400);
    expect((await json(response)).error).toBeDefined();
  });
});

function createHandler(overrides: Partial<McpToolServices> = {}): McpHttpHandler {
  const defaults = emptyServices();
  const services: McpToolServices = {
    teams: overrides.teams ?? defaults.teams,
    resources: overrides.resources ?? defaults.resources,
    checks: overrides.checks ?? defaults.checks,
    incidents: overrides.incidents ?? defaults.incidents,
    maintenance: overrides.maintenance ?? defaults.maintenance,
    heartbeats: overrides.heartbeats ?? defaults.heartbeats,
    analytics: overrides.analytics ?? defaults.analytics,
    objectives: overrides.objectives ?? defaults.objectives,
  };
  const handler = createMimoriiMcpHandler(services);
  handlers.push(handler);
  return handler;
}

function emptyServices(): McpToolServices {
  const unavailable = vi.fn(async () => {
    throw new Error("Service method was not configured");
  });
  return {
    teams: { list: vi.fn(async () => []) },
    resources: { list: vi.fn(async () => []), get: unavailable, update: unavailable },
    checks: { list: vi.fn(async () => []), get: unavailable, history: vi.fn(async () => []) },
    incidents: {
      list: vi.fn(async () => []),
      get: unavailable,
      create: unavailable,
      addUpdate: unavailable,
    },
    maintenance: { list: vi.fn(async () => []), get: unavailable },
    heartbeats: {
      list: vi.fn(async () => []),
      get: unavailable,
      history: vi.fn(async () => []),
    },
    analytics: { overview: unavailable, report: unavailable },
    objectives: { list: vi.fn(async () => []) },
  };
}

function auth(userId: string, scopes = ["mcp:read"]): AuthInfo {
  return {
    token: `token-${userId}`,
    clientId: `client-${userId}`,
    scopes,
    resource: new URL("https://mimorii.example/api/mcp"),
    extra: { userId },
  };
}

function send(
  handler: McpHttpHandler,
  authInfo: AuthInfo,
  method: string,
  params: Record<string, unknown>,
  name?: string
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "MCP-Protocol-Version": protocolVersion,
    "Mcp-Method": method,
  };
  if (name) headers["Mcp-Name"] = name;
  const request = new Request("https://mimorii.example/api/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": protocolVersion,
          "io.modelcontextprotocol/clientInfo": { name: "test-client", version: "1.0.0" },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  });
  return handler.fetch(request, { authInfo });
}

interface TestResponseBody {
  result?: {
    tools?: Array<{ name: string; annotations: Record<string, boolean> }>;
    content?: Array<{ text: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
    ttlMs?: number;
    cacheScope?: "public" | "private";
  };
  error?: { code: number };
}

async function json(response: Response): Promise<TestResponseBody> {
  return (await response.json()) as TestResponseBody;
}

function toolResult<T>(body: TestResponseBody): T {
  return JSON.parse(body.result!.content![0]!.text) as T;
}

function resource(name: string, requestedTeamId: string, index = 0): ResourceSummary {
  return {
    id: `${String(index + 1).padStart(8, "0")}-0000-4000-8000-000000000000`,
    teamId: requestedTeamId,
    name,
    kind: "service",
    description: null,
    tags: [],
    agent: null,
    status: "up",
    checksPassing: 1,
    checksTotal: 1,
    lastCheckedAt: "2026-01-01T00:00:00.000Z",
    inMaintenance: false,
    imageUpdatedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function checkSummary(): CheckSummary {
  return {
    id: checkId,
    teamId,
    resourceId,
    name: "Private endpoint",
    type: "http",
    status: "up",
    enabled: true,
    intervalSeconds: 60,
    timeoutMs: 5_000,
    failureThreshold: 2,
    recoveryThreshold: 1,
    config: {
      target: {
        url: "https://private.example",
        method: "GET",
        headers: { Authorization: "secret" },
      },
      expectedStatuses: [200],
      followRedirects: false,
      validateTls: true,
    },
    execution: { kind: "direct" },
    secretConfigured: false,
    consecutiveFailures: 0,
    lastCheckedAt: "2026-01-01T00:00:00.000Z",
    nextCheckAt: "2026-01-01T00:01:00.000Z",
    lastLatencyMs: 20,
    latestMetrics: {},
    passing24h: 100,
    passing30d: 100,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function incidentSummary(status: "investigating" | "resolved", updateCount = 0): IncidentSummary {
  return {
    id: incidentId,
    teamId,
    source: "manual",
    checkId: null,
    heartbeatId: null,
    title: "Database unavailable",
    impact: "major",
    status,
    startedAt: "2026-08-28T00:00:00.000Z",
    acknowledgedAt: status === "resolved" ? "2026-08-28T00:05:00.000Z" : null,
    resolvedAt: status === "resolved" ? "2026-08-28T00:10:00.000Z" : null,
    durationSeconds: status === "resolved" ? 600 : 0,
    resources: [{ id: resourceId, name: "Database" }],
    updates: Array.from({ length: updateCount }, (_, index) => ({
      id: `update-${index}`,
      incidentId,
      status,
      message: `Update ${index}`,
      createdByName: "Operator",
      createdAt: new Date(Date.UTC(2026, 7, 28, 0, index)).toISOString(),
    })),
  };
}

function overviewAnalytics(updateCount: number): OverviewAnalytics {
  return {
    resources: 2,
    checks: 3,
    heartbeats: 1,
    passing: 3,
    warning: 0,
    critical: 0,
    down: 1,
    pending: 0,
    paused: 0,
    uptime24h: 99.9,
    uptime30d: 99.8,
    averageLatencyMs: 42,
    openIncidents: 1,
    activeMaintenance: 0,
    breachedObjectives: 1,
    statusTimeline: [],
    latencyTimeline: [],
    incidents: [incidentSummary("investigating", updateCount)],
  };
}

function availabilityReport(): AnalyticsReport {
  return {
    from: "2026-08-01T00:00:00.000Z",
    to: "2026-08-28T00:00:00.000Z",
    totalResults: 100,
    availabilityPercent: 99.9,
    degradedPercent: 0.1,
    latencyP50Ms: 30,
    latencyP95Ms: 50,
    latencyP99Ms: 75,
    meanTimeToRecoverySeconds: 600,
    meanTimeBetweenFailuresSeconds: 86_400,
    incidentCount: 1,
    daily: [],
  };
}

function objective(name: string): ServiceLevelObjectiveSummary {
  return {
    id: `${name === "First" ? "5" : "6"}5555555-5555-4555-8555-555555555555`,
    teamId,
    resourceId,
    resourceName: "Database",
    checkId,
    checkName: "Availability",
    name,
    targetPercent: 99.9,
    windowDays: 30,
    latencyTargetMs: 100,
    availabilityPercent: 99.95,
    latencyP95Ms: 50,
    errorBudgetMinutes: 43.2,
    consumedBudgetMinutes: 21,
    remainingBudgetMinutes: 22.2,
    burnRate: 0.5,
    status: "met",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}
