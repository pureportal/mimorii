import type { ResourceSummary } from "@mimorii/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ResourceDetailPage } from "./resource-detail-page";

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

describe("ResourceDetailPage", () => {
  beforeEach(() => {
    apiMock.mockReset();
    useAuthMock.mockReturnValue({ activeTeam: { id: "team-1" } });
    apiMock.mockImplementation((path: string) => {
      if (path === "/teams/team-1/resources/resource-1") return Promise.resolve(resource);
      if (path === "/teams/team-1/checks?resourceId=resource-1") return Promise.resolve([]);
      if (path === "/teams/team-1/heartbeats?resourceId=resource-1") return Promise.resolve([]);
      if (path === "/teams/team-1/agents") return Promise.resolve([]);
      return Promise.reject(new Error(`Unexpected API request: ${path}`));
    });
  });

  afterEach(cleanup);

  it("shows critical resource health in the detail header", async () => {
    renderPage();

    const heading = (await screen.findByText("Disk host")).parentElement;
    expect(heading).toHaveTextContent("critical");
    expect(heading).not.toHaveTextContent("down");
  });
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={["/app/monitoring/resources/resource-1"]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/app/monitoring/resources/:id" element={<ResourceDetailPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
}
