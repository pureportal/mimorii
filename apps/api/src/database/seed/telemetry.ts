import { hashSecret } from "../../common/crypto.js";
import { at, days, hours, minutes, seedId, seedSecret, type SeedContext } from "./context.js";
import type { SeedIdentityIds } from "./identity.js";
import type { SeedMonitoringIds } from "./monitoring.js";

export async function seedRelayTelemetry(
  context: SeedContext,
  identity: SeedIdentityIds,
  monitoring: SeedMonitoringIds
): Promise<void> {
  await seedSnapshots(context, identity);
  await seedTechnologies(context, monitoring);
  await seedTasks(context, monitoring);
  await seedHeartbeats(context, monitoring);
}

async function seedSnapshots(context: SeedContext, identity: SeedIdentityIds): Promise<void> {
  const snapshots = [
    {
      key: "local:now",
      agentId: context.agentId,
      offset: -minutes(1),
      cpu: 28.4,
      memory: 9_800_000_000,
      received: 18_400_000_000,
    },
    {
      key: "local:hour",
      agentId: context.agentId,
      offset: -hours(1),
      cpu: 44.2,
      memory: 10_600_000_000,
      received: 17_900_000_000,
    },
    {
      key: "local:day",
      agentId: context.agentId,
      offset: -days(1),
      cpu: 18.7,
      memory: 8_900_000_000,
      received: 12_300_000_000,
    },
    {
      key: "branch",
      agentId: identity.staleAgentId,
      offset: -minutes(3),
      cpu: 36.5,
      memory: 5_400_000_000,
      received: 6_200_000_000,
    },
    {
      key: "warehouse",
      agentId: identity.offlineAgentId,
      offset: -hours(2),
      cpu: 72.1,
      memory: 12_400_000_000,
      received: 32_500_000_000,
    },
  ];
  for (const snapshot of snapshots) {
    const observedAt = at(context, snapshot.offset);
    const value = {
      hostname: snapshot.key.startsWith("local") ? "app-01" : snapshot.key,
      platform: snapshot.key === "warehouse" ? "Windows Server 2025" : "Linux 6.12",
      version: "0.1.0",
      uptimeSeconds: Math.max(3_600, Math.round((days(30) + snapshot.offset) / 1_000)),
      cpuPercent: snapshot.cpu,
      loadAverage: snapshot.cpu / 25,
      memoryUsedBytes: snapshot.memory,
      memoryTotalBytes: 17_179_869_184,
      swapUsedBytes: 268_435_456,
      swapTotalBytes: 2_147_483_648,
      processCount: 86,
      networkReceivedBytes: snapshot.received,
      networkTransmittedBytes: Math.round(snapshot.received * 0.62),
      disks: [
        { mount: "/", usedBytes: 730_000_000_000, totalBytes: 1_000_000_000_000 },
        { mount: "/data", usedBytes: 1_240_000_000_000, totalBytes: 2_000_000_000_000 },
      ],
      technologies: [
        { name: "nginx", category: "proxy", version: "1.26" },
        { name: "node", category: "runtime", version: "24" },
        { name: "docker", category: "container", version: "27" },
        { name: "postgres", category: "database", version: "17" },
      ],
      observedAt,
    };
    await context.database.run(
      `INSERT INTO host_snapshots (id, agent_id, snapshot_json, observed_at, received_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET snapshot_json = excluded.snapshot_json,
       observed_at = excluded.observed_at, received_at = excluded.received_at`,
      seedId(context, `snapshot:${snapshot.key}`),
      snapshot.agentId,
      JSON.stringify(value),
      observedAt,
      at(context, snapshot.offset + 1_000)
    );
  }
}

async function seedTechnologies(
  context: SeedContext,
  monitoring: SeedMonitoringIds
): Promise<void> {
  const technologies = [
    {
      resourceId: monitoring.serverResourceId,
      name: "Node.js",
      category: "runtime",
      version: "24",
      source: "agent",
    },
    {
      resourceId: monitoring.serverResourceId,
      name: "PostgreSQL",
      category: "database",
      version: "17",
      source: "agent",
    },
    {
      resourceId: monitoring.serverResourceId,
      name: "nginx",
      category: "proxy",
      version: "1.26",
      source: "agent",
    },
    {
      resourceId: monitoring.serverResourceId,
      name: "Docker",
      category: "container",
      version: "27",
      source: "agent",
    },
    {
      resourceId: monitoring.endpointResourceId,
      name: "Express",
      category: "framework",
      version: "5",
      source: "http",
    },
    {
      resourceId: monitoring.endpointResourceId,
      name: "TLS",
      category: "protocol",
      version: "1.3",
      source: "http",
    },
    {
      resourceId: monitoring.pipelineResourceId,
      name: "Custom ETL",
      category: "other",
      version: null,
      source: "agent",
    },
  ] as const;
  for (const [index, technology] of technologies.entries()) {
    await context.database.run(
      `INSERT INTO technology_observations
       (id, team_id, resource_id, name, category, version, source, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, category = excluded.category,
       version = excluded.version, source = excluded.source, last_seen_at = excluded.last_seen_at`,
      seedId(context, `technology:${index}`),
      context.teamId,
      technology.resourceId,
      technology.name,
      technology.category,
      technology.version,
      technology.source,
      at(context, -days(60 - index * 4)),
      at(context, -minutes(index + 1))
    );
  }
}

