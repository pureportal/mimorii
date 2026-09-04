import type { CheckSummary } from "@mimorii/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CheckHealthSummary } from "./check-health-summary";

describe("CheckHealthSummary", () => {
  afterEach(cleanup);

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
