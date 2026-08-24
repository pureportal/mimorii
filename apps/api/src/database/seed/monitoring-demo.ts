import type {
  CheckType,
  DatabaseCheckConfig,
  DnsCheckConfig,
  DockerCheckConfig,
  HostCheckConfig,
  HttpCheckConfig,
  HttpJsonAssertionGroup,
  IcmpCheckConfig,
  ResourceKind,
  TcpCheckConfig,
  WanCheckConfig,
} from "@mimorii/contracts";
import { at, days, hours, minutes, seedId, type SeedContext } from "./context.js";
import type { SeedIdentityIds } from "./identity.js";

type ResultStatus = "up" | "degraded" | "down";

interface DemoResourceSeed {
  key: string;
  name: string;
  kind: ResourceKind;
  description: string;
  tags: string[];
  agentId: string | null;
}

interface DemoCheckSeedBase {
  key: string;
  resourceKey: string;
  name: string;
  history?: readonly ResultStatus[];
  intervalSeconds?: number;
  timeoutMs?: number;
  failureThreshold?: number;
  recoveryThreshold?: number;
  degradedMessage?: string;
  downMessage?: string;
  downStatusCode?: number;
}

type DemoCheckSeed =
  | (DemoCheckSeedBase & { type: "http"; config: HttpCheckConfig })
  | (DemoCheckSeedBase & { type: "tcp"; config: TcpCheckConfig })
  | (DemoCheckSeedBase & { type: "dns"; config: DnsCheckConfig })
  | (DemoCheckSeedBase & { type: "host"; config: HostCheckConfig })
  | (DemoCheckSeedBase & { type: "icmp"; config: IcmpCheckConfig })
  | (DemoCheckSeedBase & { type: "wan"; config: WanCheckConfig })
  | (DemoCheckSeedBase & { type: "docker"; config: DockerCheckConfig })
  | (DemoCheckSeedBase & { type: "database"; config: DatabaseCheckConfig });

const recoveredHistory = ["up", "up", "down", "down", "up", "up", "up", "up"] as const;
const warningHistory = ["up", "up", "up", "degraded", "up", "up", "up", "degraded"] as const;
const failingHistory = ["up", "up", "degraded", "down", "down", "down", "down", "down"] as const;

function hostConfig(
  mount: string,
  warningPercent: number,
  criticalPercent: number
): HostCheckConfig {
  return {
    cpuWarningPercent: 80,
    cpuCriticalPercent: 95,
    memoryWarningPercent: 85,
    memoryCriticalPercent: 95,
    loadWarning: 4,
    loadCritical: 8,
    swapWarningPercent: 70,
    swapCriticalPercent: 90,
    storage: [{ mount, warningPercent, criticalPercent }],
  };
}

export async function seedMonitoringDemo(
  context: SeedContext,
  identity: SeedIdentityIds
): Promise<void> {
  const resources = demoResources(context, identity);
  const checks = demoChecks();
  await seedResources(context, resources);
  await seedChecks(context, identity, resources, checks);
  await seedResults(context, checks);
}

function demoResources(context: SeedContext, identity: SeedIdentityIds): DemoResourceSeed[] {
  return [
    {
      key: "public-web",
      name: "Public website",
      kind: "service",
      description: "Customer-facing website and edge connectivity",
      tags: ["production", "public", "web"],
      agentId: null,
    },
    {
      key: "public-status",
      name: "Public service status",
      kind: "service",
      description: "Public status API consumed by clients and integrations",
      tags: ["production", "public", "status"],
      agentId: null,
    },
    {
      key: "internal-api",
      name: "Internal application API",
      kind: "service",
      description: "Private application API monitored from the local relay",
      tags: ["production", "private", "api"],
      agentId: context.agentId,
    },
    {
      key: "cache",
      name: "Cache cluster",
      kind: "service",
      description: "Redis cache and its metrics exporter",
      tags: ["production", "private", "cache"],
      agentId: context.agentId,
    },
    {
      key: "edge-gateway",
      name: "Branch gateway",
      kind: "service",
      description: "Branch network gateway observed through its relay",
      tags: ["branch", "private", "network"],
      agentId: identity.staleAgentId,
    },
  ];
}