async function seedTasks(context: SeedContext, monitoring: SeedMonitoringIds): Promise<void> {
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
  const tasks = [
    {
      key: "pending",
      checkId: monitoring.hostCheckId,
      type: "host",
      config: hostConfig,
      status: "pending",
      issued: -minutes(1),
      claimed: null,
      completed: null,
    },
    {
      key: "claimed",
      checkId: monitoring.diskCheckId,
      type: "disk",
      config: { mount: "/", warningPercent: 80, criticalPercent: 95 },
      status: "claimed",
      issued: -minutes(1),
      claimed: -30_000,
      completed: null,
    },
    {
      key: "completed",
      checkId: monitoring.hostCheckId,
      type: "host",
      config: hostConfig,
      status: "completed",
      issued: -hours(1),
      claimed: -hours(1) + 2_000,
      completed: -hours(1) + 5_000,
    },
    {
      key: "expired",
      checkId: monitoring.diskCheckId,
      type: "disk",
      config: { mount: "/", warningPercent: 80, criticalPercent: 95 },
      status: "expired",
      issued: -hours(3),
      claimed: -hours(3) + 2_000,
      completed: null,
    },
  ] as const;
  for (const task of tasks) {
    const id = seedId(context, `agent-task:${task.key}`);
    const issuedAt = at(context, task.issued);
    await context.database.run(
      `INSERT INTO agent_tasks
       (id, agent_id, check_id, payload_json, status, issued_at, claimed_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, status = excluded.status,
       issued_at = excluded.issued_at, claimed_at = excluded.claimed_at,
       completed_at = excluded.completed_at`,
      id,
      context.agentId,
      task.checkId,
      JSON.stringify({
        id,
        checkId: task.checkId,
        type: task.type,
        timeoutMs: 5_000,
        config: task.config,
        issuedAt,
      }),
      task.status,
      issuedAt,
      task.claimed === null ? null : at(context, task.claimed),
      task.completed === null ? null : at(context, task.completed)
    );
  }
}

