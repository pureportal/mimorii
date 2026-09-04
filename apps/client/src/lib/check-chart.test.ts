import type { CheckSummary } from "@mimorii/contracts";
import { describe, expect, it } from "vitest";
import {
  checkMetricThresholdSeverity,
  checkMetricThresholds,
  createCheckMetricChartPoints,
} from "./check-chart";

describe("check chart indicators", () => {
  it("maps host warning and critical thresholds to their metric", () => {
    const check = hostCheck();

    expect(checkMetricThresholds(check, "cpuPercent")).toEqual([
      { value: 80, severity: "warning", comparison: "greaterThanOrEqual" },
      { value: 95, severity: "critical", comparison: "greaterThanOrEqual" },
    ]);
    expect(checkMetricThresholds(check, "memoryPercent")).toEqual([
      { value: 85, severity: "warning", comparison: "greaterThanOrEqual" },
      { value: 98, severity: "critical", comparison: "greaterThanOrEqual" },
    ]);
    expect(checkMetricThresholds(check, "processCount")).toEqual([]);
  });

  it("uses the check runner's exact inclusive and strict comparisons", () => {
    const hostThresholds = checkMetricThresholds(hostCheck(), "cpuPercent");
    expect(checkMetricThresholdSeverity(80, hostThresholds)).toBe("warning");
    expect(checkMetricThresholdSeverity(95, hostThresholds)).toBe("critical");

    const icmp = {
      ...hostCheck(),
      type: "icmp" as const,
      config: {
        target: { host: "1.1.1.1" },
        packetCount: 3,
        minimumSuccessPercent: 90,
      },
    };
    const packetLossThresholds = checkMetricThresholds(icmp, "packetLossPercent");
    expect(checkMetricThresholdSeverity(10, packetLossThresholds)).toBeNull();
    expect(checkMetricThresholdSeverity(10.1, packetLossThresholds)).toBe("critical");
  });

  it("keeps breach ranges separate and preserves the exact alarm sample", () => {
    const thresholds = checkMetricThresholds(hostCheck(), "cpuPercent");
    const points = createCheckMetricChartPoints(
      [
        metricPoint("2026-09-04T10:00:00.000Z", 70),
        metricPoint("2026-09-04T10:01:00.000Z", 84),
        metricPoint("2026-09-04T10:02:00.000Z", 88),
        metricPoint("2026-09-04T10:03:00.000Z", 97, "incident-1"),
        metricPoint("2026-09-04T10:04:00.000Z", 99),
        metricPoint("2026-09-04T10:05:00.000Z", 72),
      ],
      thresholds
    );

    expect(points.map(({ warningValue, criticalValue }) => [warningValue, criticalValue])).toEqual([
      [null, null],
      [84, null],
      [88, null],
      [null, 97],
      [null, 99],
      [null, null],
    ]);
    expect(points.filter((point) => point.warningBoundary).map((point) => point.value)).toEqual([
      84, 88,
    ]);
    expect(points.filter((point) => point.criticalBoundary).map((point) => point.value)).toEqual([
      97, 99,
    ]);
    expect(points.find((point) => point.triggeredIncidentId)?.checkedAt).toBe(
      "2026-09-04T10:03:00.000Z"
    );
  });

  it("maps lower-is-worse certificate thresholds", () => {
    const check = {
      ...hostCheck(),
      type: "http" as const,
      timeoutMs: 4_000,
      config: {
        target: { url: "https://example.com/", method: "GET" as const },
        expectedStatuses: [200],
        certificateWarningDays: 30,
        followRedirects: true,
        validateTls: true,
      },
    };
    const thresholds = checkMetricThresholds(check, "certificateDaysRemaining");

    expect(checkMetricThresholdSeverity(20, thresholds)).toBe("warning");
    expect(checkMetricThresholdSeverity(0, thresholds)).toBe("critical");
    expect(checkMetricThresholdSeverity(31, thresholds)).toBeNull();
  });
});

function metricPoint(checkedAt: string, value: number, triggeredIncidentId: string | null = null) {
  return { checkedAt, value, triggeredIncidentId };
}

function hostCheck(): Pick<CheckSummary, "type" | "config" | "timeoutMs"> {
  return {
    type: "host",
    timeoutMs: 5_000,
    config: {
      cpuWarningPercent: 80,
      cpuCriticalPercent: 95,
      memoryWarningPercent: 85,
      memoryCriticalPercent: 98,
      loadWarning: 4,
      loadCritical: 8,
      swapWarningPercent: 75,
      swapCriticalPercent: 90,
    },
  };
}