function demoChecks(): DemoCheckSeed[] {
  return [
    {
      key: "website-availability",
      resourceKey: "public-web",
      name: "Website availability",
      type: "http",
      config: {
        target: { url: "https://example.com/", method: "GET" },
        expectedStatuses: [200],
        followRedirects: true,
        validateTls: true,
      },
    },
    {
      key: "website-head",
      resourceKey: "public-web",
      name: "Website headers and TLS",
      type: "http",
      config: {
        target: { url: "https://example.com/", method: "HEAD" },
        expectedStatuses: [200, 301, 302],
        expectedHeaders: { "content-type": "text/html" },
        certificateWarningDays: 21,
        latencyWarningMs: 800,
        followRedirects: true,
        validateTls: true,
      },
      history: warningHistory,
      degradedMessage: "Response latency exceeded the warning threshold",
    },
    {
      key: "website-https-port",
      resourceKey: "public-web",
      name: "Public HTTPS port",
      type: "tcp",
      config: { target: { host: "example.com", port: 443 } },
      history: recoveredHistory,
      downMessage: "Connection failed",
    },
    {
      key: "website-dns",
      resourceKey: "public-web",
      name: "Website DNS mapping",
      type: "dns",
      config: {
        target: { hostname: "example.com" },
        recordType: "A",
        expectedValue: "93.184.216.34",
      },
    },
    {
      key: "website-icmp",
      resourceKey: "public-web",
      name: "Website network reachability",
      type: "icmp",
      config: {
        target: { host: "example.com" },
        packetCount: 3,
        minimumSuccessPercent: 67,
        latencyWarningMs: 250,
      },
    },
    {
      key: "customer-health",
      resourceKey: "endpoint",
      name: "Customer API health",
      type: "http",
      config: {
        target: { url: "https://api.example.com/health", method: "GET" },
        expectedStatuses: [200],
        expectedHeaders: { "content-type": "application/json" },
        jsonAssertions: jsonEquals("Service status", "/status", "healthy"),
        latencyWarningMs: 750,
        certificateWarningDays: 30,
        followRedirects: false,
        validateTls: true,
      },
      history: recoveredHistory,
      downMessage: "JSON value did not match",
    },
    {
      key: "public-service-status",
      resourceKey: "public-status",
      name: "Public service status mapping",
      type: "http",
      config: {
        target: { url: "https://status.example.com/api/status", method: "GET" },
        expectedStatuses: [200],
        expectedHeaders: { "content-type": "application/json" },
        jsonAssertions: jsonEquals("Page status", "/page/status", "operational"),
        latencyWarningMs: 1_000,
        certificateWarningDays: 14,
        followRedirects: true,
        validateTls: true,
      },
      history: failingHistory,
      downMessage: "JSON value did not match",
    },
    {
      key: "public-status-endpoint",
      resourceKey: "public-status",
      name: "Status endpoint response",
      type: "http",
      config: {
        target: { url: "https://status.example.com/api/health", method: "GET" },
        expectedStatuses: [200, 204],
        responseContains: "ok",
        followRedirects: false,
        validateTls: true,
      },
      history: recoveredHistory,
      downMessage: "Unexpected HTTP status",
      downStatusCode: 503,
    },
    {
      key: "server-ssh",
      resourceKey: "server",
      name: "Application SSH port",
      type: "tcp",
      config: { target: { host: "app-01.internal", port: 22 } },
    },
    {
      key: "server-health",
      resourceKey: "server",
      name: "Application process health",
      type: "http",
      config: {
        target: { url: "http://app-01.internal:8080/health", method: "GET" },
        expectedStatuses: [200],
        expectedHeaders: { "content-type": "application/json" },
        jsonAssertions: jsonEquals("Process status", "/status", "ready"),
        latencyWarningMs: 500,
        followRedirects: false,
        validateTls: true,
      },
      history: warningHistory,
      degradedMessage: "Response latency exceeded the warning threshold",
    },
    {
      key: "server-var-storage",
      resourceKey: "server",
      name: "Application host health",
      type: "host",
      config: hostConfig("/var/lib", 75, 90),
      history: warningHistory,
      degradedMessage: "A host resource warning threshold was reached",
      intervalSeconds: 300,
    },
    {
      key: "server-wan",
      resourceKey: "server",
      name: "WAN reachability",
      type: "wan",
      config: {
        targets: [
          { name: "Primary DNS", host: "1.1.1.1" },
          { name: "Secondary DNS", host: "8.8.8.8" },
        ],
        requiredSuccessfulTargets: 1,
        packetCount: 3,
        latencyWarningMs: 150,
      },
    },
    {
      key: "server-docker",
      resourceKey: "server",
      name: "Docker containers",
      type: "docker",
      config: {
        requireHealthy: true,
        requireRunning: true,
        maximumRestarts: 3,
        cpuWarningPercent: 85,
        memoryWarningPercent: 85,
      },
    },
    {
      key: "database-replica-port",
      resourceKey: "service",
      name: "PostgreSQL replica port",
      type: "tcp",
      config: { target: { host: "postgres-replica.internal", port: 5432 } },
      history: recoveredHistory,
      downMessage: "Connection failed",
      failureThreshold: 3,
    },
    {
      key: "database-dns",
      resourceKey: "service",
      name: "Database service discovery",
      type: "dns",
      config: {
        target: { hostname: "_postgresql._tcp.database.internal" },
        recordType: "SRV",
        expectedValue: "postgres.internal",
      },
    },
    {
      key: "pipeline-health",
      resourceKey: "pipeline",
      name: "Pipeline health mapping",
      type: "http",
      config: {
        target: { url: "http://pipeline.internal:8080/health", method: "GET" },
        expectedStatuses: [200],
        jsonAssertions: jsonEquals("Jobs ready", "/jobs/ready", true),
        latencyWarningMs: 1_500,
        followRedirects: false,
        validateTls: true,
      },
      history: recoveredHistory,
      downMessage: "JSON value did not match",
    },
    {
      key: "pipeline-worker-port",
      resourceKey: "pipeline",
      name: "Pipeline worker port",
      type: "tcp",
      config: { target: { host: "pipeline.internal", port: 9090 } },
      history: failingHistory,
      downMessage: "Connection failed",
      failureThreshold: 3,
    },
    {
      key: "internal-availability",
      resourceKey: "internal-api",
      name: "Internal API availability",
      type: "http",
      config: {
        target: { url: "http://api.internal:8080/", method: "GET" },
        expectedStatuses: [200, 204],
        followRedirects: true,
        validateTls: true,
      },
    },
    {
      key: "internal-health",
      resourceKey: "internal-api",
      name: "Internal API health mapping",
      type: "http",
      config: {
        target: { url: "http://api.internal:8080/health", method: "GET" },
        expectedStatuses: [200],
        expectedHeaders: { "content-type": "application/json" },
        jsonAssertions: jsonEquals("Service state", "/service/state", "healthy"),
        latencyWarningMs: 400,
        followRedirects: false,
        validateTls: true,
      },
      history: warningHistory,
      degradedMessage: "Response latency exceeded the warning threshold",
    },
    {
      key: "internal-status",
      resourceKey: "internal-api",
      name: "Internal deployment status",
      type: "http",
      config: {
        target: { url: "http://api.internal:8080/status", method: "GET" },
        expectedStatuses: [200],
        jsonAssertions: jsonEquals("Deployment phase", "/deployment/phase", "ready"),
        followRedirects: false,
        validateTls: true,
      },
      history: recoveredHistory,
      downMessage: "JSON value did not match",
    },
    {
      key: "internal-port",
      resourceKey: "internal-api",
      name: "Internal API port",
      type: "tcp",
      config: { target: { host: "api.internal", port: 8080 } },
    },
    {
      key: "internal-dns",
      resourceKey: "internal-api",
      name: "Internal API DNS",
      type: "dns",
      config: {
        target: { hostname: "api.internal" },
        recordType: "A",
        expectedValue: "10.20.0.15",
      },
    },
    {
      key: "cache-redis",
      resourceKey: "cache",
      name: "Redis port",
      type: "tcp",
      config: { target: { host: "redis.internal", port: 6379 } },
      timeoutMs: 1_500,
    },
    {
      key: "cache-database",
      resourceKey: "cache",
      name: "Redis health",
      type: "database",
      config: {
        target: {
          engine: "redis",
          host: "redis.internal",
          port: 6379,
          tls: true,
        },
        connectionWarningPercent: 80,
      },
    },
    {
      key: "cache-metrics",
      resourceKey: "cache",
      name: "Redis metrics port",
      type: "tcp",
      config: { target: { host: "redis.internal", port: 9121 } },
      history: warningHistory,
      degradedMessage: "Connection is near the timeout",
    },
    {
      key: "cache-dns",
      resourceKey: "cache",
      name: "Cache DNS mapping",
      type: "dns",
      config: {
        target: { hostname: "redis.internal" },
        recordType: "A",
        expectedValue: "10.20.0.20",
      },
    },
    {
      key: "worker-host",
      resourceKey: "worker",
      name: "Worker host resources",
      type: "host",
      config: {
        cpuWarningPercent: 75,
        cpuCriticalPercent: 92,
        memoryWarningPercent: 80,
        memoryCriticalPercent: 94,
        loadWarning: 6,
        loadCritical: 12,
        swapWarningPercent: 60,
        swapCriticalPercent: 85,
        storage: [{ mount: "/", warningPercent: 80, criticalPercent: 95 }],
      },
      history: warningHistory,
      degradedMessage: "A host resource warning threshold was reached",
      intervalSeconds: 30,
    },
    {
      key: "worker-storage",
      resourceKey: "worker",
      name: "Worker spool health",
      type: "host",
      config: hostConfig("/var/spool", 70, 90),
      history: recoveredHistory,
      downMessage: "A host resource critical threshold was reached",
      intervalSeconds: 300,
    },
    {
      key: "worker-queue-port",
      resourceKey: "worker",
      name: "Worker queue port",
      type: "tcp",
      config: { target: { host: "queue.internal", port: 5672 } },
    },
    {
      key: "edge-https-port",
      resourceKey: "edge-gateway",
      name: "Branch HTTPS port",
      type: "tcp",
      config: { target: { host: "gateway.branch.internal", port: 443 } },
      history: recoveredHistory,
      downMessage: "Connection failed",
    },
    {
      key: "edge-dns",
      resourceKey: "edge-gateway",
      name: "Branch gateway DNS",
      type: "dns",
      config: {
        target: { hostname: "gateway.branch.internal" },
        recordType: "AAAA",
        expectedValue: "fd00:20::1",
      },
    },
    {
      key: "edge-health",
      resourceKey: "edge-gateway",
      name: "Branch gateway health",
      type: "http",
      config: {
        target: { url: "https://gateway.branch.internal/health", method: "GET" },
        expectedStatuses: [200],
        responseContains: "healthy",
        certificateWarningDays: 30,
        followRedirects: false,
        validateTls: true,
      },
      history: failingHistory,
      downMessage: "Expected response content was not found",
    },
  ];
}

