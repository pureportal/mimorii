import type { CheckSummary, IncidentSummary, ResourceSummary } from "@mimorii/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { navigationGroups } from "../lib/app-navigation";
import { CommandPalette } from "./command-palette";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn<(path: string) => Promise<unknown>>() }));

vi.mock("../lib/api", () => ({ api: apiMock }));

const resource = {
  id: "resource-1",
  name: "Payments database",
  tags: ["payments"],
  status: "down",
} as ResourceSummary;
const check = {
  id: "check-1",
  name: "PostgreSQL port",
  resourceId: "resource-1",
  type: "tcp",
  status: "down",
} as CheckSummary;
const incident = {
  id: "incident-1",
  title: "Elevated payment latency",
  status: "identified",
  resources: [{ id: "resource-1", name: "Payments database" }],
} as IncidentSummary;

function Location() {
  const location = useLocation();
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>;
}

describe("CommandPalette", () => {
  beforeEach(() => {
    apiMock.mockImplementation(async (path) => {
      if (path.endsWith("/resources")) return [resource];
      if (path.endsWith("/checks")) return [check];
      return [incident];
    });
  });
  afterEach(cleanup);

  it("searches records and navigates to the selected result with the keyboard", async () => {
    const onOpenChange = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/app"]}>
          <Routes>
            <Route
              path="*"
              element={
                <>
                  <CommandPalette
                    open
                    onOpenChange={onOpenChange}
                    teamId="team-1"
                    groups={navigationGroups}
                  />
                  <Location />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const input = screen.getByRole("combobox", { name: /Search pages/ });
    expect(screen.getByRole("option", { name: /Add resource/ })).toBeVisible();
    fireEvent.change(input, { target: { value: "payment" } });
    expect(await screen.findByRole("option", { name: /PostgreSQL port/ })).toBeVisible();
    const [first] = screen.getAllByRole("option");
    expect(first).toHaveTextContent(/^Payments database/);
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: /Elevated payment latency/ })).toBeVisible();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/app/monitoring/checks?checkId=check-1"
    );
  });
});