async function seedHeartbeats(context: SeedContext, monitoring: SeedMonitoringIds): Promise<void> {
  const monitors = [
    {
      id: monitoring.backupHeartbeatId,
      key: "backup",
      name: "Nightly backup",
      interval: 86_400,
      grace: 3_600,
      maxRuntime: 7_200,
      enabled: 1,
      status: "up",
      lastPing: at(context, -hours(6)),
      lastStarted: at(context, -hours(6) - minutes(28)),
      runningSince: null,
      nextExpected: at(context, hours(18)),
      duration: 1_680_000,
      message: "Backup uploaded",
    },
    {
      id: monitoring.missedHeartbeatId,
      key: "missed",
      name: "Invoice export",
      interval: 3_600,
      grace: 600,
      maxRuntime: 1_800,
      enabled: 1,
      status: "down",
      lastPing: at(context, -hours(26)),
      lastStarted: at(context, -hours(27)),
      runningSince: null,
      nextExpected: at(context, -hours(25)),
      duration: 210_000,
      message: "Schedule missed",
    },
    {
      id: monitoring.runningHeartbeatId,
      key: "running",
      name: "Catalog sync",
      interval: 7_200,
      grace: 900,
      maxRuntime: 3_600,
      enabled: 1,
      status: "up",
      lastPing: at(context, -hours(2)),
      lastStarted: at(context, -minutes(15)),
      runningSince: at(context, -minutes(15)),
      nextExpected: at(context, hours(2)),
      duration: 540_000,
      message: "Sync in progress",
    },
    {
      id: monitoring.pendingHeartbeatId,
      key: "pending",
      name: "Monthly report",
      interval: 2_592_000,
      grace: 86_400,
      maxRuntime: null,
      enabled: 1,
      status: "pending",
      lastPing: null,
      lastStarted: null,
      runningSince: null,
      nextExpected: null,
      duration: null,
      message: null,
    },
    {
      id: monitoring.pausedHeartbeatId,
      key: "paused",
      name: "Legacy reconciliation",
      interval: 86_400,
      grace: 3_600,
      maxRuntime: null,
      enabled: 0,
      status: "paused",
      lastPing: at(context, -days(14)),
      lastStarted: null,
      runningSince: null,
      nextExpected: null,
      duration: 320_000,
      message: "Paused during migration",
    },
  ] as const;
  for (const [index, monitor] of monitors.entries()) {
    await context.database.run(
      `INSERT INTO heartbeat_monitors
       (id, team_id, resource_id, name, token_hash, interval_seconds, grace_seconds,
        max_runtime_seconds, enabled, current_status, last_ping_at, last_started_at,
        running_since, next_expected_at, last_duration_ms, last_message, created_by,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, token_hash = excluded.token_hash,
       interval_seconds = excluded.interval_seconds, grace_seconds = excluded.grace_seconds,
       max_runtime_seconds = excluded.max_runtime_seconds, enabled = excluded.enabled,
       current_status = excluded.current_status, last_ping_at = excluded.last_ping_at,
       last_started_at = excluded.last_started_at, running_since = excluded.running_since,
       next_expected_at = excluded.next_expected_at, last_duration_ms = excluded.last_duration_ms,
       last_message = excluded.last_message, updated_at = excluded.updated_at`,
      monitor.id,
      context.teamId,
      monitoring.pipelineResourceId,
      monitor.name,
      hashSecret(seedSecret(context, "mim_heartbeat", monitor.key)),
      monitor.interval,
      monitor.grace,
      monitor.maxRuntime,
      monitor.enabled,
      monitor.status,
      monitor.lastPing,
      monitor.lastStarted,
      monitor.runningSince,
      monitor.nextExpected,
      monitor.duration,
      monitor.message,
      context.userId,
      at(context, -days(70 - index * 8)),
      context.now.toISOString()
    );
  }
  const events = [
    {
      key: "backup:start",
      heartbeatId: monitoring.backupHeartbeatId,
      type: "started",
      offset: -hours(6) - minutes(28),
      duration: null,
      message: "Backup started",
      metadata: { host: "app-01" },
    },
    {
      key: "backup:success",
      heartbeatId: monitoring.backupHeartbeatId,
      type: "succeeded",
      offset: -hours(6),
      duration: 1_680_000,
      message: "Backup uploaded",
      metadata: { files: 1842, encrypted: true },
    },
    {
      key: "export:start",
      heartbeatId: monitoring.missedHeartbeatId,
      type: "started",
      offset: -hours(27),
      duration: null,
      message: "Export started",
      metadata: { batch: "invoices" },
    },
    {
      key: "export:failed",
      heartbeatId: monitoring.missedHeartbeatId,
      type: "failed",
      offset: -hours(26),
      duration: 210_000,
      message: "Object storage unavailable",
      metadata: { retryable: true },
    },
    {
      key: "export:missed",
      heartbeatId: monitoring.missedHeartbeatId,
      type: "missed",
      offset: -hours(24),
      duration: null,
      message: "Expected heartbeat was not received",
      metadata: { deadlineExceeded: true },
    },
    {
      key: "sync:start",
      heartbeatId: monitoring.runningHeartbeatId,
      type: "started",
      offset: -minutes(15),
      duration: null,
      message: "Catalog sync started",
      metadata: { items: 12500 },
    },
    {
      key: "paused:success",
      heartbeatId: monitoring.pausedHeartbeatId,
      type: "succeeded",
      offset: -days(14),
      duration: 320_000,
      message: "Final reconciliation completed",
      metadata: {},
    },
  ] as const;
  for (const event of events) {
    const occurredAt = at(context, event.offset);
    await context.database.run(
      `INSERT INTO heartbeat_events
       (id, heartbeat_id, type, duration_ms, message, metadata_json, occurred_at, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET type = excluded.type, duration_ms = excluded.duration_ms,
       message = excluded.message, metadata_json = excluded.metadata_json,
       occurred_at = excluded.occurred_at, received_at = excluded.received_at`,
      seedId(context, `heartbeat-event:${event.key}`),
      event.heartbeatId,
      event.type,
      event.duration,
      event.message,
      JSON.stringify(event.metadata),
      occurredAt,
      new Date(new Date(occurredAt).getTime() + 1_000).toISOString()
    );
  }
}