async function seedResources(context: SeedContext, resources: DemoResourceSeed[]): Promise<void> {
  for (const [index, resource] of resources.entries()) {
    await context.database.run(
      `INSERT INTO resources
       (id, team_id, name, kind, description, tags_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind,
       description = excluded.description, tags_json = excluded.tags_json,
       updated_at = excluded.updated_at`,
      resourceId(context, resource.key),
      context.teamId,
      resource.name,
      resource.kind,
      resource.description,
      JSON.stringify(resource.tags),
      at(context, -days(70 - index * 4)),
      context.now.toISOString()
    );
  }
}

async function seedChecks(
  context: SeedContext,
  identity: SeedIdentityIds,
  resources: DemoResourceSeed[],
  checks: DemoCheckSeed[]
): Promise<void> {
  for (const [index, check] of checks.entries()) {
    const history = check.history ?? Array<ResultStatus>(8).fill("up");
    const status = history.at(-1)!;
    const lastLatencyMs = resultLatency(check.type, status, history.length - 1);
    await context.database.run(
      `INSERT INTO checks
       (id, team_id, resource_id, agent_id, name, type, config_json, interval_seconds, timeout_ms,
        failure_threshold, recovery_threshold, enabled, current_status, consecutive_failures,
        consecutive_successes, last_latency_ms, last_checked_at, next_check_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET resource_id = excluded.resource_id,
       agent_id = excluded.agent_id, name = excluded.name,
       type = excluded.type, config_json = excluded.config_json,
       interval_seconds = excluded.interval_seconds, timeout_ms = excluded.timeout_ms,
       failure_threshold = excluded.failure_threshold, recovery_threshold = excluded.recovery_threshold,
       enabled = excluded.enabled, current_status = excluded.current_status,
       consecutive_failures = excluded.consecutive_failures,
       consecutive_successes = excluded.consecutive_successes,
       last_latency_ms = excluded.last_latency_ms, last_checked_at = excluded.last_checked_at,
       next_check_at = excluded.next_check_at, updated_at = excluded.updated_at`,
      checkId(context, check.key),
      context.teamId,
      resourceId(context, check.resourceKey),
      checkAgentId(context, identity, resources, check.resourceKey),
      check.name,
      check.type,
      JSON.stringify(check.config),
      check.intervalSeconds ?? 60,
      check.timeoutMs ?? 5_000,
      check.failureThreshold ?? 2,
      check.recoveryThreshold ?? 2,
      1,
      status,
      status === "down" ? 5 : 0,
      status === "up" ? 8 : 0,
      lastLatencyMs,
      at(context, -minutes(index + 2)),
      at(context, hours(8) + minutes(index * 5)),
      at(context, -days(65 - Math.floor(index / 2))),
      context.now.toISOString()
    );
  }
}

