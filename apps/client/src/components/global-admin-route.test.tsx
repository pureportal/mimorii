import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { GlobalAdminRoute } from "./global-admin-route";

vi.mock("../lib/auth", () => ({ useAuth: vi.fn() }));

const useAuthMock = vi.mocked(useAuth);

function renderRoute(isGlobalAdmin: boolean | null) {
  useAuthMock.mockReturnValue({
    session:
      isGlobalAdmin === null
        ? null
        : {
            accessToken: "session-token",
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            refreshToken: "refresh-token",
            refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
            user: {
              id: "user-id",
              email: "user@example.com",
              name: "User",
              isGlobalAdmin,
              acknowledgedTourIds: [],
              createdAt: new Date().toISOString(),
            },
            teams: [],
          },
    profileReady: true,
    activeTeam: null,
    setActiveTeamId: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    refreshIdentity: vi.fn(),
    acknowledgeTour: vi.fn(),
    logout: vi.fn(),
  });
  render(
    <MemoryRouter initialEntries={[appRoutes.platform]}>
      <Routes>
        <Route path={appRoutes.platform} element={<GlobalAdminRoute />}>
          <Route index element={<div>Administrator area</div>} />
        </Route>
        <Route path="/app" element={<div>Application</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Global Administrator route", () => {
  beforeEach(() => useAuthMock.mockReset());
  afterEach(cleanup);

  it("renders for Global Administrators", () => {
    renderRoute(true);
    expect(screen.getByText("Administrator area")).toBeInTheDocument();
  });

  it("redirects ordinary users", () => {
    renderRoute(false);
    expect(screen.getByText("Application")).toBeInTheDocument();
    expect(screen.queryByText("Administrator area")).not.toBeInTheDocument();
  });

  it("redirects unauthenticated users", () => {
    renderRoute(null);
    expect(screen.getByText("Application")).toBeInTheDocument();
  });
});
