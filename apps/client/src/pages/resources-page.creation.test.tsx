import type { AgentSummary, ResourceFaviconRefresh, ResourceSummary } from "@mimorii/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResourcesPage } from "./resources-page";

const { apiMock, apiBlobMock, createCheckMock, refreshFaviconMock, successMock, errorMock } =
  vi.hoisted(() => ({
    apiMock: vi.fn(),
    apiBlobMock: vi.fn(),
    createCheckMock: vi.fn(),
    refreshFaviconMock: vi.fn<() => Promise<ResourceFaviconRefresh>>(),
    successMock: vi.fn(),
    errorMock: vi.fn(),
  }));

vi.mock("../lib/api", () => ({
  api: apiMock,
  apiBlob: apiBlobMock,
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));

vi.mock("../lib/auth", () => ({
  useAuth: () => ({ activeTeam: { id: "team-1" } }),
}));

vi.mock("sonner", () => ({ toast: { success: successMock, error: errorMock } }));

const website: ResourceSummary = {
  id: "resource-1",
  teamId: "team-1",
  name: "New website",
  kind: "service",
  description: null,
  tags: [],
  logQuery: null,
  agent: null,
  status: "pending",
  checksPassing: 0,
  checksTotal: 1,
  lastCheckedAt: null,
  inMaintenance: false,
  imageUpdatedAt: null,
  createdAt: "2026-09-12T10:00:00.000Z",
};

const agent: AgentSummary = {
  id: "agent-1",
  resourceId: "agent-resource-1",
  resourceName: "Internal agent",
  teamId: "team-1",
  kind: "desktop",
  collectionIntervalSeconds: 30,
  status: "online",
  platform: "linux",
  version: "11.9.0",
  lastSeenAt: website.createdAt,
  capabilities: ["http"],
  deviceStatus: null,
  createdAt: website.createdAt,
};

const imageUpdatedAt = "2026-09-12T10:01:00.000Z";
let savedResource: ResourceSummary | null;
let queryClient: QueryClient;

beforeEach(() => {
  vi.resetAllMocks();
  savedResource = null;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  createCheckMock.mockResolvedValue({ id: "check-1" });
  refreshFaviconMock.mockResolvedValue({ status: "updated", imageUpdatedAt });
  apiBlobMock.mockResolvedValue(new Blob(["favicon"], { type: "image/png" }));
  class MockURL extends URL {
    static override createObjectURL = vi.fn(() => "blob:website-favicon");
    static override revokeObjectURL = vi.fn();
  }
  vi.stubGlobal("URL", MockURL);
  apiMock.mockImplementation(async (path: string, options?: RequestInit) => {
    if (path === "/teams/team-1/agents") return [agent];
    if (path === "/teams/team-1/resources") {
      if (options?.method === "POST") {
        savedResource = { ...website };
        return savedResource;
      }
      return savedResource ? [{ ...savedResource }] : [];
    }
    if (path === "/teams/team-1/checks" && options?.method === "POST") {
      return createCheckMock();
    }
    if (path === "/teams/team-1/resources/resource-1/favicon" && options?.method === "POST") {
      const result = await refreshFaviconMock();
      if (result.status === "updated") {
        savedResource = { ...website, imageUpdatedAt: result.imageUpdatedAt };
      }
      return result;
    }
    if (path === "/teams/team-1/resources/resource-1" && options?.method === "DELETE") {
      savedResource = null;
      return undefined;
    }
    throw new Error(`Unexpected API request: ${options?.method ?? "GET"} ${path}`);
  });
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function openCreation(mode: "Website" | "Port" | "Service" = "Website") {
  render(
    <MemoryRouter initialEntries={["/?new=1"]}>
      <QueryClientProvider client={queryClient}>
        <ResourcesPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: mode }));
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: website.name } });
  if (mode === "Website") {
    fireEvent.change(within(dialog).getByLabelText("URL"), {
      target: { value: "https://website.test/status" },
    });
  }
  if (mode === "Port") {
    fireEvent.change(within(dialog).getByLabelText("Host"), { target: { value: "example.com" } });
  }
  return dialog;
}