async function seedResults(context: SeedContext, checks: DemoCheckSeed[]): Promise<void> {
  for (const [checkIndex, check] of checks.entries()) {
    const history = check.history ?? Array<ResultStatus>(8).fill("up");
    for (const [resultIndex, status] of history.entries()) {
      await context.database.run(
        `INSERT INTO check_results
         (id, check_id, status, latency_ms, status_code, message, metrics_json, checked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET status = excluded.status,
         latency_ms = excluded.latency_ms, status_code = excluded.status_code,
         message = excluded.message, metrics_json = excluded.metrics_json,
         checked_at = excluded.checked_at`,
        seedId(context, `result:demo:${check.key}:${resultIndex}`),
        checkId(context, check.key),
        status,
        resultLatency(check.type, status, resultIndex),
        resultStatusCode(check, status),
        resultMessage(check, status),
        JSON.stringify(resultMetrics(check, status, resultIndex)),
        at(context, -hours((history.length - resultIndex) * 6) - minutes(checkIndex + 2))
      );
    }
  }
}

function resultLatency(type: CheckType, status: ResultStatus, index: number): number | null {
  if (type === "host" || type === "docker" || (status === "down" && type !== "http")) return null;
  if (status === "degraded") return 1_100 + index * 9;
  return 24 + index * 7;
}

