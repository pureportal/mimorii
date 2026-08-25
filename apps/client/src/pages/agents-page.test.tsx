import type { AgentSummary } from "@mimorii/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { createAgentEnrollmentCode, parseAgentEnrollmentCode } from "../lib/agent-enrollment";
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
  resourceId: "agent-1",
  resourceName: "Warehouse relay",
  teamId: "team-1",
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
  resourceId: "22222222-2222-4222-8222-222222222222",
  resourceName: "Field phone",
  teamId: "team-1",
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

  it("renames an agent and saves its collection interval", async () => {
    let currentAgent = warehouseRelay;
    apiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/teams/team-1/agents") return Promise.resolve([currentAgent]);
      if (path.endsWith("/snapshots?limit=100")) return Promise.resolve([]);
      if (path === "/teams/team-1/agents/agent-1" && options?.method === "PATCH") {
        currentAgent = {
          ...warehouseRelay,
          resourceName: "Production relay",
          collectionIntervalSeconds: 45,
        };
        return Promise.resolve(currentAgent);
      }
      return Promise.reject(new Error(`Unexpected API request: ${path}`));
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Production relay" },
    });
    const interval = screen.getByRole("spinbutton", { name: /Collection interval/ });
    fireEvent.change(interval, { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith("/teams/team-1/agents/agent-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Production relay", collectionIntervalSeconds: 45 }),
      })
    );
    expect(await screen.findByText("Production relay")).toBeVisible();
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

  it("shows the Android enrollment code as both a QR code and copyable text", async () => {
    const enrollmentKey = `mim_agent_${"c".repeat(32)}`;
    apiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/teams/team-1/agents" && options?.method === "POST") {
        return Promise.resolve({ ...fieldPhone, enrollmentKey });
      }
      if (path === "/teams/team-1/agents") return Promise.resolve([]);
      return Promise.reject(new Error(`Unexpected API request: ${path}`));
    });

    renderPage();
    await screen.findByText("No agents yet");
    const addAgentButtons = screen.getAllByRole("button", { name: "Add agent" });
    fireEvent.click(addAgentButtons[0]!);
    fireEvent.change(screen.getByLabelText("Agent"), { target: { value: "mobile" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Field phone" } });
    fireEvent.click(screen.getByRole("button", { name: "Create agent" }));

    const qrCode = await screen.findByRole("img", { name: "Enrollment QR code" });
    const enrollmentCode = createAgentEnrollmentCode({
      serverUrl: "https://monitor.example",
      enrollmentKey,
    });
    expect(qrCode).toBeVisible();
    expect(screen.getByText(enrollmentCode)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Copy enrollment code" }));
    await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith(enrollmentCode));
  });

  it("copies the desktop enrollment command, server URL, and key separately", async () => {
    const enrollmentKey = `mim_agent_${"d".repeat(32)}`;
    apiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/teams/team-1/agents" && options?.method === "POST") {
        return Promise.resolve({ ...warehouseRelay, enrollmentKey });
      }
      if (path === "/teams/team-1/agents") return Promise.resolve([]);
      return Promise.reject(new Error(`Unexpected API request: ${path}`));
    });

    renderPage();
    await screen.findByText("No agents yet");
    fireEvent.click(screen.getAllByRole("button", { name: "Add agent" })[0]!);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Warehouse relay" } });
    fireEvent.click(screen.getByRole("button", { name: "Create agent" }));

    await screen.findByText("Connect agent");
    fireEvent.click(screen.getByRole("button", { name: "Copy command" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy server URL" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy key" }));

    await waitFor(() => expect(writeTextMock).toHaveBeenCalledTimes(3));
    expect(writeTextMock).toHaveBeenNthCalledWith(
      1,
      `mimorii-agent-desktop enroll --server https://monitor.example --key ${enrollmentKey}`
    );
    expect(writeTextMock).toHaveBeenNthCalledWith(2, "https://monitor.example");
    expect(writeTextMock).toHaveBeenNthCalledWith(3, enrollmentKey);
  });

  it("submits the selected desktop platform", async () => {
    apiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/teams/team-1/agents" && options?.method === "POST") {
        return Promise.resolve({
          ...warehouseRelay,
          platform: "windows",
          enrollmentKey: `mim_agent_${"d".repeat(32)}`,
        });
      }
      if (path === "/teams/team-1/agents") return Promise.resolve([]);
      return Promise.reject(new Error(`Unexpected API request: ${path}`));
    });

    renderPage();
    await screen.findByText("No agents yet");
    fireEvent.click(screen.getAllByRole("button", { name: "Add agent" })[0]!);
    fireEvent.change(screen.getByLabelText("Operating system"), {
      target: { value: "windows" },
    });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Windows server" } });
    fireEvent.click(screen.getByRole("button", { name: "Create agent" }));

    await screen.findByText("Connect agent");
    const request = apiMock.mock.calls.find(
      ([path, options]) => path === "/teams/team-1/agents" && options?.method === "POST"
    );
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
      name: "Windows server",
      kind: "desktop",
      platform: "windows",
    });
  });
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AgentsPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}
