import { hostMaintenanceChecks, type CheckSummary } from "@mimorii/contracts";

const findingMetrics: Partial<Record<(typeof hostMaintenanceChecks)[number]["key"], string>> = {
  securityUpdates: "pendingSecurityUpdateCount",
  softwareUpdates: "pendingUpdateCount",
  updateData: "updateDataAgeHours",
  failedServices: "failedServiceCount",
};

export function hostMaintenanceFindings(metrics: CheckSummary["latestMetrics"]) {
  return hostMaintenanceChecks.flatMap(({ key, label }) => {
    const metric = `maintenance.${key}.status`;
    const status = metrics[metric];
    if (
      status !== "okay" &&
      status !== "warning" &&
      status !== "critical" &&
      status !== "unavailable"
    )
      return [];
    const detail = metrics[`maintenance.${key}.detail`];
    return [
      {
        key: metric,
        label,
        status,
        metric: findingMetrics[key],
        detail: typeof detail === "string" ? detail : "",
      },
    ];
  });
}
