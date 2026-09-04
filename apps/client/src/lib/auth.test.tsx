import type { UserSummary } from "@mimorii/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth";

const { apiMock, revokeAuthSessionMock, revokePushOnLogoutMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  revokeAuthSessionMock: vi.fn(),
  revokePushOnLogoutMock: vi.fn(),
}));

vi.mock("./api", () => ({
  api: apiMock,
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
  revokeAuthSession: revokeAuthSessionMock,
}));

vi.mock("./privacy", () => ({ usePrivacy: () => ({ preferences: null }) }));
vi.mock("./push-notifications", () => ({ revokePushOnLogout: revokePushOnLogoutMock }));
vi.mock("./swetrix", () => ({
  identifySwetrixUser: vi.fn(),
  resetSwetrixUser: vi.fn(),
  trackSwetrixEvent: vi.fn(),
}));

const team = {
  id: "team-1",
  name: "Operations",
  role: "owner" as const,
  createdAt: "2026-08-14T08:00:00.000Z",
};

describe("AuthProvider profile synchronization", () => {
  beforeEach(() => {
    localStorage.clear();
    apiMock.mockReset();
    revokeAuthSessionMock.mockReset().mockResolvedValue(undefined);
    revokePushOnLogoutMock.mockReset();
  });

  afterEach(cleanup);

  it("uses the refreshed server profile before exposing tour acknowledgements", async () => {
    const serverUser = user(["overview"]);
    const refreshed = deferred<{ user: UserSummary; teams: [typeof team] }>();
    apiMock
      .mockReturnValueOnce(refreshed.promise)
      .mockResolvedValueOnce(user(["overview", "checks"]));
    localStorage.setItem(
      "mimorii.session",
      JSON.stringify({
        accessToken: "session-token",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        refreshToken: "refresh-token",
        refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        user: user(["cached-view"]),
        teams: [team],
      })
    );

    render(
      <AuthProvider>
        <ProfileState />
      </AuthProvider>
    );

    expect(screen.getByTestId("profile-ready")).toHaveTextContent("false");
    expect(screen.getByTestId("acknowledged-tours")).toHaveTextContent("cached-view");

    refreshed.resolve({ user: serverUser, teams: [team] });
    await waitFor(() => expect(screen.getByTestId("profile-ready")).toHaveTextContent("true"));
    expect(screen.getByTestId("acknowledged-tours")).toHaveTextContent("overview");
    expect(apiMock).toHaveBeenNthCalledWith(1, "/auth/me");

    fireEvent.click(screen.getByRole("button", { name: "Acknowledge checks" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenNthCalledWith(2, "/auth/profile/tour-acknowledgements/checks", {
        method: "PUT",
      })
    );
    await waitFor(() =>
      expect(screen.getByTestId("acknowledged-tours")).toHaveTextContent("overview,checks")
    );

    const stored: unknown = JSON.parse(localStorage.getItem("mimorii.session") ?? "null");
    expect(stored).toMatchObject({
      user: { acknowledgedTourIds: ["overview", "checks"] },
    });
  });

  it("revokes this device's push registration when signing out", async () => {
    apiMock.mockResolvedValue({ user: user([]), teams: [team] });
    localStorage.setItem(
      "mimorii.session",
      JSON.stringify({
        accessToken: "session-token",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        refreshToken: "refresh-token",
        refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        user: user([]),
        teams: [team],
      })
    );

    render(
      <AuthProvider>
        <SignOut />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(revokePushOnLogoutMock).toHaveBeenCalledOnce();
    expect(revokeAuthSessionMock).toHaveBeenCalledWith("refresh-token");
    expect(localStorage.getItem("mimorii.session")).toBeNull();
  });
});

function ProfileState() {
  const { session, profileReady, acknowledgeTour } = useAuth();
  return (
    <>
      <span data-testid="profile-ready">{String(profileReady)}</span>
      <span data-testid="acknowledged-tours">{session?.user.acknowledgedTourIds.join(",")}</span>
      <button type="button" onClick={() => void acknowledgeTour("checks")}>
        Acknowledge checks
      </button>
    </>
  );
}

function SignOut() {
  const { logout } = useAuth();
  return (
    <button type="button" onClick={logout}>
      Sign out
    </button>
  );
}

function user(acknowledgedTourIds: string[]): UserSummary {
  return {
    id: "user-1",
    email: "user@example.com",
    name: "User",
    isGlobalAdmin: false,
    acknowledgedTourIds,
    createdAt: "2026-08-14T08:00:00.000Z",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
