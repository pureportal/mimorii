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
      checksPassing: 0,
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
    expect(card).toHaveTextContent("Passing checks");
    expect(card).toHaveTextContent("0 / 1");
  });

  it("filters resources by kind and state and can reset the filters", async () => {
    const resources: ResourceSummary[] = [
      {
        id: "host-1",
        teamId: "team-1",
        name: "Database host",
        kind: "host",
        description: null,
        tags: [],
        agent: null,
        status: "down",
        checksPassing: 0,
        checksTotal: 1,
        lastCheckedAt: null,
        inMaintenance: false,
        imageUpdatedAt: null,
        createdAt: "2026-08-25T11:00:00.000Z",
      },
      {
        id: "service-1",
        teamId: "team-1",
        name: "Public API",
        kind: "service",
        description: null,
        tags: [],
        agent: null,
        status: "up",
        checksPassing: 1,
        checksTotal: 1,
        lastCheckedAt: null,
        inMaintenance: false,
        imageUpdatedAt: null,
        createdAt: "2026-08-25T11:00:00.000Z",
      },
    ];
    apiMock.mockImplementation((path: string) => {
      if (path === "/teams/team-1/resources") return Promise.resolve(resources);
      if (path === "/teams/team-1/agents") return Promise.resolve([]);
      return Promise.reject(new Error(`Unexpected API request: ${path}`));
    });

    renderPage("/");
    await screen.findByText("Database host");

    fireEvent.change(screen.getByLabelText("Resource kind"), { target: { value: "service" } });
    expect(screen.queryByText("Database host")).not.toBeInTheDocument();
    expect(screen.getByText("Public API")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Resource state"), { target: { value: "down" } });
    expect(screen.getByText("No matching resources")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("Database host")).toBeInTheDocument();
    expect(screen.getByText("Public API")).toBeInTheDocument();
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
