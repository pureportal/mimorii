import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appPaths, appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { ProtectedLayout } from "./dashboard-layout";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));

vi.mock("../lib/api", () => ({ api: apiMock }));
vi.mock("../lib/auth", () => ({ useAuth: vi.fn() }));
vi.mock("./sponsor-favicon", () => ({
  SponsorFavicon: () => <div data-testid="sponsor-favicon" />,
}));

const useAuthMock = vi.mocked(useAuth);

describe("ProtectedLayout navigation", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue({ openIncidents: 0, activeMaintenance: 0, breachedObjectives: 0 });
    useAuthMock.mockReturnValue({
      session: {
        accessToken: "session-token",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        refreshToken: "refresh-token",
        refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        user: {
          id: "user-1",
          email: "user@example.com",
          name: "User",
          isGlobalAdmin: true,
          acknowledgedTourIds: [],
          createdAt: "2026-08-13T08:00:00.000Z",
        },
        teams: [
          {
            id: "team-1",
            name: "Operations",
            role: "owner",
            logsEnabled: false,
            createdAt: "2026-08-13T08:00:00.000Z",
          },
        ],
      },
      profileReady: true,
      activeTeam: {
        id: "team-1",
        name: "Operations",
        role: "owner",
        logsEnabled: false,
        createdAt: "2026-08-13T08:00:00.000Z",
      },
      setActiveTeamId: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      completeSignIn: vi.fn(),
      refreshIdentity: vi.fn(),
      acknowledgeTour: vi.fn(),
      logout: vi.fn(),
    });
  });

  afterEach(cleanup);

  it("shows grouped desktop navigation and a clear nested resource state", () => {
    renderLayout(appRoutes.resource("resource-1"));

    const desktop = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(desktop).getByText("Monitoring")).toBeVisible();
    expect(within(desktop).getByText("Operations")).toBeVisible();
    expect(within(desktop).getByText("Insights")).toBeVisible();
    expect(within(desktop).getByText("Publishing")).toBeVisible();
    expect(within(desktop).getByText("Workspace")).toBeVisible();
    expect(within(desktop).getByRole("link", { name: "Resources" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(within(desktop).getByText("Resource details")).toBeVisible();
    expect(within(desktop).getByRole("link", { name: "Agents" })).toBeVisible();
    expect(within(desktop).queryByText("Analytics")).not.toBeInTheDocument();
    expect(screen.getByTestId("sponsor-favicon")).toBeInTheDocument();
  });

  it("shows Logs as unavailable for teams without the feature", () => {
    renderLayout(appRoutes.resource("resource-1"));

    const desktop = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(desktop).queryByRole("link", { name: /Logs/ })).not.toBeInTheDocument();
    const logs = within(desktop).getByText("Logs").closest("[aria-disabled]");
    expect(logs).toHaveAttribute("aria-disabled", "true");
    expect(logs).toHaveTextContent("Not enabled for this team");
  });

  it("links Logs and its sections for enabled teams", () => {
    const auth = useAuthMock();
    useAuthMock.mockReturnValue({
      ...auth,
      activeTeam: { ...auth.activeTeam!, logsEnabled: true },
    });
    renderLayout(appRoutes.resource("resource-1"));

    const desktop = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(desktop).getByRole("link", { name: "Logs" })).toHaveAttribute(
      "href",
      appRoutes.logs
    );
  });

  it("keeps primary mobile tasks visible and opens a grouped navigation drawer", () => {
    renderLayout(appRoutes.resource("resource-1"));

    const mobile = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(within(mobile).getAllByRole("link")).toHaveLength(4);
    expect(within(mobile).getByRole("link", { name: "Resources" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    fireEvent.click(within(mobile).getByRole("button", { name: "Open navigation" }));

    const dialog = screen.getByRole("dialog", { name: "Navigation" });
    expect(dialog).toHaveClass("inset-y-0");
    expect(within(dialog).getByLabelText("Workspace")).toHaveValue("team-1");
    expect(within(dialog).getByRole("link", { name: "Overview" })).toBeVisible();
    expect(within(dialog).getByRole("link", { name: "Agents" })).toBeVisible();
    expect(within(dialog).getByRole("link", { name: "Alerting" })).toBeVisible();
    expect(within(dialog).getByRole("link", { name: "Shared dashboards" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  it("counts open incidents, active maintenance and breached goals in the navigation", async () => {
    apiMock.mockResolvedValue({ openIncidents: 3, activeMaintenance: 1, breachedObjectives: 0 });
    renderLayout(appRoutes.resource("resource-1"));

    const desktop = screen.getByRole("navigation", { name: "Primary navigation" });
    const incidents = await within(desktop).findByText("3", {}, { timeout: 10_000 });
    expect(incidents.closest("a")).toHaveAttribute("href", appRoutes.incidents);
    expect(incidents.closest("a")).toHaveTextContent(/Incidents\W*3\W*open/);
    expect(within(desktop).getByText("1").closest("a")).toHaveAttribute(
      "href",
      appRoutes.maintenance
    );
    expect(within(desktop).getByRole("link", { name: "Service goals" })).toBeVisible();
    expect(apiMock).toHaveBeenCalledWith("/teams/team-1/analytics/overview");
  });

  it("offers every creation flow from the header", async () => {
    renderLayout(appRoutes.resource("resource-1"));

    fireEvent.pointerDown(screen.getByRole("button", { name: "Create" }), {
      button: 0,
      ctrlKey: false,
    });

    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Resource" })).toHaveAttribute(
      "href",
      appRoutes.newResource
    );
    expect(within(menu).getByRole("menuitem", { name: "Check" })).toHaveAttribute(
      "href",
      `${appRoutes.checks}?new=1`
    );
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(7);
  });

  it("shows one Guide entry and opens contextual help from the sidebar", () => {
    renderLayout(appRoutes.resource("resource-1"));

    expect(screen.getAllByRole("button", { name: "Guide" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Guide" }));

    const guide = screen.getByRole("dialog", { name: "Mimo Guide" });
    expect(within(guide).getByRole("button", { name: "Explain this page" })).toBeVisible();
    expect(within(guide).getByText("You are viewing Resource details.")).toBeVisible();
  });

  it("returns focus to Guide after the dialog closes", async () => {
    renderLayout(appRoutes.resource("resource-1"));

    const trigger = screen.getByRole("button", { name: "Guide" });
    fireEvent.click(trigger);
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Mimo Guide" })).getByRole("button", {
        name: "Close",
      })
    );

    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

function renderLayout(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app" element={<ProtectedLayout />}>
            <Route path={appPaths.resource} element={<div>Resource page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