describe("website creation favicons", () => {
  it("retrieves the favicon after saving the HTTP check and displays the stored image", async () => {
    let finishCheck!: () => void;
    createCheckMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishCheck = resolve;
      })
    );
    const dialog = await openCreation();

    fireEvent.click(within(dialog).getByRole("button", { name: "Add resource" }));

    await waitFor(() => expect(createCheckMock).toHaveBeenCalledOnce());
    expect(refreshFaviconMock).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: "Adding…" })).toBeDisabled();
    expect(apiMock).toHaveBeenCalledWith("/teams/team-1/checks", {
      method: "POST",
      body: JSON.stringify({
        resourceId: website.id,
        name: "HTTP availability",
        type: "http",
        config: {
          target: { url: "https://website.test/status", method: "GET" },
          expectedStatuses: [200],
          followRedirects: true,
          validateTls: true,
        },
        execution: { kind: "direct" },
        intervalSeconds: 60,
        timeoutMs: 5000,
        failureThreshold: 2,
        recoveryThreshold: 1,
        enabled: true,
      }),
    });

    await act(async () => finishCheck());

    const card = await screen.findByRole("link", { name: /New website/ });
    await waitFor(() =>
      expect(card.querySelector("img")).toHaveAttribute("src", "blob:website-favicon")
    );
    expect(apiMock).toHaveBeenCalledWith("/teams/team-1/resources/resource-1/favicon", {
      method: "POST",
    });
    expect(refreshFaviconMock).toHaveBeenCalledOnce();
    expect(apiBlobMock).toHaveBeenCalledWith("/teams/team-1/resources/resource-1/image");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(successMock).toHaveBeenCalledWith("Resource added");
    expect(errorMock).not.toHaveBeenCalled();
  });

  it.each([
    ["unavailable favicon", new Error("Favicon could not be retrieved")],
    ["network failure", new TypeError("Failed to fetch")],
  ])("keeps the website and default icon after an %s", async (_failure, error) => {
    refreshFaviconMock.mockRejectedValueOnce(error);
    const dialog = await openCreation();

    fireEvent.click(within(dialog).getByRole("button", { name: "Add resource" }));

    const card = await screen.findByRole("link", { name: /New website/ });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(card.querySelector("img")).not.toBeInTheDocument();
    expect(apiBlobMock).not.toHaveBeenCalled();
    expect(apiMock).not.toHaveBeenCalledWith(expect.any(String), { method: "DELETE" });
    expect(savedResource?.imageUpdatedAt).toBeNull();
    expect(errorMock).toHaveBeenCalledWith(
      "Favicon could not be retrieved. Use Update favicon to try again."
    );
    expect(successMock).toHaveBeenCalledWith("Resource added");
  });

  it.each(["retrieved", "failed"])(
    "refreshes the list after an agent favicon request is %s",
    async (outcome) => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      refreshFaviconMock.mockResolvedValueOnce({ status: "queued", imageUpdatedAt: null });
      const dialog = await openCreation();
      fireEvent.change(within(dialog).getByLabelText("Agent"), { target: { value: agent.id } });

      fireEvent.click(within(dialog).getByRole("button", { name: "Add resource" }));

      const card = await screen.findByRole("link", { name: /New website/ });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(card.querySelector("img")).not.toBeInTheDocument();
      expect(apiBlobMock).not.toHaveBeenCalled();
      expect(apiMock).toHaveBeenCalledWith("/teams/team-1/checks", {
        method: "POST",
        body: expect.stringContaining('"execution":{"kind":"agent","agentId":"agent-1"}'),
      });
      if (outcome === "retrieved") savedResource = { ...website, imageUpdatedAt };
      const requestsBeforeRefresh = apiMock.mock.calls.length;

      await act(async () => vi.advanceTimersByTimeAsync(30_000));

      expect(apiMock.mock.calls.slice(requestsBeforeRefresh)).toContainEqual([
        "/teams/team-1/resources",
      ]);
      if (outcome === "retrieved") {
        await waitFor(() =>
          expect(card.querySelector("img")).toHaveAttribute("src", "blob:website-favicon")
        );
      } else {
        expect(card.querySelector("img")).not.toBeInTheDocument();
        expect(apiBlobMock).not.toHaveBeenCalled();
        expect(savedResource?.imageUpdatedAt).toBeNull();
      }
      expect(refreshFaviconMock).toHaveBeenCalledOnce();
      expect(errorMock).not.toHaveBeenCalled();
    }
  );

  it.each(["Port", "Service"] as const)(
    "does not retrieve a favicon for %s creation",
    async (mode) => {
      const dialog = await openCreation(mode);

      fireEvent.click(within(dialog).getByRole("button", { name: "Add resource" }));

      await screen.findByRole("link", { name: /New website/ });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(refreshFaviconMock).not.toHaveBeenCalled();
      expect(createCheckMock).toHaveBeenCalledTimes(mode === "Port" ? 1 : 0);
    }
  );

  it("does not retrieve a favicon when the resource cannot be created", async () => {
    const dialog = await openCreation();
    apiMock.mockRejectedValueOnce(new Error("Resource limit reached"));

    fireEvent.click(within(dialog).getByRole("button", { name: "Add resource" }));

    expect(await within(dialog).findByText("Resource limit reached")).toBeInTheDocument();
    expect(createCheckMock).not.toHaveBeenCalled();
    expect(refreshFaviconMock).not.toHaveBeenCalled();
    expect(successMock).not.toHaveBeenCalled();
  });

  it("preserves creation rollback when the HTTP check cannot be saved", async () => {
    createCheckMock.mockRejectedValueOnce(new Error("HTTP check could not be added"));
    const dialog = await openCreation();

    fireEvent.click(within(dialog).getByRole("button", { name: "Add resource" }));

    expect(await within(dialog).findByText("HTTP check could not be added")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/teams/team-1/resources/resource-1", {
      method: "DELETE",
    });
    expect(refreshFaviconMock).not.toHaveBeenCalled();
    expect(successMock).not.toHaveBeenCalled();
    expect(savedResource).toBeNull();
  });
});
