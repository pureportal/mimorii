import type { AgentSummary } from "@mimorii/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseAgentEnrollmentCode } from "../lib/agent-enrollment";
import { AgentsPage } from "./agents-page";

const { apiMock, useAuthMock, writeTextMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  useAuthMock: vi.fn(),
  writeTextMock: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  api: apiMock,
  getServerUrl: () => "https://monitor.example",
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));

vi.mock("../lib/auth", () => ({ useAuth: useAuthMock }));

const warehouseRelay: AgentSummary = {
  id: "agent-1",
  teamId: "team-1",
  name: "Warehouse relay",
  kind: "desktop",
  collectionIntervalSeconds: 30,
  status: "online",
  platform: "Linux",
  version: "0.1.0",
  lastSeenAt: "2026-08-13T08:00:00.000Z",
  capabilities: [],
  deviceStatus: null,
  createdAt: "2026-08-13T07:00:00.000Z",
};

const fieldPhone: AgentSummary = {
  id: "22222222-2222-4222-8222-222222222222",
  teamId: "team-1",
  name: "Field phone",
  kind: "mobile",
  collectionIntervalSeconds: 900,
  status: "offline",
  platform: "Android 16",
  version: "1.0.0",
  lastSeenAt: "2026-08-13T08:00:00.000Z",
  capabilities: ["device-status"],
  deviceStatus: null,
  createdAt: "2026-08-13T07:00:00.000Z",
};

describe("AgentsPage confirmations", () => {
  beforeEach(() => {
    apiMock.mockReset();
    useAuthMock.mockReset();
    writeTextMock.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeTextMock },
    });
    writeTextMock.mockResolvedValue(undefined);
    useAuthMock.mockReturnValue({
      session: null,
      activeTeam: {
        id: "team-1",
        name: "Operations",
        slug: "operations",
        role: "owner",
        createdAt: "2026-08-13T07:00:00.000Z",
      },
      setActiveTeamId: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      refreshIdentity: vi.fn(),
      logout: vi.fn(),
    });
  });

  afterEach(cleanup);

  it("identifies a connected agent that only runs checks", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/teams/team-1/agents") {
        return Promise.resolve([
          {
            ...warehouseRelay,
            platform: null,
            capabilities: ["http", "tcp", "dns"],
          },
        ]);
      }
      return Promise.reject(new Error(`Unexpected API request: ${path}`));
    });

    renderPage();

    expect(await screen.findByText(/Check runner/)).toBeVisible();
  });

  it("confirms relay key rotation and locks the action while it runs", async () => {
    const rotation = deferred<{ enrollmentKey: string }>();
    apiMock.mockImplementation((path: string) => {
      if (path === "/teams/team-1/agents") return Promise.resolve([warehouseRelay]);
      if (path.endsWith("/snapshots?limit=100")) return Promise.resolve([]);
      if (path.endsWith("/rotate-key")) return rotation.promise;
      return Promise.reject(new Error(`Unexpected API request: ${path}`));
    });

    renderPage();

    const rotate = await screen.findByRole("button", { name: "Rotate key" });
    fireEvent.click(rotate);

    expect(
      screen.getByRole("alertdialog", { name: "Rotate Warehouse relay's key?" })
    ).toBeInTheDocument();
    expect(screen.getByText("The installed agent must be enrolled again.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalledWith(
      "/teams/team-1/agents/agent-1/rotate-key",
      expect.anything()
    );

    fireEvent.click(rotate);
    fireEvent.click(screen.getByRole("button", { name: "Rotate key" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Rotate key" })).toBeDisabled());

    await act(async () => {
      rotation.resolve({ enrollmentKey: "new-enrollment-key" });
      await rotation.promise;
    });

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(writeTextMock).toHaveBeenCalledWith("new-enrollment-key");
  });

  it("saves the agent collection interval through Mimorii", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/teams/team-1/agents") return Promise.resolve([warehouseRelay]);
      if (path.endsWith("/snapshots?limit=100")) return Promise.resolve([]);
      if (path === "/teams/team-1/agents/agent-1") return Promise.resolve(warehouseRelay);
      return Promise.reject(new Error(`Unexpected API request: ${path}`));
    });

    renderPage();

    const interval = await screen.findByRole("spinbutton", { name: /Collection interval/ });
    fireEvent.change(interval, { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith("/teams/team-1/agents/agent-1", {
        method: "PATCH",
        body: JSON.stringify({ collectionIntervalSeconds: 45 }),
      })
    );
  });

  it("copies a complete enrollment code when rotating an Android key", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/teams/team-1/agents") return Promise.resolve([fieldPhone]);
      if (path.endsWith("/rotate-key")) {
        return Promise.resolve({
          enrollmentKey: "mim_agent_reconnected_mobile_agent_key_123456",
        });
      }
      return Promise.reject(new Error(`Unexpected API request: ${path}`));
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Rotate key" }));
    fireEvent.click(screen.getByRole("button", { name: "Rotate key" }));

    await waitFor(() => expect(writeTextMock).toHaveBeenCalledOnce());
    expect(parseAgentEnrollmentCode(writeTextMock.mock.calls[0]![0])).toEqual({
      serverUrl: "https://monitor.example",
      enrollmentKey: "mim_agent_reconnected_mobile_agent_key_123456",
    });
  });
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AgentsPage />
    </QueryClientProvider>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}
