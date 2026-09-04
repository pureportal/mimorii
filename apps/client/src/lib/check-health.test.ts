import type { CheckResult, CheckSummary } from "@mimorii/contracts";
import { describe, expect, it } from "vitest";
import {
  checkMetricScale,
  createCheckHistorySeries,
  getCheckHealthItems,
  prioritizeCheckHistorySeries,
} from "./check-health";

describe("check health presentation", () => {
  it("uses latency and response size for HTTP checks", () => {
    expect(
      getCheckHealthItems({
        type: "http",
        lastLatencyMs: 42,
        latestMetrics: { responseBytes: 2_048 },
      })
    ).toEqual([
      { key: "latencyMs", label: "Latency", value: "42 ms" },
      { key: "responseBytes", label: "Response size", value: "2 KB" },
    ]);
  });

  it("uses CPU and memory for host checks", () => {
    expect(
      getCheckHealthItems({
        type: "host",
        lastLatencyMs: null,
        latestMetrics: { cpuPercent: 35.25, memoryPercent: 62.4, loadAverage: 1.2 },
      })
    ).toEqual([
      { key: "cpuPercent", label: "CPU", value: "35.3%", percent: 35.25 },
      { key: "memoryPercent", label: "Memory", value: "62.4%", percent: 62.4 },
    ]);
  });

  it.each([
    ["tcp", 12, { port: 443 }],
    ["dns", 8, { recordCount: 2 }],
    ["icmp", 14, { packetLossPercent: 0 }],
    ["wan", 21, { reachableTargets: 2, targetCount: 3 }],
    ["wan", 21, { successfulTargets: 2, targetCount: 3 }],
    ["docker", null, { runningContainerCount: 3, containerCount: 3 }],
    ["database", 6, { connectionUtilizationPercent: 18, replicationLagSeconds: 0 }],
  ] as const)("provides a health summary for %s checks", (type, lastLatencyMs, latestMetrics) => {
    expect(getCheckHealthItems({ type, lastLatencyMs, latestMetrics }).length).toBeGreaterThan(0);
  });

  it("creates chronological CPU and memory time series for host details", () => {
    const series = createCheckHistorySeries("host", [
      result("2026-08-24T08:00:00.000Z", { cpuPercent: 25, memoryPercent: 52 }),
      result("2026-08-24T08:01:00.000Z", { cpuPercent: 35, memoryPercent: 62 }),
    ]);

    expect(series.slice(0, 2)).toEqual([
      {
        key: "cpuPercent",
        label: "CPU",
        points: [
          {
            checkedAt: "2026-08-24T08:00:00.000Z",
            value: 25,
            triggeredIncidentId: null,
          },
          {
            checkedAt: "2026-08-24T08:01:00.000Z",
            value: 35,
            triggeredIncidentId: null,
          },
        ],
      },
      {
        key: "memoryPercent",
        label: "Memory",
        points: [
          {
            checkedAt: "2026-08-24T08:00:00.000Z",
            value: 52,
            triggeredIncidentId: null,
          },
          {
            checkedAt: "2026-08-24T08:01:00.000Z",
            value: 62,
            triggeredIncidentId: null,
          },
        ],
      },
    ]);
  });

  it("separates history metrics with incompatible scales", () => {
    expect(checkMetricScale("usedPercent")).toBe("percent");
    expect(checkMetricScale("usedBytes")).toBe("bytes");
    expect(checkMetricScale("latencyMs")).toBe("milliseconds");
    expect(checkMetricScale("replicationLagSeconds")).toBe("seconds");
    expect(checkMetricScale("containerCount")).toBe("number");
    expect(checkMetricScale("cpuPercent")).toBe(checkMetricScale("memoryPercent"));
  });

  it("puts the host metric with a critical breach first", () => {
    const check = {
      type: "host" as const,
      timeoutMs: 5_000,
      config: {
        cpuWarningPercent: 80,
        cpuCriticalPercent: 95,
        memoryWarningPercent: 80,
        memoryCriticalPercent: 95,
        loadWarning: 4,
        loadCritical: 8,
        swapWarningPercent: 80,
        swapCriticalPercent: 95,
      },
    };
    const results = [
      result("2026-08-24T08:00:00.000Z", {
        cpuPercent: 25,
        memoryPercent: 52,
        loadAverage: 9,
      }),
    ];

    expect(
      prioritizeCheckHistorySeries(check, createCheckHistorySeries("host", results))[0]?.key
    ).toBe("loadAverage");
  });
});

function result(checkedAt: string, metrics: CheckSummary["latestMetrics"]): CheckResult {
  return {
    id: checkedAt,
    checkId: "check-1",
    triggeredIncidentId: null,
    status: "up",
    latencyMs: null,
    statusCode: null,
    message: null,
    metrics,
    checkedAt,
  };
}
