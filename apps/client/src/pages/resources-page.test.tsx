import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ResourcesPage } from "./resources-page";

const { apiMock, useAuthMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  api: apiMock,
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));

vi.mock("../lib/auth", () => ({ useAuth: useAuthMock }));

describe("ResourcesPage add dialog", () => {
  beforeEach(() => {
    apiMock.mockReset();
    useAuthMock.mockReturnValue({ activeTeam: { id: "team-1" } });
    apiMock.mockImplementation((path: string) => {
      if (path === "/teams/team-1/resources" || path === "/teams/team-1/agents") {
        return Promise.resolve([]);
      }
      return Promise.reject(new Error(`Unexpected API request: ${path}`));
    });
  });

  afterEach(cleanup);

  it("only shows Advanced when the selected resource type has options", async () => {
    renderPage();

    await screen.findByText("No resources yet");
    expect(screen.getByText("Advanced")).toBeInTheDocument();
    expect(screen.getByLabelText("Expected status")).toBeInTheDocument();
    expect(screen.getByLabelText("Interval · seconds")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Service" }));

    expect(screen.queryByText("Advanced")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Interval · seconds")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Port" }));

    expect(screen.getByText("Advanced")).toBeInTheDocument();
    expect(screen.getByLabelText("Interval · seconds")).toBeInTheDocument();
    expect(screen.getByLabelText("Timeout · ms")).toBeInTheDocument();
    expect(screen.queryByLabelText("Expected status")).not.toBeInTheDocument();
  });
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={["/?new=1"]}>
      <QueryClientProvider client={queryClient}>
        <ResourcesPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}
