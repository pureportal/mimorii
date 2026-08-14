import { at, days, hours, minutes, seedId, type SeedContext } from "./context.js";
import type { SeedIdentityIds } from "./identity.js";
import type { SeedMonitoringIds } from "./monitoring.js";

export interface SeedOperationsIds {
  dnsIncidentId: string;
  identifiedIncidentId: string;
  monitoringIncidentId: string;
  resolvedIncidentId: string;
  heartbeatIncidentId: string;
  activeMaintenanceId: string;
  scheduledMaintenanceId: string;
}

export async function seedOperations(
  context: SeedContext,
  identity: SeedIdentityIds,
  monitoring: SeedMonitoringIds
): Promise<SeedOperationsIds> {
  const ids: SeedOperationsIds = {
    dnsIncidentId: seedId(context, "incident:dns"),
    identifiedIncidentId: seedId(context, "incident:identified"),
    monitoringIncidentId: seedId(context, "incident:monitoring"),
    resolvedIncidentId: seedId(context, "incident:resolved"),
    heartbeatIncidentId: seedId(context, "incident:heartbeat"),
    activeMaintenanceId: seedId(context, "maintenance:active"),
    scheduledMaintenanceId: seedId(context, "maintenance:scheduled"),
  };
  await seedIncidents(context, identity, monitoring, ids);
  await seedMaintenance(context, monitoring, ids);
  await seedObjectives(context, monitoring);
  return ids;
}

