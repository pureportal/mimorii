import type { AnalyticsReport, CheckSummary, ResourceSummary } from "@mimorii/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsPage } from "./analytics-page";

const { apiMock, useAuthMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock("../lib/api", () => ({ api: apiMock }));
vi.mock("../lib/auth", () => ({ useAuth: useAuthMock }));

const resources = [resource("resource-storefront", "Storefront"), resource("resource-api", "API")];
const checks = [
  check("check-storefront", "resource-storefront"),
  check("check-api", "resource-api"),
];
const report: AnalyticsReport = {
  from: "2026-08-01T00:00:00.000Z",
  to: "2026-08-28T23:59:59.999Z",
  totalResults: 24,
  availabilityPercent: 99.9,
  degradedPercent: 0.1,
  latencyP50Ms: 48,
  latencyP95Ms: 82,
  latencyP99Ms: 105,
  meanTimeToRecoverySeconds: null,
  meanTimeBetweenFailuresSeconds: null,
  incidentCount: 0,
  daily: [
    {
      date: "2026-08-28",
      up: 23,
      degraded: 1,
      down: 0,
      availabilityPercent: 100,
      averageLatencyMs: 52,
    },
  ],
};

describe("AnalyticsPage", () => {
  beforeEach(() => {
    apiMock.mockReset();
    useAuthMock.mockReturnValue({ activeTeam: { id: "team-1" } });
    apiMock.mockImplementation((path: string) => {
      if (path === "/teams/team-1/resources") return Promise.resolve(resources);
      if (path === "/teams/team-1/checks") return Promise.resolve(checks);
      if (path.startsWith("/teams/team-1/analytics/report?")) return Promise.resolve(report);
      return Promise.reject(new Error(`Unexpected API request: ${path}`));
    });
  });

  afterEach(cleanup);

  it("identifies checks by resource when the report spans all resources", async () => {
    renderPage();

    const checkSelect = await screen.findByRole("combobox", { name: "Check" });
    expect(
      within(checkSelect).getByRole("option", { name: "HTTP availability · Storefront" })
    ).toBeInTheDocument();
    expect(
      within(checkSelect).getByRole("option", { name: "HTTP availability · API" })
    ).toBeInTheDocument();

    fireEvent.change(checkSelect, { target: { value: "check-storefront" } });

    expect(await screen.findByRole("combobox", { name: "Resource" })).toHaveDisplayValue(
      "Storefront"
    );
    expect(await screen.findByRole("combobox", { name: "Check" })).toHaveDisplayValue(
      "HTTP availability"
    );
  });

  it("keeps the selected resource and its checks clear", async () => {
    renderPage();

    fireEvent.change(await screen.findByRole("combobox", { name: "Resource" }), {
      target: { value: "resource-api" },
    });

    expect(await screen.findByRole("combobox", { name: "Resource" })).toHaveDisplayValue("API");
    const checkSelect = await screen.findByRole("combobox", { name: "Check" });
    expect(checkSelect).toHaveDisplayValue("All checks");
    expect(
      within(checkSelect).getByRole("option", { name: "HTTP availability" })
    ).toBeInTheDocument();
    expect(
      within(checkSelect).queryByRole("option", { name: /Storefront/ })
    ).not.toBeInTheDocument();
  });
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnalyticsPage />
    </QueryClientProvider>
  );
}

function resource(id: string, name: string): ResourceSummary {
  return {
    id,
    teamId: "team-1",
    name,
    kind: "service",
    description: null,
    tags: [],
    agent: null,
    status: "okay",
    checksPassing: 1,
    checksTotal: 1,
    lastCheckedAt: "2026-08-28T12:00:00.000Z",
    inMaintenance: false,
    imageUpdatedAt: null,
    createdAt: "2026-08-01T12:00:00.000Z",
  };
}

function check(id: string, resourceId: string): CheckSummary {
  return {
    id,
    resourceId,
    teamId: "team-1",
    name: "HTTP availability",
    type: "http",
    status: "up",
    enabled: true,
    intervalSeconds: 60,
    timeoutMs: 5_000,
    failureThreshold: 2,
    recoveryThreshold: 2,
    config: {
      target: { url: "https://example.com/", method: "GET" },
      expectedStatuses: [200],
      followRedirects: true,
      validateTls: true,
    },
    execution: { kind: "direct" },
    secretConfigured: false,
    consecutiveFailures: 0,
    lastCheckedAt: "2026-08-28T12:00:00.000Z",
    nextCheckAt: "2026-08-28T12:01:00.000Z",
    lastLatencyMs: 52,
    latestMetrics: {},
    passing24h: 100,
    passing30d: 100,
    createdAt: "2026-08-01T12:00:00.000Z",
  };
}
