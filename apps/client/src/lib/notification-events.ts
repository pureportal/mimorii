import type { NotificationEvent } from "@mimorii/contracts";

export const notificationEventLabels: Record<NotificationEvent, string> = {
  "incident.opened": "Incident opened",
  "incident.updated": "Incident updated",
  "incident.resolved": "Incident resolved",
  "check.degraded": "Check degraded",
  "check.recovered": "Check recovered",
  "maintenance.started": "Maintenance started",
  "maintenance.completed": "Maintenance completed",
  "slo.breached": "SLO breached",
  "resource.alert.triggered": "Resource alert triggered",
  "resource.alert.recovered": "Resource alert recovered",
};