async function seedIncidents(
  context: SeedContext,
  identity: SeedIdentityIds,
  monitoring: SeedMonitoringIds,
  ids: SeedOperationsIds
): Promise<void> {
  const incidents = [
    {
      id: ids.dnsIncidentId,
      source: "automatic",
      checkId: monitoring.dnsCheckId,
      heartbeatId: null,
      title: "Customer API DNS unavailable",
      impact: "critical",
      status: "investigating",
      startedAt: at(context, -minutes(28)),
      acknowledgedAt: at(context, -minutes(22)),
      resolvedAt: null,
      createdBy: null,
      openingResultId: monitoring.dnsOpeningResultId,
      closingResultId: null,
      suppressed: 0,
      resources: [monitoring.endpointResourceId],
    },
    {
      id: ids.identifiedIncidentId,
      source: "manual",
      checkId: null,
      heartbeatId: null,
      title: "Elevated payment latency",
      impact: "major",
      status: "identified",
      startedAt: at(context, -hours(3)),
      acknowledgedAt: at(context, -hours(2) - minutes(45)),
      resolvedAt: null,
      createdBy: identity.adminUserId,
      openingResultId: null,
      closingResultId: null,
      suppressed: 0,
      resources: [monitoring.serviceResourceId, monitoring.endpointResourceId],
    },
    {
      id: ids.monitoringIncidentId,
      source: "manual",
      checkId: null,
      heartbeatId: null,
      title: "Application deploy instability",
      impact: "minor",
      status: "monitoring",
      startedAt: at(context, -hours(8)),
      acknowledgedAt: at(context, -hours(7) - minutes(50)),
      resolvedAt: null,
      createdBy: identity.memberUserId,
      openingResultId: null,
      closingResultId: null,
      suppressed: 1,
      resources: [monitoring.serverResourceId],
    },
    {
      id: ids.resolvedIncidentId,
      source: "automatic",
      checkId: monitoring.hostCheckId,
      heartbeatId: null,
      title: "Application server resource pressure",
      impact: "major",
      status: "resolved",
      startedAt: at(context, -hours(60)),
      acknowledgedAt: at(context, -hours(59) - minutes(45)),
      resolvedAt: at(context, -hours(50)),
      createdBy: null,
      openingResultId: monitoring.hostOpeningResultId,
      closingResultId: monitoring.hostClosingResultId,
      suppressed: 0,
      resources: [monitoring.serverResourceId],
    },
    {
      id: ids.heartbeatIncidentId,
      source: "automatic",
      checkId: null,
      heartbeatId: monitoring.missedHeartbeatId,
      title: "Invoice export missed its schedule",
      impact: "major",
      status: "investigating",
      startedAt: at(context, -hours(24)),
      acknowledgedAt: null,
      resolvedAt: null,
      createdBy: null,
      openingResultId: null,
      closingResultId: null,
      suppressed: 0,
      resources: [monitoring.pipelineResourceId],
    },
  ] as const;
  for (const incident of incidents) {
    await context.database.run(
      `INSERT INTO incidents
       (id, team_id, source, check_id, heartbeat_id, title, impact, status, started_at,
        acknowledged_at, resolved_at, created_by, opening_result_id, closing_result_id,
        notifications_suppressed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, impact = excluded.impact,
       status = excluded.status, started_at = excluded.started_at,
       acknowledged_at = excluded.acknowledged_at, resolved_at = excluded.resolved_at,
       opening_result_id = excluded.opening_result_id, closing_result_id = excluded.closing_result_id,
       notifications_suppressed = excluded.notifications_suppressed,
       updated_at = excluded.updated_at`,
      incident.id,
      context.teamId,
      incident.source,
      incident.checkId,
      incident.heartbeatId,
      incident.title,
      incident.impact,
      incident.status,
      incident.startedAt,
      incident.acknowledgedAt,
      incident.resolvedAt,
      incident.createdBy,
      incident.openingResultId,
      incident.closingResultId,
      incident.suppressed,
      incident.startedAt,
      context.now.toISOString()
    );
    for (const resourceId of incident.resources) {
      await context.database.run(
        `INSERT INTO incident_resources (incident_id, resource_id) VALUES (?, ?)
         ON CONFLICT(incident_id, resource_id) DO NOTHING`,
        incident.id,
        resourceId
      );
    }
  }
  const updates = [
    {
      incidentId: ids.dnsIncidentId,
      key: "investigating",
      status: "investigating",
      message: "The DNS provider is returning lookup failures.",
      author: identity.adminUserId,
      offset: -minutes(24),
    },
    {
      incidentId: ids.identifiedIncidentId,
      key: "investigating",
      status: "investigating",
      message: "The payments team is reviewing slow database connections.",
      author: identity.memberUserId,
      offset: -hours(2) - minutes(55),
    },
    {
      incidentId: ids.identifiedIncidentId,
      key: "identified",
      status: "identified",
      message: "Connection pool saturation is the likely cause.",
      author: identity.adminUserId,
      offset: -hours(2) - minutes(30),
    },
    {
      incidentId: ids.monitoringIncidentId,
      key: "monitoring",
      status: "monitoring",
      message: "The deployment was rolled back and metrics are stabilizing.",
      author: identity.memberUserId,
      offset: -hours(6),
    },
    {
      incidentId: ids.resolvedIncidentId,
      key: "investigating",
      status: "investigating",
      message: "Host load crossed the critical threshold.",
      author: identity.adminUserId,
      offset: -hours(59),
    },
    {
      incidentId: ids.resolvedIncidentId,
      key: "resolved",
      status: "resolved",
      message: "Capacity was increased and host metrics recovered.",
      author: identity.adminUserId,
      offset: -hours(50),
    },
    {
      incidentId: ids.heartbeatIncidentId,
      key: "missed",
      status: "investigating",
      message: "No invoice export heartbeat was received before the deadline.",
      author: identity.adminUserId,
      offset: -hours(23) - minutes(45),
    },
  ] as const;
  for (const update of updates) {
    await context.database.run(
      `INSERT INTO incident_updates (id, incident_id, status, message, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, message = excluded.message,
       created_by = excluded.created_by, created_at = excluded.created_at`,
      seedId(context, `incident-update:${update.incidentId}:${update.key}`),
      update.incidentId,
      update.status,
      update.message,
      update.author,
      at(context, update.offset)
    );
  }
}

