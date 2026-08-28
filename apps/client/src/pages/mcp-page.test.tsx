import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { McpPage } from "./mcp-page";

vi.mock("../lib/api", () => ({
  getServerUrl: () => "https://mimorii.example/api",
}));

describe("MCP documentation", () => {
  afterEach(cleanup);

  it("shows the connection flow and permission boundaries", () => {
    render(<McpPage />);

    expect(screen.getByRole("heading", { name: "MCP integration" })).toBeVisible();
    expect(screen.getByText("https://mimorii.example/api/mcp")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Approve access" })).toBeVisible();
    expect(
      screen.getByText("Every request uses your current Mimorii team permissions.")
    ).toBeVisible();
    expect(screen.getByText("Team health dashboard in supported clients")).toBeVisible();
    expect(
      screen.getByText("Write access is optional and your Mimorii role must allow the action.")
    ).toBeVisible();
  });
});
