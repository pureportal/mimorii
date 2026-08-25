import type { OverviewAnalytics, ResourceSummary } from "@mimorii/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { OverviewPage } from "./overview-page";

const { apiMock, useAuthMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock("../lib/api", () => ({ api: apiMock }));
vi.mock("../lib/auth", () => ({ useAuth: useAuthMock }));

const resource: ResourceSummary = {
  id: "resource-1",
  teamId: "team-1",
  name: "Disk host",
  kind: "host",
  description: null,
  tags: [],
  agent: null,
  status: "critical",
  checksUp: 0,
  checksTotal: 1,
  lastCheckedAt: "2026-08-25T12:00:00.000Z",
  inMaintenance: false,
  imageUpdatedAt: null,
  createdAt: "2026-08-25T11:00:00.000Z",
};

const analytics: OverviewAnalytics = {
  resources: 1,
  checks: 1,
  heartbeats: 0,
  heartbeatsUp: 0,
  heartbeatsDown: 0,
  up: 0,
  degraded: 0,
  down: 1,
  paused: 0,
  uptime24h: 97,
  uptime30d: 99,
  averageLatencyMs: null,
  openIncidents: 0,
  activeMaintenance: 0,
  breachedObjectives: 0,
  statusTimeline: [],
  latencyTimeline: [],
  incidents: [],
};

describe("OverviewPage", () => {
  beforeEach(() => {
    apiMock.mockReset();
    useAuthMock.mockReturnValue({ activeTeam: { id: "team-1", name: "Team" } });
    apiMock.mockImplementation((path: string) => {
      if (path === "/teams/team-1/analytics/overview") return Promise.resolve(analytics);
      if (path === "/teams/team-1/resources") return Promise.resolve([resource]);
      return Promise.reject(new Error(`Unexpected API request: ${path}`));
    });
  });

  afterEach(cleanup);

  it("shows critical resource health in the current-state overview", async () => {
    renderPage();

    const row = (await screen.findByText("Disk host")).closest("a");
    expect(row).toHaveTextContent("critical");
    expect(row).not.toHaveTextContent("down");
  });
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <OverviewPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}
