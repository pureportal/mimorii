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
  status: "okay",
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
const diskCheck: CheckSummary = {
  ...createCheck("check-disk", "Disk usage", true),
  type: "disk",
  status: "critical",
  config: { mount: "C:", warningPercent: 85, criticalPercent: 95 },
  execution: { kind: "agent", agentId: "agent-1" },
  lastLatencyMs: null,
  latestMetrics: { mount: "C:", usedPercent: 97.3 },
};
const staleCheck: CheckSummary = {
  ...createCheck("check-stale", "Offline host", true),
  type: "host",
  status: "down",
  config: healthCheck.config,
  execution: { kind: "agent", agentId: "agent-1" },
  lastLatencyMs: null,
  latestMetrics: { agentTimeout: true },
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
        return Promise.resolve([enabledCheck, pausedCheck, healthCheck, diskCheck, staleCheck]);
      if (path === "/teams/team-1/resources") return Promise.resolve([resource]);
      if (path === "/teams/team-1/checks/check-health/history?limit=500")
        return Promise.resolve(healthHistory);
      return Promise.resolve(undefined);
    });
  });

  afterEach(cleanup);

  it("groups check actions in an accessible menu", async () => {
    renderPage();

    fireEvent.pointerDown(await screen.findByRole("button", { name: "Actions for Availability" }), {
      button: 0,
      ctrlKey: false,
    });
    const menu = await screen.findByRole("menu");
    const run = within(menu).getByRole("menuitem", { name: "Run now" });
    const edit = within(menu).getByRole("menuitem", { name: "Edit" });
    const pause = within(menu).getByRole("menuitem", { name: "Pause" });
    const remove = within(menu).getByRole("menuitem", { name: "Delete" });

    expect(run.querySelector(".lucide-refresh-cw")).toBeInTheDocument();
    expect(edit.querySelector(".lucide-pencil")).toBeInTheDocument();
    expect(pause.querySelector(".lucide-pause")).toBeInTheDocument();
    expect(remove.querySelector(".lucide-trash-2")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions for Certificate" }), {
      button: 0,
      ctrlKey: false,
    });
    const enable = await screen.findByRole("menuitem", { name: "Enable" });
    expect(enable.querySelector(".lucide-play")).toBeInTheDocument();
  });

  it("keeps the run and pause actions connected to their existing endpoints", async () => {
    renderPage();

    fireEvent.pointerDown(await screen.findByRole("button", { name: "Actions for Availability" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Run now" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith("/teams/team-1/checks/check-enabled/run", {
        method: "POST",
      })
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions for Availability" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Pause" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith("/teams/team-1/checks/check-enabled", {
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
      })
    );
  });

  it("shows useful health data for HTTP and multi-metric host checks", async () => {
    renderPage();

    const availabilityRow = (await screen.findByText("Availability")).closest("article");
    const healthRow = screen.getByText("Health", { selector: "p" }).closest("article");

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

  it("shows evaluated health separately from a stale reporter", async () => {
    renderPage();

    const okayRow = (await screen.findByText("Availability")).closest("article");
    const criticalRow = screen.getByText("Disk usage").closest("article");
    const downRow = screen.getByText("Offline host").closest("article");

    expect(within(okayRow!).getByText("okay")).toBeInTheDocument();
    expect(within(criticalRow!).getByText("critical")).toBeInTheDocument();
    expect(within(criticalRow!).queryByText("down")).not.toBeInTheDocument();
    expect(within(downRow!).getByText("down")).toBeInTheDocument();
  });

  it("opens check details with CPU and memory history", async () => {
    renderPage();

    fireEvent.pointerDown(await screen.findByRole("button", { name: "Actions for Health" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: "View details" }));

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
    status: enabled ? "okay" : "paused",
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
