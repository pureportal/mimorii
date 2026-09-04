import type { CheckSummary } from "@mimorii/contracts";

export type CheckMetricThresholdComparison =
  | "greaterThan"
  | "greaterThanOrEqual"
  | "lessThan"
  | "lessThanOrEqual";

export interface CheckMetricThreshold {
  value: number;
  severity: "warning" | "critical";
  comparison: CheckMetricThresholdComparison;
}

export interface CheckMetricChartPoint {
  checkedAt: string;
  value: number;
  triggeredIncidentId: string | null;
  warningValue: number | null;
  criticalValue: number | null;
  warningBoundary: boolean;
  criticalBoundary: boolean;
}

type ThresholdCheck = Pick<CheckSummary, "type" | "config" | "timeoutMs">;
type ThresholdSeverity = CheckMetricThreshold["severity"] | null;

export function checkMetricThresholds(
  check: ThresholdCheck,
  metric: string
): CheckMetricThreshold[] {
  switch (check.type) {
    case "http": {
      const config =
        "expectedStatuses" in check.config ? check.config : invalidCheckConfig(check.type);
      if (metric === "latencyMs") {
        return [warning(config.latencyWarningMs ?? Math.round(check.timeoutMs * 0.75))];
      }
      if (metric === "certificateDaysRemaining" && config.certificateWarningDays !== undefined) {
        return [
          warning(config.certificateWarningDays, "lessThanOrEqual"),
          critical(0, "lessThanOrEqual"),
        ];
      }
      return [];
    }
    case "tcp":
      return metric === "latencyMs" ? [warning(check.timeoutMs * 0.75)] : [];
    case "dns":
      return [];
    case "icmp": {
      const config =
        "minimumSuccessPercent" in check.config ? check.config : invalidCheckConfig(check.type);
      if (metric === "latencyMs" && config.latencyWarningMs !== undefined) {
        return [warning(config.latencyWarningMs)];
      }
      return metric === "packetLossPercent"
        ? [critical(100 - config.minimumSuccessPercent, "greaterThan")]
        : [];
    }
    case "wan": {
      const config =
        "requiredSuccessfulTargets" in check.config ? check.config : invalidCheckConfig(check.type);
      if (
        (metric === "latencyMs" || metric === "averageLatencyMs") &&
        config.latencyWarningMs !== undefined
      ) {
        return [warning(config.latencyWarningMs)];
      }
      return metric === "reachableTargets"
        ? [critical(config.requiredSuccessfulTargets, "lessThan")]
        : [];
    }
    case "host": {
      const config =
        "cpuCriticalPercent" in check.config ? check.config : invalidCheckConfig(check.type);
      const values: Partial<Record<string, [number, number]>> = {
        cpuPercent: [config.cpuWarningPercent, config.cpuCriticalPercent],
        memoryPercent: [config.memoryWarningPercent, config.memoryCriticalPercent],
        swapPercent: [config.swapWarningPercent, config.swapCriticalPercent],
        ...(config.loadWarning === undefined || config.loadCritical === undefined
          ? {}
          : { loadAverage: [config.loadWarning, config.loadCritical] }),
      };
      const thresholds = values[metric];
      return thresholds ? [warning(thresholds[0]), critical(thresholds[1])] : [];
    }
    case "disk": {
      const config =
        "warningPercent" in check.config ? check.config : invalidCheckConfig(check.type);
      return metric === "usedPercent"
        ? [warning(config.warningPercent), critical(config.criticalPercent)]
        : [];
    }
    case "docker":
      return [];
    case "database": {
      const config =
        "connectionWarningPercent" in check.config ? check.config : invalidCheckConfig(check.type);
      if (metric === "connectionUtilizationPercent") {
        return [warning(config.connectionWarningPercent)];
      }
      if (metric === "replicationLagSeconds" && config.replicationLagWarningSeconds !== undefined) {
        return [warning(config.replicationLagWarningSeconds)];
      }
      if (metric === "slowQueries" && config.slowQueryWarningCount !== undefined) {
        return [warning(config.slowQueryWarningCount)];
      }
      return [];
    }
  }
  return [];
}

export function checkMetricThresholdSeverity(
  value: number,
  thresholds: CheckMetricThreshold[]
): ThresholdSeverity {
  if (
    thresholds.some((threshold) => threshold.severity === "critical" && exceeds(value, threshold))
  ) {
    return "critical";
  }
  return thresholds.some(
    (threshold) => threshold.severity === "warning" && exceeds(value, threshold)
  )
    ? "warning"
    : null;
}

export function createCheckMetricChartPoints(
  points: Array<{
    checkedAt: string;
    value: number;
    triggeredIncidentId: string | null;
  }>,
  thresholds: CheckMetricThreshold[]
): CheckMetricChartPoint[] {
  const severities = points.map((point) => checkMetricThresholdSeverity(point.value, thresholds));
  return points.map((point, index) => {
    const severity = severities[index];
    const boundary =
      severity !== null &&
      (severities[index - 1] !== severity || severities[index + 1] !== severity);
    return {
      ...point,
      warningValue: severity === "warning" ? point.value : null,
      criticalValue: severity === "critical" ? point.value : null,
      warningBoundary: severity === "warning" && boundary,
      criticalBoundary: severity === "critical" && boundary,
    };
  });
}

function warning(
  value: number,
  comparison: CheckMetricThresholdComparison = "greaterThanOrEqual"
): CheckMetricThreshold {
  return { value, severity: "warning", comparison };
}

function critical(
  value: number,
  comparison: CheckMetricThresholdComparison = "greaterThanOrEqual"
): CheckMetricThreshold {
  return { value, severity: "critical", comparison };
}

function exceeds(value: number, threshold: CheckMetricThreshold): boolean {
  switch (threshold.comparison) {
    case "greaterThan":
      return value > threshold.value;
    case "greaterThanOrEqual":
      return value >= threshold.value;
    case "lessThan":
      return value < threshold.value;
    case "lessThanOrEqual":
      return value <= threshold.value;
  }
  return false;
}

function invalidCheckConfig(type: CheckSummary["type"]): never {
  throw new Error(`${type} check configuration is invalid`);
}
