import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { McpPage } from "./mcp-page";

const { serverUrl } = vi.hoisted(() => ({ serverUrl: { current: "https://mimorii.example/api" } }));

vi.mock("../lib/api", () => ({
  getServerUrl: () => serverUrl.current,
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

  it("asks Machdoch users to replace the preset URL only for other servers", () => {
    render(<McpPage />);
    expect(screen.getByText(/Replace its URL with the server URL/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy server URL" })).toBeVisible();
    cleanup();

    serverUrl.current = "https://mimorii.app/api";
    render(<McpPage />);
    expect(screen.getByText(/select Start OAuth on its Auth tab/)).toBeVisible();
    expect(screen.queryByText(/Replace its URL with the server URL/)).not.toBeInTheDocument();
    serverUrl.current = "https://mimorii.example/api";
  });
});
