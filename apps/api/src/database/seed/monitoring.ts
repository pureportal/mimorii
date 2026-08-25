import type { CheckConfig, CheckStatus, CheckType, ResourceKind } from "@mimorii/contracts";
import { at, days, hours, minutes, seedId, type SeedContext } from "./context.js";
import type { SeedIdentityIds } from "./identity.js";
import { seedMonitoringDemo } from "./monitoring-demo.js";
import { seedRelayTelemetry } from "./telemetry.js";

export interface SeedMonitoringIds {
  serverResourceId: string;
  serviceResourceId: string;
  endpointResourceId: string;
  pipelineResourceId: string;
  pendingResourceId: string;
  pausedResourceId: string;
  httpCheckId: string;
  tcpCheckId: string;
  dnsCheckId: string;
  hostCheckId: string;
  storageCheckId: string;
  pendingCheckId: string;
  pausedCheckId: string;
  dnsOpeningResultId: string;
  hostOpeningResultId: string;
  hostClosingResultId: string;
  backupHeartbeatId: string;
  missedHeartbeatId: string;
  runningHeartbeatId: string;
  pendingHeartbeatId: string;
  pausedHeartbeatId: string;
}

interface CheckSeed {
  id: string;
  resourceId: string;
  name: string;
  type: CheckType;
  config: CheckConfig;
  agentId: string | null;
  intervalSeconds: number;
  timeoutMs: number;
  failureThreshold: number;
  recoveryThreshold: number;
  enabled: number;
  status: CheckStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastLatencyMs: number | null;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
}

export async function seedMonitoring(
  context: SeedContext,
  identity: SeedIdentityIds
): Promise<SeedMonitoringIds> {
  const ids = monitoringIds(context, identity);
  await seedResources(context, identity, ids);
  await seedChecks(context, identity, ids);
  await seedResults(context, ids);
  await seedMonitoringDemo(context, identity);
  await seedRelayTelemetry(context, identity, ids);
  return ids;
}

function monitoringIds(context: SeedContext, identity: SeedIdentityIds): SeedMonitoringIds {
  return {
    serverResourceId: context.agentId,
    serviceResourceId: seedId(context, "resource:service"),
    endpointResourceId: seedId(context, "resource:endpoint"),
    pipelineResourceId: seedId(context, "resource:pipeline"),
    pendingResourceId: seedId(context, "resource:pending"),
    pausedResourceId: identity.newAgentId,
    httpCheckId: seedId(context, "check:http"),
    tcpCheckId: seedId(context, "check:tcp"),
    dnsCheckId: seedId(context, "check:dns"),
    hostCheckId: seedId(context, "check:host"),
    storageCheckId: seedId(context, "check:storage"),
    pendingCheckId: seedId(context, "check:pending"),
    pausedCheckId: seedId(context, "check:paused"),
    dnsOpeningResultId: seedId(context, "result:dns:9"),
    hostOpeningResultId: seedId(context, "result:host:5"),
    hostClosingResultId: seedId(context, "result:host:6"),
    backupHeartbeatId: seedId(context, "heartbeat:backup"),
    missedHeartbeatId: seedId(context, "heartbeat:missed"),
    runningHeartbeatId: seedId(context, "heartbeat:running"),
    pendingHeartbeatId: seedId(context, "heartbeat:pending"),
    pausedHeartbeatId: seedId(context, "heartbeat:paused"),
  };
}

