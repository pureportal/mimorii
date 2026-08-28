import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LandingPage } from "./landing-page";

vi.mock("../lib/sponsors", () => ({
  useSponsors: () => ({ data: [], isError: false, refetch: vi.fn() }),
}));

const expectedDownloads = [
  ["Windows agent", "mimorii-agent-windows-x64.msi"],
  ["Ubuntu / Debian agent", "mimorii-agent-ubuntu-debian-x64.tar.gz"],
  ["Android agent", "mimorii-agent-android.apk"],
  ["Android client", "mimorii-client-android.apk"],
] as const;

describe("landing page downloads", () => {
  afterEach(cleanup);

  it.each(expectedDownloads)("links the %s to the latest release asset", (name, asset) => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: new RegExp(name, "i") })).toHaveAttribute(
      "href",
      `https://github.com/pureportal/mimorii/releases/latest/download/${asset}`
    );
  });
});

describe("landing page MCP section", () => {
  afterEach(cleanup);

  it("links to the MCP documentation", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Use Mimorii from your AI client." })).toBeVisible();
    expect(screen.getByRole("link", { name: /learn how mcp works/i })).toHaveAttribute(
      "href",
      "/mcp"
    );
  });
});
