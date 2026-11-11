import type { GlobalAdminTeamSummary } from "@mimorii/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminTeams } from "./admin-teams";

const { apiMock, useAuthMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  api: apiMock,
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));

vi.mock("../../lib/auth", () => ({ useAuth: useAuthMock }));

const team: GlobalAdminTeamSummary = {
  id: "team-1",
  name: "Operations",
  memberCount: 3,
  ownerName: "Aiko Tanaka",
  logsEnabled: true,
  logsDeletionScheduledAt: null,
  lastLogAt: null,
  createdAt: "2026-08-20T08:00:00.000Z",
};

describe("AdminTeams", () => {
  beforeEach(() => {
    apiMock.mockReset();
    useAuthMock.mockReturnValue({ session: { teams: [] }, refreshIdentity: vi.fn() });
    apiMock.mockImplementation((path: string) => {
      if (path.startsWith("/admin/teams?")) {
        return Promise.resolve({ teams: [team], total: 1, limit: 20, offset: 0 });
      }
      if (path === "/admin/teams/team-1/logs")
        return Promise.resolve({ ...team, logsEnabled: false });
      return Promise.reject(new Error(`Unexpected API request: ${path}`));
    });
  });

  afterEach(cleanup);

  it("asks before disabling logs and states when they are deleted", async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AdminTeams />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole("switch", { name: "Logs for Operations" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/Stored logs are deleted on/)).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalledWith("/admin/teams/team-1/logs", expect.anything());

    fireEvent.click(within(dialog).getByRole("button", { name: "Disable logs" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith("/admin/teams/team-1/logs", {
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
      })
    );
  });
});