async function seedResources(
  context: SeedContext,
  identity: SeedIdentityIds,
  ids: SeedMonitoringIds
): Promise<void> {
  const resources: Array<{
    id: string;
    name: string;
    kind: ResourceKind;
    description: string;
    tags: string[];
  }> = [
    {
      id: ids.serverResourceId,
      name: "Application server",
      kind: "host",
      description: "Primary application host",
      tags: ["production", "core", "linux"],
    },
    {
      id: ids.serviceResourceId,
      name: "Payments database",
      kind: "service",
      description: "PostgreSQL service used by payments",
      tags: ["production", "payments", "database"],
    },
    {
      id: ids.endpointResourceId,
      name: "Customer API",
      kind: "service",
      description: "Public customer API health endpoint",
      tags: ["production", "public", "api"],
    },
    {
      id: ids.pipelineResourceId,
      name: "Data pipeline",
      kind: "service",
      description: "Scheduled imports, exports, and backups",
      tags: ["production", "data", "jobs"],
    },
    {
      id: ids.pendingResourceId,
      name: "Preview API",
      kind: "service",
      description: "New endpoint awaiting its first observation",
      tags: ["staging", "api"],
    },
    {
      id: ids.pausedResourceId,
      name: "Archive server",
      kind: "host",
      description: "Cold storage host with monitoring paused",
      tags: ["archive", "internal"],
    },
  ];
  for (const [index, resource] of resources.entries()) {
    await context.database.run(
      `INSERT INTO resources
       (id, team_id, name, kind, description, tags_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind,
       description = excluded.description, tags_json = excluded.tags_json,
       updated_at = excluded.updated_at`,
      resource.id,
      context.teamId,
      resource.name,
      resource.kind,
      resource.description,
      JSON.stringify(resource.tags),
      at(context, -days(100 - index * 8)),
      context.now.toISOString()
    );
  }
}

