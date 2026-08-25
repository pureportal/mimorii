import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { ResourceSummary } from "@mimorii/contracts";
import { ResourcesPage } from "./resources-page";

const { apiMock, useAuthMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  api: apiMock,
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));

vi.mock("../lib/auth", () => ({ useAuth: useAuthMock }));

describe("ResourcesPage add dialog", () => {
  beforeEach(() => {
    apiMock.mockReset();
    useAuthMock.mockReturnValue({ activeTeam: { id: "team-1" } });
    apiMock.mockImplementation((path: string) => {
      if (path === "/teams/team-1/resources" || path === "/teams/team-1/agents") {
        return Promise.resolve([]);
      }
      return Promise.reject(new Error(`Unexpected API request: ${path}`));
    });
  });

  afterEach(cleanup);

  it("only shows Advanced when the selected resource type has options", async () => {
    renderPage();

    await screen.findByText("No resources yet");
    expect(screen.getByText("Advanced")).toBeInTheDocument();
    expect(screen.getByLabelText("Expected status")).toBeInTheDocument();
    expect(screen.getByLabelText("Interval · seconds")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Service" }));

    expect(screen.queryByText("Advanced")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Interval · seconds")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Port" }));

    expect(screen.getByText("Advanced")).toBeInTheDocument();
    expect(screen.getByLabelText("Interval · seconds")).toBeInTheDocument();
    expect(screen.getByLabelText("Timeout · ms")).toBeInTheDocument();
    expect(screen.queryByLabelText("Expected status")).not.toBeInTheDocument();
  });

  it("shows a critical resource as critical instead of down", async () => {
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
    apiMock.mockImplementation((path: string) => {
      if (path === "/teams/team-1/resources") return Promise.resolve([resource]);
      if (path === "/teams/team-1/agents") return Promise.resolve([]);
      return Promise.reject(new Error(`Unexpected API request: ${path}`));
    });

    renderPage("/");

    const card = (await screen.findByText("Disk host")).closest("a");
    expect(card).toHaveTextContent("critical");
    expect(card).not.toHaveTextContent("down");
  });
});

function renderPage(initialEntry = "/?new=1") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>
        <ResourcesPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}
