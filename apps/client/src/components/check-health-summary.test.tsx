import type { CheckSummary } from "@mimorii/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CheckHealthSummary } from "./check-health-summary";

describe("CheckHealthSummary", () => {
  afterEach(cleanup);

  it("does not repeat the same update finding as a count", () => {
    render(
      <CheckHealthSummary
        check={{
          type: "host",
          timeoutMs: 30_000,
          config: hostConfig,
          lastLatencyMs: null,
          latestMetrics: {
            cpuPercent: 10,
            memoryPercent: 20,
            "maintenance.securityUpdates.status": "critical",
            pendingSecurityUpdateCount: 2,
          },
        }}
      />
    );
    expect(screen.getAllByText("Security updates")).toHaveLength(1);
    expect(screen.getByText("Critical")).toHaveClass("text-danger");
  });

  it("shows unavailable maintenance alongside a critical resource metric", () => {
    render(
      <CheckHealthSummary
        check={{
          type: "host",
          timeoutMs: 30_000,
          config: hostConfig,
          lastLatencyMs: null,
          latestMetrics: {
            cpuPercent: 10,
            memoryPercent: 20,
            swapPercent: 99,
            "maintenance.securityUpdates.status": "unavailable",
            "maintenance.securityUpdates.detail": "No update data",
            "maintenance.security.status": "okay",
          },
        }}
      />
    );
    expect(screen.getByText("Unavailable")).toHaveClass("text-warning-strong");
    expect(screen.getByText("99%")).toHaveClass("text-danger");
  });

  it("prioritizes the host metric that crossed its threshold", () => {
    render(
      <CheckHealthSummary
        check={{
          type: "host",
          timeoutMs: 5_000,
          config: hostConfig,
          lastLatencyMs: null,
          latestMetrics: {
            cpuPercent: 35,
            memoryPercent: 62,
            loadAverage: 9,
            swapPercent: 4,
          },
        }}
      />
    );

    expect(screen.getByText("Load average")).toBeInTheDocument();
    expect(screen.getByText("9")).toHaveClass("text-danger");
    expect(screen.queryByText("Memory")).not.toBeInTheDocument();
  });
});

const hostConfig: Extract<CheckSummary["config"], { cpuWarningPercent: number }> = {
  cpuWarningPercent: 80,
  cpuCriticalPercent: 95,
  memoryWarningPercent: 80,
  memoryCriticalPercent: 95,
  loadWarning: 4,
  loadCritical: 8,
  swapWarningPercent: 80,
  swapCriticalPercent: 95,
};
