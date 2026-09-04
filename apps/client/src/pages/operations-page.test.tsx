import type { IncidentSummary, ResourceSummary } from "@mimorii/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { OperationsPage } from "./operations-page";

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
  checksPassing: 1,
  checksTotal: 1,
  lastCheckedAt: "2026-08-24T08:00:00.000Z",
  inMaintenance: false,
  imageUpdatedAt: null,
  createdAt: "2026-08-20T08:00:00.000Z",
};

const incident: IncidentSummary = {
  id: "incident-1",
  teamId: "team-1",
  source: "manual",
  checkId: null,
  checkName: null,
  heartbeatId: null,
  title: "Elevated API errors",
  impact: "major",
  status: "investigating",
  startedAt: "2026-08-24T08:00:00.000Z",
  acknowledgedAt: null,
  resolvedAt: null,
  durationSeconds: 300,
  resources: [{ id: resource.id, name: resource.name }],
  updates: [
    {
      id: "update-1",
      incidentId: "incident-1",
      status: "investigating",
      message: "The team is investigating.",
      createdByName: "Operator",
      createdAt: "2026-08-24T08:00:00.000Z",
    },
  ],
};

describe("OperationsPage incident updates", () => {
  let currentIncident: IncidentSummary;

  beforeEach(() => {
    currentIncident = incident;
    apiMock.mockReset();
    useAuthMock.mockReturnValue({
      activeTeam: {
        id: "team-1",
        name: "Operations",
        role: "owner",
        createdAt: "2026-08-20T08:00:00.000Z",
      },
    });
    apiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/teams/team-1/incidents?limit=500") {
        return Promise.resolve([currentIncident]);
      }
      if (path === "/teams/team-1/maintenance") return Promise.resolve([]);
      if (path === "/teams/team-1/resources") return Promise.resolve([resource]);
      if (path === "/teams/team-1/incidents/incident-1/updates" && options?.method === "POST") {
        if (typeof options.body !== "string") throw new Error("Expected a JSON request body");
        const input = JSON.parse(options.body) as {
          status: IncidentSummary["status"];
          message: string;
        };
        currentIncident = {
          ...currentIncident,
          status: input.status,
          updates: [
            {
              id: "update-2",
              incidentId: currentIncident.id,
              status: input.status,
              message: input.message,
              createdByName: "Operator",
              createdAt: "2026-08-24T08:05:00.000Z",
            },
            ...currentIncident.updates,
          ],
        };
        return Promise.resolve(currentIncident);
      }
      return Promise.reject(new Error(`Unexpected API request: ${path}`));
    });
  });

  afterEach(cleanup);

  it.each([
    { status: "monitoring" as const, message: "" },
    { status: "identified" as const, message: "The affected dependency was identified." },
  ])("publishes a $status update with message '$message'", async ({ status, message }) => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Update" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: status },
    });
    const update = screen.getByRole("textbox", { name: "Update" });
    expect(update).not.toBeRequired();
    fireEvent.change(update, { target: { value: message } });
    fireEvent.click(screen.getByRole("button", { name: "Publish update" }));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith("/teams/team-1/incidents/incident-1/updates", {
        method: "POST",
        body: JSON.stringify({ status, message }),
      })
    );
    await waitFor(() => expect(screen.getByText(status)).toBeInTheDocument());
    if (message) expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("links an automatic incident to its associated check", async () => {
    currentIncident = {
      ...incident,
      source: "automatic",
      checkId: "check-availability",
      checkName: "HTTP availability",
      title: "Public API: HTTP availability",
    };

    renderPage();

    expect(
      await screen.findByRole("link", { name: "Open check HTTP availability" })
    ).toHaveAttribute("href", "/app/monitoring/checks?checkId=check-availability");
  });

  it("loads long incident histories in manageable groups", async () => {
    const incidents = Array.from({ length: 21 }, (_, index) => ({
      ...incident,
      id: `incident-${index + 1}`,
      title: `Incident ${index + 1}`,
      updates: [],
    }));
    apiMock.mockImplementation((path: string) => {
      if (path === "/teams/team-1/incidents?limit=500") return Promise.resolve(incidents);
      if (path === "/teams/team-1/maintenance") return Promise.resolve([]);
      if (path === "/teams/team-1/resources") return Promise.resolve([resource]);
      return Promise.reject(new Error(`Unexpected API request: ${path}`));
    });

    renderPage();

    await screen.findByText("Incident 20");
    expect(screen.queryByText("Incident 21")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(screen.getByText("Incident 21")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <OperationsPage view="incidents" />
      </QueryClientProvider>
    </MemoryRouter>
  );
}
