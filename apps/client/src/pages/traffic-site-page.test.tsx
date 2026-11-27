import type { TrafficReport, TrafficSiteSummary, TrafficTotals } from "@mimorii/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrafficSitePage } from "./traffic-site-page";

const { apiMock, useAuthMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  api: apiMock,
  jsonBody: (value: unknown) => JSON.stringify(value),
  getServerUrl: () => "https://monitor.example.com/api",
}));
vi.mock("../lib/auth", () => ({ useAuth: useAuthMock }));

const site: TrafficSiteSummary = {
  id: "site-1",
  resourceId: "resource-1",
  resourceName: "Marketing site",
  publicKey: "mim_site_key",
  domains: ["example.com"],
  heatmapsEnabled: true,
  lastEventAt: "2026-11-27T09:59:00.000Z",
  visitorsToday: 12,
  liveVisitors: 2,
  createdAt: "2026-11-01T00:00:00.000Z",
};

const totals: TrafficTotals = {
  visitors: 1284,
  pageviews: 3021,
  sessions: 1500,
  bounceRate: 41,
  averageEngagementMs: 42_000,
};

const report: TrafficReport = {
  from: "2026-11-20T00:00:00.000Z",
  to: "2026-11-27T10:00:00.000Z",
  granularity: "day",
  totals,
  previousTotals: { ...totals, visitors: 1000 },
  series: [{ bucket: "2026-11-26T00:00:00.000Z", visitors: 200, pageviews: 450 }],
  pages: [
    {
      path: "/pricing",
      visitors: 400,
      pageviews: 900,
      averageEngagementMs: 30_000,
      averageScrollDepth: 70,
    },
  ],
  entryPages: [],
  referrers: [{ value: "news.ycombinator.com", visitors: 300, pageviews: 600 }],
  campaigns: [],
  countries: [{ value: "DE", visitors: 500, pageviews: 1200 }],
  devices: [],
  browsers: [],
  operatingSystems: [],
  languages: [],
  events: [],
  vitals: [],
  errors: [],
};

describe("TrafficSitePage", () => {
  beforeEach(() => {
    apiMock.mockReset();
    useAuthMock.mockReturnValue({ activeTeam: { id: "team-1", role: "owner" } });
    apiMock.mockImplementation((path: string) => {
      if (path === "/teams/team-1/traffic/sites/site-1") return Promise.resolve(site);
      if (path.startsWith("/teams/team-1/traffic/sites/site-1/report?")) {
        return Promise.resolve(report);
      }
      if (path === "/teams/team-1/traffic/sites/site-1/live") {
        return Promise.resolve({ visitors: 2, pages: [] });
      }
      return Promise.reject(new Error(`Unexpected API request: ${path}`));
    });
  });

  afterEach(cleanup);

  it("shows totals with trends, breakdowns, and the tracking snippet", async () => {
    renderPage();

    expect(await screen.findByText("1,284")).toBeInTheDocument();
    expect(screen.getByText("2 online")).toBeInTheDocument();
    expect(screen.getByLabelText("Up 28% from previous period")).toBeInTheDocument();
    expect(screen.getByText("/pricing")).toBeInTheDocument();
    expect(screen.getByText("news.ycombinator.com")).toBeInTheDocument();
    expect(screen.getByText(/Germany/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Setup" }));

    const snippet = await screen.findByText(/data-site="mim_site_key"/);
    expect(snippet.textContent).toContain("https://monitor.example.com/api/traffic/script.js");
    expect(snippet.textContent).not.toContain("data-consent");

    fireEvent.click(screen.getByRole("switch", { name: "Wait for consent" }));

    expect(screen.getByText(/data-site="mim_site_key"/).textContent).toContain(
      'data-site="mim_site_key" data-consent>'
    );
    expect(screen.getByText(/mimorii\.consent\(true\)/)).toBeInTheDocument();
  });
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={["/app/insights/traffic/site-1"]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/app/insights/traffic/:id" element={<TrafficSitePage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
}
