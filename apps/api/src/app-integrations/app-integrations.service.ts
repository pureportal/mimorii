import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import {
  appDefinitions,
  logsDisabledMessage,
  type AppDefinition,
  type CreateAppInput,
  type CreatedApp,
  type HttpCheckConfig,
} from "@mimorii/contracts";
import { ChecksService } from "../checks/checks.service.js";
import { DatabaseService } from "../database/database.service.js";
import { HeartbeatsService } from "../heartbeats/heartbeats.service.js";
import { LogAlertsService } from "../logs/log-alerts.service.js";
import { LogSourcesService } from "../logs/log-sources.service.js";
import { ResourcesService } from "../resources/resources.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";

@Injectable()
export class AppIntegrationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: TeamAccessService,
    private readonly resources: ResourcesService,
    private readonly checks: ChecksService,
    private readonly heartbeats: HeartbeatsService,
    private readonly logSources: LogSourcesService,
    private readonly logAlerts: LogAlertsService
  ) {}

  async create(userId: string, teamId: string, input: CreateAppInput): Promise<CreatedApp> {
    const definition = appDefinitions[input.kind];
    await this.access.require(userId, teamId, definition.logSource ? "admin" : "member");
    const name = input.name.trim();
    if (!name) throw new BadRequestException("Enter a name");
    const address = this.address(definition, input.address);
    if (definition.logSource) await this.requireLogs(teamId);
    return this.database.transaction(async () => {
      const resource = await this.resources.create(userId, teamId, {
        name,
        kind: "service",
        tags: [],
        app: definition.kind,
        ...(definition.logSource ? { logQuery: logQueryFor(definition.logSource.labels) } : {}),
      });
      if (address && definition.healthCheck) {
        await this.checks.create(userId, teamId, {
          resourceId: resource.id,
          name: `${definition.name} health`,
          type: "http",
          config: { ...healthCheckConfig(address, definition.healthCheck) },
          execution: { kind: "direct" },
          intervalSeconds: 60,
          timeoutMs: 10_000,
          failureThreshold: 2,
          recoveryThreshold: 1,
          enabled: true,
        });
      }
      const heartbeat = definition.heartbeat
        ? await this.heartbeats.create(userId, teamId, {
            resourceId: resource.id,
            name,
            intervalSeconds: definition.heartbeat.intervalSeconds,
            graceSeconds: definition.heartbeat.graceSeconds,
            enabled: !definition.heartbeat.enabledByApp,
          })
        : null;
      const logSource = definition.logSource
        ? await this.logSources.create(userId, teamId, {
            name,
            labels: { ...definition.logSource.labels },
          })
        : null;
      for (const alert of definition.logAlerts) {
        await this.logAlerts.create(userId, teamId, {
          ...alert,
          comparison: "atLeast",
          resourceId: resource.id,
        });
      }
      return {
        resource: await this.resources.get(userId, teamId, resource.id),
        enrollmentCode: heartbeat?.pingToken ?? null,
        logToken: logSource?.token ?? null,
      };
    });
  }

  private address(definition: AppDefinition, value: string | undefined): URL | null {
    const trimmed = value?.trim();
    if (!trimmed) {
      if (definition.address?.required) {
        throw new BadRequestException(`Enter the ${definition.address.label.toLowerCase()}`);
      }
      return null;
    }
    let url: URL;
    try {
      url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    } catch {
      throw new BadRequestException("Enter a valid address");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new BadRequestException("Enter an HTTP or HTTPS address");
    }
    return url;
  }

  private async requireLogs(teamId: string): Promise<void> {
    const settings = await this.database.get<{ enabled: boolean }>(
      "SELECT enabled FROM team_log_settings WHERE team_id = ?",
      teamId
    );
    if (!settings?.enabled) throw new ForbiddenException(logsDisabledMessage);
  }
}

function healthCheckConfig(
  address: URL,
  healthCheck: NonNullable<AppDefinition["healthCheck"]>
): HttpCheckConfig {
  const url = new URL(address);
  url.pathname = `${url.pathname.replace(/\/$/, "")}${healthCheck.path}`.replace(/\/{2,}/g, "/");
  return {
    target: { url: url.toString(), method: "GET" },
    expectedStatuses: [200],
    followRedirects: true,
    validateTls: true,
    ...(healthCheck.json
      ? {
          jsonAssertions: {
            kind: "group",
            operator: "and",
            conditions: [
              {
                kind: "assertion",
                name: "Healthy",
                pointer: healthCheck.json.pointer,
                operator: "equals",
                expectedValue: healthCheck.json.equals,
              },
            ],
          },
        }
      : {}),
  };
}

function logQueryFor(labels: Readonly<Record<string, string>>): string {
  return `{${Object.entries(labels)
    .map(([key, value]) => `${key}="${value}"`)
    .join(", ")}}`;
}