async function seedMaintenance(
  context: SeedContext,
  monitoring: SeedMonitoringIds,
  ids: SeedOperationsIds
): Promise<void> {
  const completedId = seedId(context, "maintenance:completed");
  const cancelledId = seedId(context, "maintenance:cancelled");
  const windows = [
    {
      id: ids.activeMaintenanceId,
      name: "Application server upgrades",
      startsAt: at(context, -minutes(30)),
      endsAt: at(context, minutes(45)),
      recurrence: "none",
      recurrenceUntil: null,
      suppress: 1,
      cancelledAt: null,
      resources: [monitoring.serverResourceId],
    },
    {
      id: ids.scheduledMaintenanceId,
      name: "Weekly API maintenance",
      startsAt: at(context, days(1)),
      endsAt: at(context, days(1) + hours(1)),
      recurrence: "weekly",
      recurrenceUntil: at(context, days(60)),
      suppress: 0,
      cancelledAt: null,
      resources: [monitoring.endpointResourceId],
    },
    {
      id: completedId,
      name: "Daily database optimization",
      startsAt: at(context, -days(10)),
      endsAt: at(context, -days(10) + hours(1)),
      recurrence: "daily",
      recurrenceUntil: at(context, -days(2)),
      suppress: 1,
      cancelledAt: null,
      resources: [monitoring.serviceResourceId],
    },
    {
      id: cancelledId,
      name: "Monthly archive rotation",
      startsAt: at(context, days(7)),
      endsAt: at(context, days(7) + hours(2)),
      recurrence: "monthly",
      recurrenceUntil: at(context, days(180)),
      suppress: 1,
      cancelledAt: at(context, -hours(2)),
      resources: [monitoring.pausedResourceId],
    },
  ] as const;
  for (const [index, window] of windows.entries()) {
    await context.database.run(
      `INSERT INTO maintenance_windows
       (id, team_id, name, starts_at, ends_at, recurrence, recurrence_until,
        suppress_notifications, cancelled_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, starts_at = excluded.starts_at,
       ends_at = excluded.ends_at, recurrence = excluded.recurrence,
       recurrence_until = excluded.recurrence_until,
       suppress_notifications = excluded.suppress_notifications,
       cancelled_at = excluded.cancelled_at, updated_at = excluded.updated_at`,
      window.id,
      context.teamId,
      window.name,
      window.startsAt,
      window.endsAt,
      window.recurrence,
      window.recurrenceUntil,
      window.suppress,
      window.cancelledAt,
      context.userId,
      at(context, -days(30 - index * 3)),
      context.now.toISOString()
    );
    for (const resourceId of window.resources) {
      await context.database.run(
        `INSERT INTO maintenance_resources (maintenance_id, resource_id) VALUES (?, ?)
         ON CONFLICT(maintenance_id, resource_id) DO NOTHING`,
        window.id,
        resourceId
      );
    }
  }
  await context.database.run(
    `DELETE FROM maintenance_occurrence_events
     WHERE maintenance_id IN (?, ?, ?, ?)`,
    ids.activeMaintenanceId,
    ids.scheduledMaintenanceId,
    completedId,
    cancelledId
  );
  const occurrenceEvents = [
    {
      maintenanceId: ids.activeMaintenanceId,
      start: windows[0].startsAt,
      event: "started",
      offset: -minutes(30),
    },
    {
      maintenanceId: completedId,
      start: at(context, -days(3)),
      event: "started",
      offset: -days(3),
    },
    {
      maintenanceId: completedId,
      start: at(context, -days(3)),
      event: "completed",
      offset: -days(3) + hours(1),
    },
  ] as const;
  for (const event of occurrenceEvents) {
    await context.database.run(
      `INSERT INTO maintenance_occurrence_events
       (maintenance_id, occurrence_start, event, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(maintenance_id, occurrence_start, event) DO UPDATE SET created_at = excluded.created_at`,
      event.maintenanceId,
      event.start,
      event.event,
      at(context, event.offset)
    );
  }
}

async function seedObjectives(context: SeedContext, monitoring: SeedMonitoringIds): Promise<void> {
  const objectives = [
    {
      key: "met",
      name: "Customer API availability",
      resourceId: monitoring.endpointResourceId,
      checkId: monitoring.httpCheckId,
      target: 99.9,
      window: 30,
      latency: 500,
      state: "met",
    },
    {
      key: "at-risk",
      name: "Application host availability",
      resourceId: monitoring.serverResourceId,
      checkId: monitoring.hostCheckId,
      target: 90,
      window: 7,
      latency: null,
      state: "at-risk",
    },
    {
      key: "breached",
      name: "Database connectivity",
      resourceId: monitoring.serviceResourceId,
      checkId: monitoring.tcpCheckId,
      target: 99,
      window: 30,
      latency: 100,
      state: "breached",
    },
    {
      key: "no-data",
      name: "Preview readiness",
      resourceId: monitoring.pendingResourceId,
      checkId: monitoring.pendingCheckId,
      target: 99,
      window: 90,
      latency: null,
      state: "no-data",
    },
  ] as const;
  for (const [index, objective] of objectives.entries()) {
    await context.database.run(
      `INSERT INTO service_level_objectives
       (id, team_id, resource_id, check_id, name, target_percent, window_days,
        latency_target_ms, breach_state, last_evaluated_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET resource_id = excluded.resource_id,
       check_id = excluded.check_id, name = excluded.name,
       target_percent = excluded.target_percent, window_days = excluded.window_days,
       latency_target_ms = excluded.latency_target_ms, breach_state = excluded.breach_state,
       last_evaluated_at = excluded.last_evaluated_at, updated_at = excluded.updated_at`,
      seedId(context, `objective:${objective.key}`),
      context.teamId,
      objective.resourceId,
      objective.checkId,
      objective.name,
      objective.target,
      objective.window,
      objective.latency,
      objective.state,
      context.now.toISOString(),
      context.userId,
      at(context, -days(45 - index * 5)),
      context.now.toISOString()
    );
  }
}
