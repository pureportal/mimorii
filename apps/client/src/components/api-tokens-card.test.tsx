import type { ApiTokenSummary, CreatedApiToken, TeamSummary } from "@mimorii/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../lib/auth";
import { ApiTokensCard } from "./api-tokens-card";

const { apiMock } = vi.hoisted(() => ({
  apiMock: vi.fn<(path: string, options?: RequestInit) => Promise<unknown>>(),
}));

vi.mock("../lib/api", () => ({
  api: apiMock,
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));
vi.mock("../lib/auth", () => ({ useAuth: vi.fn() }));

const teams: TeamSummary[] = [
  {
    id: "team-ops",
    name: "Operations",
    role: "owner",
    logsEnabled: false,
    createdAt: "2026-11-01T00:00:00.000Z",
  },
  {
    id: "team-qa",
    name: "Quality",
    role: "viewer",
    logsEnabled: false,
    createdAt: "2026-11-01T00:00:00.000Z",
  },
];

const createdToken: CreatedApiToken = {
  token: "mim_pat_created",
  apiToken: {
    id: "token-1",
    name: "Deploy",
    prefix: "mim_pat_created",
    access: "write",
    teams: [
      { id: "team-ops", name: "Operations", role: "member" },
      { id: "team-qa", name: "Quality", role: "viewer" },
    ],
    expiresAt: null,
    lastUsedAt: null,
    createdAt: "2026-11-10T00:00:00.000Z",
  },
};

function renderCard() {
  let tokens: ApiTokenSummary[] = [];
  apiMock.mockImplementation((path: string, options?: RequestInit) => {
    if (path === "/auth/api-tokens" && options?.method === "POST") {
      tokens = [createdToken.apiToken];
      return Promise.resolve(createdToken);
    }
    if (path === "/auth/api-tokens") return Promise.resolve(tokens);
    return Promise.resolve(undefined);
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiTokensCard />
    </QueryClientProvider>
  );
}

describe("API token management", () => {
  beforeEach(() => {
    apiMock.mockReset();
    vi.mocked(useAuth).mockReturnValue({
      session: { teams },
      activeTeam: teams[0],
    } as unknown as ReturnType<typeof useAuth>);
  });

  afterEach(cleanup);

  it("creates a token limited to selected teams and roles", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Create" }));
    const dialog = await screen.findByRole("dialog", { name: "Create API token" });

    expect(within(dialog).getByRole("checkbox", { name: "Operations" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Quality" })).not.toBeChecked();
    expect(within(dialog).queryByRole("combobox", { name: "Quality role" })).toBeNull();

    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Deploy" } });
    fireEvent.change(within(dialog).getByLabelText("Access"), { target: { value: "write" } });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Operations role" }), {
      target: { value: "member" },
    });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Quality" }));
    const qualityRole = within(dialog).getByRole("combobox", { name: "Quality role" });
    expect(
      within(qualityRole)
        .getAllByRole("option")
        .map((option) => option.textContent)
    ).toEqual(["Viewer"]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Create token" }));

    await screen.findByRole("dialog", { name: "API token" });
    const body = apiMock.mock.calls.find(([, options]) => options?.method === "POST")?.[1]?.body;
    if (typeof body !== "string") throw new Error("Expected a JSON token request");
    expect(JSON.parse(body)).toEqual({
      name: "Deploy",
      access: "write",
      teams: [
        { teamId: "team-ops", role: "member" },
        { teamId: "team-qa", role: "viewer" },
      ],
      expiresInDays: 90,
    });
    await waitFor(() =>
      expect(
        screen.getByText("Read and write · Operations (Member) · Quality (Viewer)")
      ).toBeInTheDocument()
    );
  });

  it("requires at least one team", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Create" }));
    const dialog = await screen.findByRole("dialog", { name: "Create API token" });

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Operations" }));

    expect(within(dialog).getByRole("button", { name: "Create token" })).toBeDisabled();
  });
});