async function seedChecks(
  context: SeedContext,
  identity: SeedIdentityIds,
  ids: SeedMonitoringIds
): Promise<void> {
  const hostConfig = {
    cpuWarningPercent: 80,
    cpuCriticalPercent: 95,
    memoryWarningPercent: 85,
    memoryCriticalPercent: 95,
    loadWarning: 4,
    loadCritical: 8,
    swapWarningPercent: 70,
    swapCriticalPercent: 90,
  };
  const checks: CheckSeed[] = [
    {
      id: ids.httpCheckId,
      resourceId: ids.endpointResourceId,
      name: "API response",
      type: "http",
      agentId: null,
      config: {
        target: { url: "https://example.com/", method: "GET" },
        expectedStatuses: [200],
        responseContains: "Example Domain",
        expectedHeaders: { "content-type": "text/html" },
        latencyWarningMs: 1_000,
        certificateWarningDays: 30,
        followRedirects: true,
        validateTls: true,
      },
      intervalSeconds: 60,
      timeoutMs: 5_000,
      failureThreshold: 2,
      recoveryThreshold: 2,
      enabled: 1,
      status: "up",
      consecutiveFailures: 0,
      consecutiveSuccesses: 8,
      lastLatencyMs: 118,
      lastCheckedAt: at(context, -minutes(2)),
      nextCheckAt: at(context, minutes(10)),
    },
    {
      id: ids.tcpCheckId,
      resourceId: ids.serviceResourceId,
      name: "PostgreSQL port",
      type: "tcp",
      agentId: identity.staleAgentId,
      config: { target: { host: "postgres.internal", port: 5432 } },
      intervalSeconds: 60,
      timeoutMs: 3_000,
      failureThreshold: 3,
      recoveryThreshold: 2,
      enabled: 1,
      status: "degraded",
      consecutiveFailures: 0,
      consecutiveSuccesses: 1,
      lastLatencyMs: 245,
      lastCheckedAt: at(context, -minutes(3)),
      nextCheckAt: at(context, minutes(12)),
    },
    {
      id: ids.dnsCheckId,
      resourceId: ids.endpointResourceId,
      name: "Public DNS",
      type: "dns",
      agentId: null,
      config: { target: { hostname: "example.com" }, recordType: "A" },
      intervalSeconds: 120,
      timeoutMs: 4_000,
      failureThreshold: 2,
      recoveryThreshold: 1,
      enabled: 1,
      status: "down",
      consecutiveFailures: 2,
      consecutiveSuccesses: 0,
      lastLatencyMs: null,
      lastCheckedAt: at(context, -minutes(4)),
      nextCheckAt: at(context, minutes(15)),
    },
    {
      id: ids.hostCheckId,
      resourceId: ids.serverResourceId,
      name: "Host resources",
      type: "host",
      agentId: context.agentId,
      config: hostConfig,
      intervalSeconds: 30,
      timeoutMs: 5_000,
      failureThreshold: 2,
      recoveryThreshold: 2,
      enabled: 1,
      status: "up",
      consecutiveFailures: 0,
      consecutiveSuccesses: 6,
      lastLatencyMs: null,
      lastCheckedAt: at(context, -minutes(1)),
      nextCheckAt: at(context, minutes(8)),
    },
    {
      id: ids.storageCheckId,
      resourceId: ids.serverResourceId,
      name: "Disk usage",
      type: "disk",
      agentId: context.agentId,
      config: { mount: "/", warningPercent: 80, criticalPercent: 95 },
      intervalSeconds: 300,
      timeoutMs: 5_000,
      failureThreshold: 2,
      recoveryThreshold: 1,
      enabled: 1,
      status: "up",
      consecutiveFailures: 0,
      consecutiveSuccesses: 4,
      lastLatencyMs: null,
      lastCheckedAt: at(context, -minutes(5)),
      nextCheckAt: at(context, days(1)),
    },
    {
      id: ids.pendingCheckId,
      resourceId: ids.pendingResourceId,
      name: "Preview health",
      type: "http",
      agentId: null,
      config: {
        target: { url: "https://preview.example.com/health", method: "GET" },
        expectedStatuses: [200],
        responseContains: "ready",
        expectedHeaders: { "content-type": "application/json" },
        jsonAssertions: {
          kind: "group",
          operator: "and",
          conditions: [
            {
              kind: "assertion",
              name: "Service status",
              pointer: "/service/status",
              operator: "equals",
              expectedValue: "ready",
            },
          ],
        },
        latencyWarningMs: 1_000,
        certificateWarningDays: 30,
        followRedirects: false,
        validateTls: true,
      },
      intervalSeconds: 300,
      timeoutMs: 5_000,
      failureThreshold: 2,
      recoveryThreshold: 1,
      enabled: 1,
      status: "pending",
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastLatencyMs: null,
      lastCheckedAt: null,
      nextCheckAt: at(context, days(1)),
    },
    {
      id: ids.pausedCheckId,
      resourceId: ids.pausedResourceId,
      name: "Archive host health",
      type: "host",
      agentId: identity.newAgentId,
      config: {
        ...hostConfig,
      },
      intervalSeconds: 600,
      timeoutMs: 5_000,
      failureThreshold: 2,
      recoveryThreshold: 1,
      enabled: 0,
      status: "paused",
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastLatencyMs: null,
      lastCheckedAt: at(context, -days(14)),
      nextCheckAt: null,
    },
  ];
  for (const [index, check] of checks.entries()) {
    await context.database.run(
      `INSERT INTO checks
       (id, team_id, resource_id, agent_id, name, type, config_json, interval_seconds, timeout_ms,
        failure_threshold, recovery_threshold, enabled, current_status, consecutive_failures,
        consecutive_successes, last_latency_ms, last_checked_at, next_check_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET resource_id = excluded.resource_id, name = excluded.name,
       agent_id = excluded.agent_id, type = excluded.type, config_json = excluded.config_json,
       interval_seconds = excluded.interval_seconds, timeout_ms = excluded.timeout_ms,
       failure_threshold = excluded.failure_threshold, recovery_threshold = excluded.recovery_threshold,
       enabled = excluded.enabled, current_status = excluded.current_status,
       consecutive_failures = excluded.consecutive_failures,
       consecutive_successes = excluded.consecutive_successes,
       last_latency_ms = excluded.last_latency_ms, last_checked_at = excluded.last_checked_at,
       next_check_at = excluded.next_check_at, updated_at = excluded.updated_at`,
      check.id,
      context.teamId,
      check.resourceId,
      check.agentId,
      check.name,
      check.type,
      JSON.stringify(check.config),
      check.intervalSeconds,
      check.timeoutMs,
      check.failureThreshold,
      check.recoveryThreshold,
      check.enabled,
      check.status,
      check.consecutiveFailures,
      check.consecutiveSuccesses,
      check.lastLatencyMs,
      check.lastCheckedAt,
      check.nextCheckAt,
      at(context, -days(90 - index * 5)),
      context.now.toISOString()
    );
  }
}

