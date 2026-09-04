import { beforeEach, describe, expect, it } from "vitest";
import { getAuthSession, loadAuthSession } from "./auth-session";

describe("stored authentication sessions", () => {
  beforeEach(() => localStorage.clear());

  it("keeps a renewable session when only its access token has expired", () => {
    localStorage.setItem(
      "mimorii.session",
      JSON.stringify(session(Date.now() - 1_000, Date.now() + 86_400_000))
    );

    expect(loadAuthSession()?.accessToken).toBe("access-token");
    expect(getAuthSession()?.refreshToken).toBe("refresh-token");
  });

  it("removes a session after its refresh lease expires", () => {
    localStorage.setItem("mimorii.team", "team-1");
    localStorage.setItem(
      "mimorii.session",
      JSON.stringify(session(Date.now() - 60_000, Date.now() - 1_000))
    );

    expect(loadAuthSession()).toBeNull();
    expect(localStorage.getItem("mimorii.session")).toBeNull();
    expect(localStorage.getItem("mimorii.team")).toBeNull();
  });
});

function session(expiresAt: number, refreshExpiresAt: number) {
  return {
    accessToken: "access-token",
    expiresAt: new Date(expiresAt).toISOString(),
    refreshToken: "refresh-token",
    refreshExpiresAt: new Date(refreshExpiresAt).toISOString(),
    user: {
      id: "user-1",
      email: "user@example.com",
      name: "User",
      isGlobalAdmin: false,
      acknowledgedTourIds: [],
      createdAt: "2026-08-14T08:00:00.000Z",
    },
    teams: [
      {
        id: "team-1",
        name: "Operations",
        role: "owner",
        createdAt: "2026-08-14T08:00:00.000Z",
      },
    ],
  };
}
