import type { CheckResult, CheckSummary, ResourceSummary } from "@mimorii/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ChecksPage } from "./checks-page";

const { apiMock, useAuthMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  api: apiMock,
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));

vi.mock("../lib/auth", () => ({ useAuth: useAuthMock }));

const resource: ResourceSummary = {
  id: "resource-1",
  teamId: "team-1",
  name: "Public API",
  kind: "service",
  description: null,
  tags: [],
  agent: null,
  status: "up",
  checksUp: 1,
  checksTotal: 2,
  lastCheckedAt: "2026-08-24T08:00:00.000Z",
  inMaintenance: false,
  imageUpdatedAt: null,
  createdAt: "2026-08-20T08:00:00.000Z",
};

const enabledCheck = createCheck("check-enabled", "Availability", true);
const pausedCheck = createCheck("check-paused", "Certificate", false);
const healthCheck: CheckSummary = {
  ...createCheck("check-health", "Health", true),
  type: "host",
  config: {
    cpuWarningPercent: 80,
    cpuCriticalPercent: 95,
    memoryWarningPercent: 80,
    memoryCriticalPercent: 95,
    loadWarning: 4,
    loadCritical: 8,
    swapWarningPercent: 80,
    swapCriticalPercent: 95,
    storage: [{ mount: "/", warningPercent: 85, criticalPercent: 95 }],
  },
  execution: { kind: "agent", agentId: "agent-1" },
  lastLatencyMs: null,
  latestMetrics: {
    cpuPercent: 35,
    memoryPercent: 62,
    loadAverage: 1.2,
    swapPercent: 4,
  },
};

const healthHistory: CheckResult[] = [
  result("2026-08-24T08:01:00.000Z", { cpuPercent: 35, memoryPercent: 62 }),
  result("2026-08-24T08:00:00.000Z", { cpuPercent: 25, memoryPercent: 52 }),
];

describe("ChecksPage actions", () => {
  beforeEach(() => {
    apiMock.mockReset();
    useAuthMock.mockReturnValue({ activeTeam: { id: "team-1" } });
    apiMock.mockImplementation((path: string) => {
      if (path === "/teams/team-1/checks")
        return Promise.resolve([enabledCheck, pausedCheck, healthCheck]);
      if (path === "/teams/team-1/resources") return Promise.resolve([resource]);
      if (path === "/teams/team-1/checks/check-health/history?limit=500")
        return Promise.resolve(healthHistory);
      return Promise.resolve(undefined);
    });
  });

  afterEach(cleanup);

  it("uses direct icons for running, editing, pausing, enabling, and deleting checks", async () => {
    renderPage();

    const run = await screen.findByRole("button", { name: "Run Availability now" });
    const edit = screen.getByRole("button", { name: "Edit Availability" });
    const pause = screen.getByRole("button", { name: "Pause Availability" });
    const enable = screen.getByRole("button", { name: "Enable Certificate" });
    const remove = screen.getByRole("button", { name: "Delete Availability" });

    expect(run.querySelector(".lucide-refresh-cw")).toBeInTheDocument();
    expect(edit.querySelector(".lucide-pencil")).toBeInTheDocument();
    expect(pause.querySelector(".lucide-pause")).toBeInTheDocument();
    expect(enable.querySelector(".lucide-play")).toBeInTheDocument();
    expect(remove.querySelector(".lucide-trash-2")).toBeInTheDocument();
  });

  it("keeps the run and pause actions connected to their existing endpoints", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Run Availability now" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith("/teams/team-1/checks/check-enabled/run", {
        method: "POST",
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Pause Availability" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith("/teams/team-1/checks/check-enabled", {
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
      })
    );
  });

  it("shows useful health data for HTTP and multi-metric host checks", async () => {
    renderPage();

    const availabilityRow = (await screen.findByText("Availability")).closest("tr");
    const healthRow = screen.getByText("Health", { selector: "p" }).closest("tr");

    expect(availabilityRow).not.toBeNull();
    expect(healthRow).not.toBeNull();
    expect(within(availabilityRow!).getByText("Latency")).toBeInTheDocument();
    expect(within(availabilityRow!).getByText("42 ms")).toBeInTheDocument();
    expect(within(healthRow!).getByText("CPU")).toBeInTheDocument();
    expect(within(healthRow!).getByText("35%")).toBeInTheDocument();
    expect(within(healthRow!).getByText("Memory")).toBeInTheDocument();
    expect(within(healthRow!).getByText("62%")).toBeInTheDocument();
    expect(within(healthRow!).getByRole("progressbar", { name: "CPU" })).toHaveAttribute(
      "aria-valuenow",
      "35"
    );
  });

  it("opens check details with CPU and memory history", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Show details for Health" }));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("heading", { name: "History" })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "CPU" })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Memory" })).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/teams/team-1/checks/check-health/history?limit=500");
  });
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ChecksPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

function result(
  checkedAt: string,
  metrics: Record<string, number | string | boolean | null>
): CheckResult {
  return {
    id: checkedAt,
    checkId: healthCheck.id,
    status: "up",
    latencyMs: null,
    statusCode: null,
    message: null,
    metrics,
    checkedAt,
  };
}

function createCheck(id: string, name: string, enabled: boolean): CheckSummary {
  return {
    id,
    resourceId: resource.id,
    teamId: resource.teamId,
    name,
    type: "http",
    status: enabled ? "up" : "paused",
    enabled,
    intervalSeconds: 60,
    timeoutMs: 5_000,
    failureThreshold: 2,
    recoveryThreshold: 2,
    config: {
      target: { url: "https://example.com/health", method: "GET" },
      expectedStatuses: [200],
      followRedirects: true,
      validateTls: true,
    },
    execution: { kind: "direct" },
    secretConfigured: false,
    consecutiveFailures: 0,
    lastCheckedAt: "2026-08-24T08:00:00.000Z",
    nextCheckAt: enabled ? "2026-08-24T08:01:00.000Z" : null,
    lastLatencyMs: 42,
    latestMetrics: { responseBytes: 128 },
    uptime24h: 100,
    uptime30d: 99.9,
    createdAt: "2026-08-20T08:00:00.000Z",
  };
}