async function seedResults(context: SeedContext, ids: SeedMonitoringIds): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    await upsertResult(context, {
      id: seedId(context, `result:http:${index}`),
      checkId: ids.httpCheckId,
      status: index === 7 ? "degraded" : "up",
      latencyMs: index === 7 ? 1_220 : 90 + index * 2,
      statusCode: 200,
      message: index === 7 ? "Response latency exceeded the warning threshold" : null,
      metrics: { responseBytes: 1_256, server: "nginx/1.26", poweredBy: "Express 5" },
      checkedAt: at(context, -hours((19 - index) * 6) - minutes(2)),
    });
  }
  for (let index = 0; index < 10; index += 1) {
    await upsertResult(context, {
      id: seedId(context, `result:tcp:${index}`),
      checkId: ids.tcpCheckId,
      status: index === 3 ? "down" : index === 9 ? "degraded" : "up",
      latencyMs: index === 3 ? null : index === 9 ? 245 : 35 + index,
      statusCode: null,
      message:
        index === 3 ? "Connection failed" : index === 9 ? "Connection is near the timeout" : null,
      metrics: { port: 5432 },
      checkedAt: at(context, -hours((9 - index) * 8) - minutes(3)),
    });
  }
  for (let index = 0; index < 10; index += 1) {
    const down = index >= 8;
    await upsertResult(context, {
      id: seedId(context, `result:dns:${index}`),
      checkId: ids.dnsCheckId,
      status: down ? "down" : "up",
      latencyMs: down ? null : 18 + index,
      statusCode: null,
      message: down ? "Target could not be resolved" : null,
      metrics: down ? {} : { recordCount: 2 },
      checkedAt: at(context, -hours((9 - index) * 4) - minutes(4)),
    });
  }
  for (let index = 0; index < 12; index += 1) {
    const down = index === 5;
    await upsertResult(context, {
      id: seedId(context, `result:host:${index}`),
      checkId: ids.hostCheckId,
      status: down ? "down" : index === 4 ? "degraded" : "up",
      latencyMs: null,
      statusCode: null,
      message: down
        ? "A host resource critical threshold was reached"
        : index === 4
          ? "A host resource warning threshold was reached"
          : null,
      metrics: {
        cpuPercent: down ? 98 : index === 4 ? 84 : 24 + index,
        memoryPercent: 62,
        loadAverage: down ? 9.2 : 1.4,
        swapPercent: 4,
        processCount: 86,
      },
      checkedAt: at(context, -hours((11 - index) * 10) - minutes(1)),
    });
  }
  for (let index = 0; index < 6; index += 1) {
    await upsertResult(context, {
      id: seedId(context, `result:storage:${index}`),
      checkId: ids.storageCheckId,
      status: index === 2 ? "degraded" : "up",
      latencyMs: null,
      statusCode: null,
      message: index === 2 ? "Disk usage warning threshold was reached" : null,
      metrics: {
        mount: "/",
        usedPercent: index === 2 ? 82 : 68 + index,
        usedBytes: 730_000_000_000,
        totalBytes: 1_000_000_000_000,
      },
      checkedAt: at(context, -hours((5 - index) * 12) - minutes(5)),
    });
  }
}

async function upsertResult(
  context: SeedContext,
  result: {
    id: string;
    checkId: string;
    status: "up" | "degraded" | "down";
    latencyMs: number | null;
    statusCode: number | null;
    message: string | null;
    metrics: Record<string, number | string | boolean | null>;
    checkedAt: string;
  }
): Promise<void> {
  await context.database.run(
    `INSERT INTO check_results
     (id, check_id, status, latency_ms, status_code, message, metrics_json, checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, latency_ms = excluded.latency_ms,
     status_code = excluded.status_code, message = excluded.message,
     metrics_json = excluded.metrics_json, checked_at = excluded.checked_at`,
    result.id,
    result.checkId,
    result.status,
    result.latencyMs,
    result.statusCode,
    result.message,
    JSON.stringify(result.metrics),
    result.checkedAt
  );
}
