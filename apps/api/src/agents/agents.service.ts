import { Injectable, NotFoundException } from "@nestjs/common";
import {
  agentCollectionInterval,
  type AgentHeartbeatResponse,
  type AgentPollResponse,
  type AgentSummary,
  type AgentTask,
  type HostSnapshot,
} from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { createSecret, hashSecret } from "../common/crypto.js";
import { DatabaseService } from "../database/database.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";
import type { AuthenticatedAgent } from "./agent-auth.js";
import type {
  AgentHeartbeatDto,
  AgentTaskResultDto,
  CreateAgentDto,
  HostSnapshotDto,
  UpdateAgentDto,
} from "./agents.dto.js";
import { ResultsService } from "../checks/results.service.js";
import { TechnologiesService } from "../technologies/technologies.service.js";

interface AgentRow {
  id: string;
  team_id: string;
  name: string;
  collection_interval_seconds: number;
  platform: string | null;
  version: string | null;
  capabilities_json: string;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface TaskRow {
  id: string;
  check_id: string;
  payload_json: string;
  status: string;
  issued_at: string;
}

@Injectable()
export class AgentsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: TeamAccessService,
    private readonly audit: AuditService,
    private readonly results: ResultsService,
    private readonly technologies: TechnologiesService
  ) {}

  async list(userId: string, teamId: string): Promise<AgentSummary[]> {
    await this.access.require(userId, teamId, "viewer");
    const rows = await this.database.all<AgentRow>(
      "SELECT * FROM agents WHERE team_id = ? AND revoked_at IS NULL ORDER BY name",
      teamId
    );
    return rows.map((row) => this.map(row));
  }

  async create(userId: string, teamId: string, input: CreateAgentDto) {
    await this.access.require(userId, teamId, "admin");
    const id = randomUUID();
    const enrollmentKey = createSecret("mim_agent");
    const now = new Date().toISOString();
    await this.database.run(
      `INSERT INTO agents
       (id, team_id, name, key_hash, collection_interval_seconds, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      teamId,
      input.name.trim(),
      hashSecret(enrollmentKey),
      input.collectionIntervalSeconds ?? agentCollectionInterval.defaultSeconds,
      now,
      now
    );
    await this.audit.record({
      teamId,
      userId,
      action: "agent.created",
      subjectType: "agent",
      subjectId: id,
    });
    return { ...this.map(await this.requireRow(teamId, id)), enrollmentKey };
  }

  async update(userId: string, teamId: string, id: string, input: UpdateAgentDto) {
    await this.access.require(userId, teamId, "admin");
    await this.requireRow(teamId, id);
    await this.database.run(
      `UPDATE agents SET collection_interval_seconds = ?, updated_at = ?
       WHERE id = ? AND team_id = ? AND revoked_at IS NULL`,
      input.collectionIntervalSeconds,
      new Date().toISOString(),
      id,
      teamId
    );
    await this.audit.record({
      teamId,
      userId,
      action: "agent.updated",
      subjectType: "agent",
      subjectId: id,
      metadata: { collectionIntervalSeconds: input.collectionIntervalSeconds },
    });
    return this.map(await this.requireRow(teamId, id));
  }

  async rotate(userId: string, teamId: string, id: string) {
    await this.access.require(userId, teamId, "admin");
    await this.requireRow(teamId, id);
    const enrollmentKey = createSecret("mim_agent");
    await this.database.run(
      "UPDATE agents SET key_hash = ?, updated_at = ? WHERE id = ? AND team_id = ?",
      hashSecret(enrollmentKey),
      new Date().toISOString(),
      id,
      teamId
    );
    await this.audit.record({
      teamId,
      userId,
      action: "agent.key_rotated",
      subjectType: "agent",
      subjectId: id,
    });
    return { enrollmentKey };
  }

  async revoke(userId: string, teamId: string, id: string): Promise<void> {
    await this.access.require(userId, teamId, "admin");
    const result = await this.database.run(
      "UPDATE agents SET revoked_at = ?, updated_at = ? WHERE id = ? AND team_id = ? AND revoked_at IS NULL",
      new Date().toISOString(),
      new Date().toISOString(),
      id,
      teamId
    );
    if (result.changes === 0) throw new NotFoundException("Agent not found");
    await this.audit.record({
      teamId,
      userId,
      action: "agent.revoked",
      subjectType: "agent",
      subjectId: id,
    });
  }

  async snapshots(userId: string, teamId: string, id: string, limit = 200) {
    await this.access.require(userId, teamId, "viewer");
    await this.requireRow(teamId, id);
    const rows = await this.database.all<{ snapshot_json: string }>(
      `SELECT snapshot_json FROM host_snapshots WHERE agent_id = ?
       ORDER BY observed_at DESC LIMIT ?`,
      id,
      Math.min(Math.max(limit, 1), 1_000)
    );
    return rows.map((row) => JSON.parse(row.snapshot_json) as HostSnapshot);
  }

  async poll(agent: AuthenticatedAgent, limit = 25): Promise<AgentPollResponse> {
    const now = new Date().toISOString();
    const rows = await this.database.all<TaskRow>(
      `SELECT * FROM agent_tasks WHERE agent_id = ? AND status IN ('pending', 'claimed')
       ORDER BY issued_at LIMIT ?`,
      agent.id,
      Math.min(Math.max(limit, 1), 100)
    );
    if (rows.length > 0) {
      const ids = rows.map(() => "?").join(",");
      await this.database.run(
        `UPDATE agent_tasks SET status = 'claimed', claimed_at = COALESCE(claimed_at, ?)
         WHERE id IN (${ids})`,
        now,
        ...rows.map((row) => row.id)
      );
    }
    await this.database.run(
      "UPDATE agents SET last_seen_at = ? WHERE id = ? AND revoked_at IS NULL",
      now,
      agent.id
    );
    return {
      collectionIntervalSeconds: agent.collectionIntervalSeconds,
      tasks: rows.map((row) => JSON.parse(row.payload_json) as AgentTask),
    };
  }

  async heartbeat(
    agent: AuthenticatedAgent,
    input: AgentHeartbeatDto
  ): Promise<AgentHeartbeatResponse> {
    const receivedAt = new Date().toISOString();
    const snapshots = input.snapshots.map((snapshot) =>
      this.normalizeSnapshot(snapshot, receivedAt)
    );
    const latestSnapshot = snapshots.at(-1)!;
    let acceptedResults = 0;

    await this.database.transaction(async () => {
      await this.database.run(
        `UPDATE agents SET platform = ?, version = ?, capabilities_json = ?, last_seen_at = ?, updated_at = ?
         WHERE id = ? AND revoked_at IS NULL`,
        latestSnapshot.platform.slice(0, 100),
        latestSnapshot.version.slice(0, 40),
        JSON.stringify([...new Set(input.capabilities.map((value) => value.slice(0, 50)))]),
        receivedAt,
        receivedAt,
        agent.id
      );
      for (const snapshot of snapshots) {
        await this.database.run(
          `INSERT INTO host_snapshots (id, agent_id, snapshot_json, observed_at, received_at)
           VALUES (?, ?, ?, ?, ?)`,
          randomUUID(),
          agent.id,
          JSON.stringify(snapshot),
          snapshot.observedAt,
          receivedAt
        );
        await this.technologies.observeAgent(agent.id, snapshot.technologies, snapshot.observedAt);
      }
      for (const result of input.results) {
        if (await this.acceptResult(agent.id, result, receivedAt)) acceptedResults += 1;
      }
    });

    return { acceptedAt: receivedAt, acceptedSnapshots: snapshots.length, acceptedResults };
  }

  private normalizeSnapshot(input: HostSnapshotDto, receivedAt: string): HostSnapshot {
    return {
      hostname: input.hostname,
      platform: input.platform,
      version: input.version,
      uptimeSeconds: input.uptimeSeconds,
      cpuPercent: input.cpuPercent,
      loadAverage: input.loadAverage,
      memoryUsedBytes: input.memoryUsedBytes,
      memoryTotalBytes: input.memoryTotalBytes,
      swapUsedBytes: input.swapUsedBytes,
      swapTotalBytes: input.swapTotalBytes,
      processCount: input.processCount,
      networkReceivedBytes: input.networkReceivedBytes,
      networkTransmittedBytes: input.networkTransmittedBytes,
      disks: input.disks.map((disk) => ({
        mount: disk.mount,
        usedBytes: disk.usedBytes,
        totalBytes: disk.totalBytes,
      })),
      technologies: input.technologies.map((technology) => ({
        name: technology.name,
        category: technology.category,
        version: technology.version ?? null,
      })),
      observedAt: this.safeCollectedAt(input.observedAt, receivedAt),
    };
  }

  private async acceptResult(
    agentId: string,
    input: AgentTaskResultDto,
    receivedAt: string
  ): Promise<boolean> {
    const task = await this.database.get<TaskRow>(
      `SELECT at.* FROM agent_tasks at JOIN checks c ON c.id = at.check_id
       WHERE at.id = ? AND at.agent_id = ? AND at.status IN ('pending', 'claimed')
       AND c.enabled = 1`,
      input.taskId,
      agentId
    );
    if (!task) return false;
    const checkedAt = this.safeObservedAt(input.checkedAt, receivedAt);
    await this.results.record(task.check_id, {
      status: input.status,
      latencyMs: input.latencyMs ?? null,
      statusCode: input.statusCode ?? null,
      message: input.message?.slice(0, 500) ?? null,
      metrics: this.cleanMetrics(input.metrics),
      checkedAt,
    });
    await this.database.run(
      "UPDATE agent_tasks SET status = 'completed', completed_at = ? WHERE id = ?",
      receivedAt,
      task.id
    );
    return true;
  }

  private cleanMetrics(metrics: Record<string, number | string | boolean | null>) {
    return Object.fromEntries(
      Object.entries(metrics)
        .slice(0, 50)
        .map(([key, value]) => [
          key.slice(0, 80),
          typeof value === "string" ? value.slice(0, 500) : value,
        ])
    );
  }

  private safeObservedAt(value: string, fallback: string): string {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 10 * 60 * 1000)
      return fallback;
    return new Date(timestamp).toISOString();
  }

  private safeCollectedAt(value: string, fallback: string): string {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp) || timestamp > Date.now() + 10 * 60 * 1000) return fallback;
    return new Date(timestamp).toISOString();
  }

  private async requireRow(teamId: string, id: string): Promise<AgentRow> {
    const row = await this.database.get<AgentRow>(
      "SELECT * FROM agents WHERE id = ? AND team_id = ? AND revoked_at IS NULL",
      id,
      teamId
    );
    if (!row) throw new NotFoundException("Agent not found");
    return row;
  }

  private map(row: AgentRow): AgentSummary {
    const lastSeen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
    const age = Date.now() - lastSeen;
    const status = !lastSeen
      ? "never"
      : age <= 90_000
        ? "online"
        : age <= 300_000
          ? "stale"
          : "offline";
    return {
      id: row.id,
      teamId: row.team_id,
      name: row.name,
      collectionIntervalSeconds: row.collection_interval_seconds,
      status,
      platform: row.platform,
      version: row.version,
      lastSeenAt: row.last_seen_at,
      capabilities: JSON.parse(row.capabilities_json) as string[],
      createdAt: row.created_at,
    };
  }
}
