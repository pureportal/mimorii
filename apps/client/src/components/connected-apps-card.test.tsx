import type { OAuthConnectionSummary } from "@mimorii/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectedAppsCard } from "./connected-apps-card";

const { apiMock } = vi.hoisted(() => ({
  apiMock: vi.fn<(path: string, options?: RequestInit) => Promise<unknown>>(),
}));

vi.mock("../lib/api", () => ({ api: apiMock }));

const machdoch: OAuthConnectionSummary = {
  id: "0c4f3f0e-5b1f-4f61-9d65-6a4f0b6c2a11",
  clientName: "Machdoch",
  clientHost: null,
  scopes: ["mcp:read", "mcp:write"],
  connectedAt: "2026-11-10T08:00:00.000Z",
  lastUsedAt: null,
};
const assistant: OAuthConnectionSummary = {
  id: "9a1f9d2c-1b6e-4b7a-8f3a-2c1d4e5f6a7b",
  clientName: "Operations assistant",
  clientHost: "client.example",
  scopes: ["mcp:read"],
  connectedAt: "2026-11-09T08:00:00.000Z",
  lastUsedAt: "2026-11-09T09:00:00.000Z",
};

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ConnectedAppsCard />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ConnectedAppsCard", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });
  afterEach(cleanup);

  it("lists connected apps and disconnects one after confirmation", async () => {
    apiMock.mockImplementation(async (path, options) => {
      if (path === "/oauth/connections" && !options) return [machdoch, assistant];
      if (options?.method === "DELETE") return undefined;
      throw new Error(`Unexpected request ${path}`);
    });
    renderCard();

    expect(await screen.findByText("Machdoch")).toBeVisible();
    expect(screen.getByText("client.example")).toBeVisible();
    expect(screen.getByText(/Read and write · Connected/)).toBeVisible();
    expect(screen.getByText(/Read only · Connected/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect Machdoch" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Disconnect Machdoch?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(`/oauth/connections/${machdoch.id}`, {
        method: "DELETE",
      })
    );
    await waitFor(() =>
      expect(apiMock.mock.calls.filter(([path]) => path === "/oauth/connections")).toHaveLength(2)
    );
  });

  it("shows an empty state", async () => {
    apiMock.mockResolvedValue([]);
    renderCard();

    expect(await screen.findByText("No connected apps")).toBeVisible();
    expect(screen.getByRole("link", { name: "Connect" })).toHaveAttribute("href", "/mcp");
  });
});
