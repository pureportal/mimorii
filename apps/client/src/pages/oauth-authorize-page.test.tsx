import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OAuthAuthorizePage } from "./oauth-authorize-page";

const { apiMock, useAuthMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  api: apiMock,
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));
vi.mock("../lib/auth", () => ({ useAuth: useAuthMock }));

const search =
  "?response_type=code&client_id=https%3A%2F%2Fclient.example%2Fmetadata.json" +
  "&redirect_uri=http%3A%2F%2F127.0.0.1%3A9211%2Fcallback&scope=mcp%3Aread%20mcp%3Awrite" +
  "&state=client-state&code_challenge=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" +
  "&code_challenge_method=S256&resource=https%3A%2F%2Fmimorii.example%2Fapi%2Fmcp";

beforeEach(() => {
  apiMock.mockReset();
  useAuthMock.mockReset();
});

describe("OAuth consent page", () => {
  it("returns signed-out users to the exact pending consent request", async () => {
    useAuthMock.mockReturnValue({ session: null });

    render(
      <MemoryRouter initialEntries={[`/oauth/authorize${search}`]}>
        <Routes>
          <Route path="/oauth/authorize" element={<OAuthAuthorizePage />} />
          <Route path="/login" element={<LoginState />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByTestId("login-return")).toHaveTextContent(
      `/oauth/authorize${search}`
    );
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("shows validated permissions and submits the original request on approval", async () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "session" } });
    apiMock
      .mockResolvedValueOnce({
        clientName: "Operations assistant",
        clientHost: "client.example",
        redirectHost: "127.0.0.1:9211",
        redirectIsLoopback: true,
        refreshAccess: true,
        scopes: ["mcp:read", "mcp:write"],
      })
      .mockReturnValueOnce(new Promise(() => undefined));

    render(
      <MemoryRouter initialEntries={[`/oauth/authorize${search}`]}>
        <Routes>
          <Route path="/oauth/authorize" element={<OAuthAuthorizePage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      await screen.findByRole("heading", { name: "Connect Operations assistant" })
    ).toBeVisible();
    expect(screen.getByText("client.example")).toBeVisible();
    expect(screen.getByText("127.0.0.1:9211")).toBeVisible();
    expect(screen.getByText("Only continue if you opened this local app.")).toBeVisible();
    expect(screen.getByText("View monitoring data")).toBeVisible();
    expect(screen.getByText("Change resources and publish incident updates")).toBeVisible();
    expect(screen.getByText("Stay connected until access is revoked")).toBeVisible();
    expect(apiMock).toHaveBeenNthCalledWith(1, `/oauth/authorization-request${search}`);

    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
    expect(apiMock.mock.calls[1]![0]).toBe("/oauth/authorization");
    expect(apiMock.mock.calls[1]![1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(apiMock.mock.calls[1]![1].body)).toMatchObject({
      response_type: "code",
      client_id: "https://client.example/metadata.json",
      scope: "mcp:read mcp:write",
      state: "client-state",
      decision: "approve",
    });
  });
});

function LoginState() {
  const location = useLocation();
  return <span data-testid="login-return">{(location.state as { from: string }).from}</span>;
}
