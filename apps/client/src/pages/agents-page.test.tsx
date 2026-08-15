import type { AgentSummary } from "@mimorii/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollectorsPage } from "./agents-page";

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

describe("CollectorsPage confirmations", () => {
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
    expect(screen.getByText("The installed collector must be enrolled again.")).toBeVisible();

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
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CollectorsPage />
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
