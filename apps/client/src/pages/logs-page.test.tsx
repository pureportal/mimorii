import type { LogEntry, LogLabelSummary, LogVolume } from "@mimorii/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogsPage } from "./logs-page";

const { apiMock, useAuthMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  api: apiMock,
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));

vi.mock("../lib/auth", () => ({ useAuth: useAuthMock }));

const entries: LogEntry[] = [
  {
    id: "2",
    streamId: "stream-1",
    timestamp: "2026-11-11T10:00:01.000Z",
    receivedAt: "2026-11-11T10:00:01.000Z",
    level: "error",
    message: "Error 404 - Failed to load",
    labels: { service: "web" },
    attributes: { status: 404 },
  },
  {
    id: "1",
    streamId: "stream-1",
    timestamp: "2026-11-11T10:00:00.000Z",
    receivedAt: "2026-11-11T10:00:00.000Z",
    level: "info",
    message: '{"msg":"GET /checkout","status":200}',
    labels: { service: "web" },
    attributes: { status: 200 },
  },
];

const volume: LogVolume = {
  from: "2026-11-11T09:00:00.000Z",
  to: "2026-11-11T10:00:00.000Z",
  stepSeconds: 60,
  total: 2,
  levels: { error: 1, info: 1 },
  buckets: [{ start: "2026-11-11T09:59:00.000Z", total: 2, levels: { error: 1, info: 1 } }],
};

const labels: LogLabelSummary[] = [
  { name: "service", valueCount: 1, values: [{ value: "web", streams: 1 }] },
];

function CurrentSearch() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function renderPage(path = "/app/monitoring/logs") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/app/monitoring/logs"
            element={
              <>
                <LogsPage />
                <CurrentSearch />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("LogsPage", () => {
  beforeEach(() => {
    localStorage.clear();
    apiMock.mockReset();
    useAuthMock.mockReturnValue({
      activeTeam: {
        id: "team-1",
        name: "Operations",
        role: "owner",
        logsEnabled: true,
        createdAt: "2026-08-20T08:00:00.000Z",
      },
    });
    apiMock.mockImplementation((path: string) => {
      if (path.startsWith("/teams/team-1/logs/labels")) return Promise.resolve(labels);
      if (path.startsWith("/teams/team-1/logs/volume")) return Promise.resolve(volume);
      if (path.startsWith("/teams/team-1/logs?")) {
        return Promise.resolve({ entries, nextCursor: null });
      }
      if (path.startsWith("/teams/team-1/logs/entries/2/context")) {
        return Promise.resolve({ before: [entries[1]], entry: entries[0], after: [] });
      }
      return Promise.reject(new Error(`Unexpected API request: ${path}`));
    });
  });

  afterEach(cleanup);

  it("shows lines, highlights matches, and expands details with fields", async () => {
    renderPage("/app/monitoring/logs?query=%7C%3D+%22Error+404%22&from=now-1h&to=now");

    const list = await screen.findByRole("list", { name: "Log lines" });
    expect(within(list).getByText("Error 404")).toContainHTML("mark");
    expect(await screen.findByText("2 lines")).toBeInTheDocument();

    fireEvent.click(within(list).getAllByRole("button", { name: "Show details" })[1]!);
    expect(screen.getByText("Attributes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filter for status=200" }));
    expect(new URLSearchParams(screen.getByTestId("search").textContent!).get("query")).toBe(
      '|= "Error 404" | status = 200'
    );
  });

  it("adds label filters from line details and the level legend", async () => {
    renderPage();
    const list = await screen.findByRole("list", { name: "Log lines" });

    fireEvent.click(within(list).getAllByRole("button", { name: "Show details" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Filter out service=web" }));
    await waitFor(() =>
      expect(new URLSearchParams(screen.getByTestId("search").textContent!).get("query")).toBe(
        '{service!="web"}'
      )
    );

    fireEvent.click(await screen.findByRole("button", { name: /Error\s*1/ }));
    await waitFor(() =>
      expect(new URLSearchParams(screen.getByTestId("search").textContent!).get("query")).toBe(
        '{service!="web", level="error"}'
      )
    );
  });

  it("runs builder queries with case-insensitive search", async () => {
    renderPage();
    await screen.findByRole("list", { name: "Log lines" });

    fireEvent.change(screen.getByRole("textbox", { name: "Line filter text" }), {
      target: { value: "failed to load" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run query" }));

    await waitFor(() =>
      expect(new URLSearchParams(screen.getByTestId("search").textContent!).get("query")).toBe(
        '|~ "(?i)failed to load"'
      )
    );
  });

  it("shows surrounding lines", async () => {
    renderPage();
    const list = await screen.findByRole("list", { name: "Log lines" });

    fireEvent.click(within(list).getAllByRole("button", { name: "Show details" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Show context" }));

    const dialog = await screen.findByRole("dialog", { name: "Log context" });
    await waitFor(() => expect(within(dialog).getAllByRole("listitem")).toHaveLength(2));
  });
});
