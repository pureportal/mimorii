import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../lib/locale";
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

function renderLanding() {
  return render(
    <MemoryRouter>
      <LocaleProvider>
        <LandingPage />
      </LocaleProvider>
    </MemoryRouter>
  );
}

describe("landing page", () => {
  afterEach(cleanup);

  beforeEach(() => {
    window.localStorage.clear();
  });

  it.each(expectedDownloads)("links the %s to the latest release asset", (name, asset) => {
    renderLanding();

    expect(screen.getByRole("link", { name: new RegExp(name, "i") })).toHaveAttribute(
      "href",
      `https://github.com/pureportal/mimorii/releases/latest/download/${asset}`
    );
  });

  it("shows the real product overview and links to the MCP documentation", () => {
    renderLanding();

    expect(
      screen.getByRole("heading", { level: 1, name: "See what's up with your services." })
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Mimorii overview/ })).toHaveAttribute(
      "src",
      "/landing/overview.webp"
    );
    expect(screen.getByRole("link", { name: /learn how mcp works/i })).toHaveAttribute(
      "href",
      "/mcp"
    );
    expect(document.title).toBe("Mimorii · Uptime, server health and status pages");
  });

  it("renders the saved German language with language alternates", () => {
    window.localStorage.setItem("mimorii.locale", "de");
    renderLanding();

    expect(
      screen.getByRole("heading", { level: 1, name: "Sehen Sie, wie es Ihren Diensten geht." })
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Mimorii-Übersicht/ })).toBeInTheDocument();
    expect(document.head.querySelector('link[hreflang="de"]')).toHaveAttribute(
      "href",
      `${window.location.origin}/?lang=de`
    );
  });
});
