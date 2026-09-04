import type { CheckSummary } from "@mimorii/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { CheckMetricHistoryCard } from "./check-metric-history-card";

vi.mock("recharts", () => ({
  CartesianGrid: () => null,
  Line: () => null,
  LineChart: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ReferenceArea: () => null,
  ReferenceDot: ({
    x,
    y,
    yAxisId,
    role,
    label,
    ...properties
  }: {
    x: string;
    y: number;
    yAxisId: string;
    role?: string;
    label?: { value?: string };
    "aria-label"?: string;
  }) => (
    <span
      role={role}
      aria-label={properties["aria-label"]}
      data-testid={role === "img" ? "alarm-marker" : "breach-marker"}
      data-x={x}
      data-y={y}
      data-axis={yAxisId}
    >
      {label?.value}
    </span>
  ),
  ReferenceLine: ({
    y,
    yAxisId,
    label,
  }: {
    y: number;
    yAxisId: string;
    label: { value: string };
  }) => (
    <span data-testid="threshold-line" data-y={y} data-axis={yAxisId}>
      {label.value}
    </span>
  ),
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

describe("CheckMetricHistoryCard", () => {
  afterEach(cleanup);

  it("places threshold lines and the alarm marker on the exact metric sample", () => {
    render(
      <CheckMetricHistoryCard
        check={hostCheck}
        series={{
          key: "cpuPercent",
          label: "CPU",
          points: [
            metricPoint("2026-09-04T10:00:00.000Z", 70),
            metricPoint("2026-09-04T10:01:00.000Z", 84),
            metricPoint("2026-09-04T10:02:00.000Z", 97, "incident-1"),
          ],
        }}
      />
    );

    expect(screen.getByText("Warning 80%")).toHaveAttribute("data-axis", "percent");
    expect(screen.getByText("Critical 95%")).toHaveAttribute("data-axis", "percent");
    expect(screen.getByRole("img", { name: /Incident alarm at/ })).toHaveAttribute(
      "data-x",
      "2026-09-04T10:02:00.000Z"
    );
    expect(screen.getByTestId("alarm-marker")).toHaveAttribute("data-y", "97");
    expect(screen.getByTestId("alarm-marker")).toHaveAttribute("data-axis", "percent");
  });
});

const hostCheck: CheckSummary = {
  id: "check-1",
  resourceId: "resource-1",
  teamId: "team-1",
  name: "Host health",
  type: "host",
  status: "critical",
  enabled: true,
  intervalSeconds: 60,
  timeoutMs: 5_000,
  failureThreshold: 2,
  recoveryThreshold: 1,
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
  execution: { kind: "agent", agentId: "agent-1" },
  secretConfigured: false,
  consecutiveFailures: 2,
  lastCheckedAt: "2026-09-04T10:02:00.000Z",
  nextCheckAt: "2026-09-04T10:03:00.000Z",
  lastLatencyMs: null,
  latestMetrics: { cpuPercent: 97 },
  passing24h: 99,
  passing30d: 99.9,
  createdAt: "2026-09-01T10:00:00.000Z",
};

function metricPoint(checkedAt: string, value: number, triggeredIncidentId: string | null = null) {
  return { checkedAt, value, triggeredIncidentId };
}
