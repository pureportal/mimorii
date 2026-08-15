import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import type { MobileDeviceStatus, MobileDeviceStatusResponse } from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service.js";
import type { AuthenticatedAgent } from "./agent-auth.js";
import type { MobileDeviceStatusDto } from "./mobile-device-status.dto.js";

interface MobileDeviceStatusRow {
  agent_id: string;
  status_json: MobileDeviceStatus | string;
}

@Injectable()
export class MobileDeviceStatusService {
  constructor(private readonly database: DatabaseService) {}

  async report(
    agent: AuthenticatedAgent,
    input: MobileDeviceStatusDto
  ): Promise<MobileDeviceStatusResponse> {
    if (agent.kind !== "mobile") {
      throw new ForbiddenException("Collector does not support mobile device status");
    }
    this.validateTotals(input);
    const receivedAt = new Date().toISOString();
    const status = this.normalize(input);

    await this.database.transaction(async () => {
      await this.database.run(
        `INSERT INTO mobile_device_statuses
         (id, agent_id, status_json, observed_at, received_at)
         VALUES (?, ?, ?, ?, ?)`,
        randomUUID(),
        agent.id,
        JSON.stringify(status),
        status.observedAt,
        receivedAt
      );
      const update = await this.database.run(
        `UPDATE agents SET platform = ?, version = ?, capabilities_json = ?,
         last_seen_at = ?, updated_at = ? WHERE id = ? AND revoked_at IS NULL`,
        `Android ${status.device.androidRelease}`.slice(0, 100),
        status.collector.appVersion.slice(0, 40),
        JSON.stringify(["device-status"]),
        receivedAt,
        receivedAt,
        agent.id
      );
      if (update.changes === 0) throw new ForbiddenException("Collector key was rejected");
    });

    return {
      acceptedAt: receivedAt,
      collectionIntervalSeconds: agent.collectionIntervalSeconds,
    };
  }

  async latest(agentId: string): Promise<MobileDeviceStatus | null> {
    const row = await this.database.get<MobileDeviceStatusRow>(
      `SELECT agent_id, status_json FROM mobile_device_statuses
       WHERE agent_id = ? ORDER BY observed_at DESC LIMIT 1`,
      agentId
    );
    return row ? this.parse(row.status_json) : null;
  }

  async latestByAgentIds(agentIds: string[]): Promise<Map<string, MobileDeviceStatus>> {
    if (agentIds.length === 0) return new Map();
    const placeholders = agentIds.map(() => "?").join(",");
    const rows = await this.database.all<MobileDeviceStatusRow>(
      `SELECT DISTINCT ON (agent_id) agent_id, status_json
       FROM mobile_device_statuses WHERE agent_id IN (${placeholders})
       ORDER BY agent_id, observed_at DESC`,
      ...agentIds
    );
    return new Map(rows.map((row) => [row.agent_id, this.parse(row.status_json)]));
  }

  private validateTotals(input: MobileDeviceStatusDto): void {
    if (input.memory.availableBytes > input.memory.totalBytes) {
      throw new BadRequestException("Available memory exceeds total memory");
    }
    if (input.storage.availableBytes > input.storage.totalBytes) {
      throw new BadRequestException("Available storage exceeds total storage");
    }
    if (new Date(input.observedAt).getTime() > Date.now() + 10 * 60 * 1000) {
      throw new BadRequestException("Observed time is too far in the future");
    }
  }

  private normalize(input: MobileDeviceStatusDto): MobileDeviceStatus {
    return {
      schemaVersion: 1,
      observedAt: new Date(input.observedAt).toISOString(),
      device: {
        manufacturer: input.device.manufacturer,
        model: input.device.model,
        androidRelease: input.device.androidRelease,
        apiLevel: input.device.apiLevel,
        securityPatch: input.device.securityPatch ?? null,
      },
      collector: {
        appVersion: input.collector.appVersion,
        buildNumber: input.collector.buildNumber,
      },
      uptimeSeconds: input.uptimeSeconds,
      battery: {
        percent: input.battery.percent ?? null,
        charging: input.battery.charging ?? null,
        powerSource: input.battery.powerSource,
        health: input.battery.health ?? null,
        temperatureCelsius: input.battery.temperatureCelsius ?? null,
      },
      memory: {
        totalBytes: input.memory.totalBytes,
        availableBytes: input.memory.availableBytes,
        lowMemory: input.memory.lowMemory,
      },
      storage: {
        totalBytes: input.storage.totalBytes,
        availableBytes: input.storage.availableBytes,
      },
      connectivity: {
        connected: input.connectivity.connected,
        internetValidated: input.connectivity.internetValidated,
        metered: input.connectivity.metered,
        roaming: input.connectivity.roaming ?? null,
        vpn: input.connectivity.vpn,
        transport: input.connectivity.transport,
      },
      power: {
        batterySaver: input.power.batterySaver,
        deviceIdle: input.power.deviceIdle,
        backgroundRestricted: input.power.backgroundRestricted ?? null,
      },
      thermalStatus: input.thermalStatus ?? null,
    };
  }

  private parse(value: MobileDeviceStatus | string): MobileDeviceStatus {
    return typeof value === "string" ? (JSON.parse(value) as MobileDeviceStatus) : value;
  }
}