function resultStatusCode(check: DemoCheckSeed, status: ResultStatus): number | null {
  if (check.type !== "http") return null;
  if (status === "down" && check.downStatusCode) return check.downStatusCode;
  return check.config.expectedStatuses[0]!;
}

function resultMessage(check: DemoCheckSeed, status: ResultStatus): string | null {
  if (status === "degraded") {
    return check.degradedMessage ?? "Response latency exceeded the warning threshold";
  }
  if (status === "down") return check.downMessage ?? "Check failed";
  return null;
}

function resultMetrics(
  check: DemoCheckSeed,
  status: ResultStatus,
  index: number
): Record<string, number | string | boolean | null> {
  switch (check.type) {
    case "http":
      return {
        responseBytes: 820 + index * 17,
        contentType: "application/json",
        tlsProtocol: "TLSv1.3",
        certificateDaysRemaining: 74,
      };
    case "tcp":
      return { port: check.config.target.port };
    case "dns":
      return {
        recordCount: status === "down" ? 0 : 2,
        recordType: check.config.recordType,
      };
    case "host":
      return {
        cpuPercent: status === "degraded" ? 81 : 36 + index,
        memoryPercent: 68,
        loadAverage: status === "degraded" ? 7.2 : 2.1,
        swapPercent: 8,
        processCount: 112,
        storagePercent: status === "down" ? 94 : status === "degraded" ? 78 : 61 + index,
        storage0Mount: check.config.storage[0]?.mount ?? "/",
        storage0UsedBytes: 620_000_000_000,
        storage0TotalBytes: 1_000_000_000_000,
      };
    case "icmp":
      return { packetsSent: 3, packetsReceived: status === "down" ? 0 : 3, packetLossPercent: 0 };
    case "wan":
      return { targetsUp: status === "down" ? 0 : 2, targetsTotal: 2 };
    case "docker":
      return { containerCount: 5, unhealthyContainerCount: status === "down" ? 1 : 0 };
    case "database":
      return { connectionPercent: 38, connectedClients: 12, maximumClients: 100 };
  }
  throw new Error("Unsupported check type");
}

function resourceId(context: SeedContext, key: string): string {
  if (key === "server" || key === "worker") return context.agentId;
  return seedId(context, `resource:${key}`);
}

function checkAgentId(
  context: SeedContext,
  identity: SeedIdentityIds,
  resources: DemoResourceSeed[],
  resourceKey: string
): string | null {
  if (resourceKey === "server" || resourceKey === "worker") return context.agentId;
  if (resourceKey === "service") return identity.staleAgentId;
  if (resourceKey === "pipeline") return identity.offlineAgentId;
  if (resourceKey === "endpoint") return null;
  return resources.find((resource) => resource.key === resourceKey)?.agentId ?? null;
}

function jsonEquals(
  name: string,
  pointer: string,
  expectedValue: string | number | boolean | null
): HttpJsonAssertionGroup {
  return {
    kind: "group",
    operator: "and",
    conditions: [{ kind: "assertion", name, pointer, operator: "equals", expectedValue }],
  };
}

function checkId(context: SeedContext, key: string): string {
  return seedId(context, `check:demo:${key}`);
}
