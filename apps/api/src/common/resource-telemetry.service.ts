import { Injectable } from "@nestjs/common";
import type {
  HostSnapshot,
  MobileDeviceStatus,
  ResourceAlertMetric,
  ResourceMetricName,
  ResourceMetricSeries,
} from "@mimorii/contracts";
import { resourceMetricNames } from "@mimorii/contracts";
import { DatabaseService } from "../database/database.service.js";

type Telemetry = HostSnapshot | MobileDeviceStatus;

interface TelemetryRow {
  payload: Telemetry | string;
  observed_at: string;
}

@Injectable()
export class ResourceTelemetryService {
  constructor(private readonly database: DatabaseService) {}

  async series(
    resourceId: string,
    from: string,
    to: string,
    metrics: ResourceMetricName[] = [...resourceMetricNames]
  ): Promise<ResourceMetricSeries[]> {
    const rows = await this.rows(resourceId, from, to);
    return metrics.map((metric) => ({
      metric,
      points: rows.flatMap((row) => {
        const value = this.values(this.parse(row.payload))[metric];
        return typeof value === "number" ? [{ observedAt: row.observed_at, value }] : [];
      }),
    }));
  }

  values(telemetry: Telemetry): Partial<Record<ResourceAlertMetric, number | boolean>> {
    if ("schemaVersion" in telemetry) {
      return {
        batteryPercent: telemetry.battery.percent ?? undefined,
        batteryTemperatureCelsius: telemetry.battery.temperatureCelsius ?? undefined,
        memoryPercent: percent(
          telemetry.memory.totalBytes - telemetry.memory.availableBytes,
          telemetry.memory.totalBytes
        ),
        storagePercent: percent(
          telemetry.storage.totalBytes - telemetry.storage.availableBytes,
          telemetry.storage.totalBytes
        ),
        internetAvailable: telemetry.connectivity.internetValidated,
        lowMemory: telemetry.memory.lowMemory,
        backgroundRestricted: telemetry.power.backgroundRestricted ?? undefined,
      };
    }

    const storagePercent = telemetry.disks.reduce<number | undefined>((highest, disk) => {
      const current = percent(disk.usedBytes, disk.totalBytes);
      return current === undefined ? highest : Math.max(highest ?? current, current);
    }, undefined);
    return {
      cpuPercent: telemetry.cpuPercent,
      memoryPercent: percent(telemetry.memoryUsedBytes, telemetry.memoryTotalBytes),
      storagePercent,
      loadAverage: telemetry.loadAverage,
      containerCount: telemetry.containerRuntime?.containers.length ?? 0,
      unhealthyContainerCount:
        telemetry.containerRuntime?.containers.filter(
          (container) => container.health === "unhealthy" || container.state !== "running"
        ).length ?? 0,
    };
  }

  private rows(resourceId: string, from: string, to: string): Promise<TelemetryRow[]> {
    return this.database.all<TelemetryRow>(
      `SELECT hs.snapshot_json::jsonb AS payload, hs.observed_at
       FROM host_snapshots hs JOIN agents a ON a.id = hs.agent_id
       WHERE a.resource_id = ? AND hs.observed_at BETWEEN ? AND ?
       UNION ALL
       SELECT mds.status_json AS payload, mds.observed_at
       FROM mobile_device_statuses mds JOIN agents a ON a.id = mds.agent_id
       WHERE a.resource_id = ? AND mds.observed_at BETWEEN ? AND ?
       ORDER BY observed_at`,
      resourceId,
      from,
      to,
      resourceId,
      from,
      to
    );
  }

  private parse(value: Telemetry | string): Telemetry {
    return typeof value === "string" ? (JSON.parse(value) as Telemetry) : value;
  }
}

function percent(used: number, total: number): number | undefined {
  return total > 0 ? (used / total) * 100 : undefined;
}
