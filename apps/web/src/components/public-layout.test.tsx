import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PublicLayout } from "./public-layout";

const privacyMock = vi.hoisted(() => ({
  setSettingsOpen: vi.fn(),
}));

vi.mock("../lib/privacy", () => ({
  usePrivacy: () => ({
    analyticsConfigured: true,
    setSettingsOpen: privacyMock.setSettingsOpen,
  }),
}));

vi.mock("../lib/sponsors", () => ({
  useSponsors: () => ({ data: [] }),
}));

vi.mock("./sponsor-favicon", () => ({
  SponsorFavicon: () => <div data-testid="sponsor-favicon" />,
}));

describe("PublicLayout", () => {
  afterEach(cleanup);

  beforeEach(() => {
    window.localStorage.clear();
    privacyMock.setSettingsOpen.mockClear();
  });

  it("wraps public content in the canonical header and footer", () => {
    renderLayout();

    const header = screen.getByRole("banner");
    const footer = screen.getByRole("contentinfo");

    expect(within(header).getByRole("link", { name: "mimorii" })).toHaveAttribute("href", "/");
    expect(within(header).getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(within(footer).getByRole("navigation", { name: "Footer" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Public content" })).toBeInTheDocument();
    expect(screen.getByTestId("sponsor-favicon")).toBeInTheDocument();
  });

  it("applies the selected theme to the whole public shell", () => {
    window.localStorage.setItem("mimorii.public-theme", "light");
    const { container } = renderLayout();
    const shell = container.querySelector(".public-shell");

    expect(shell).toHaveAttribute("data-theme", "light");
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));

    expect(shell).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement).toHaveAttribute("data-public-theme", "dark");
    expect(window.localStorage.getItem("mimorii.public-theme")).toBe("dark");
  });

  it("keeps the public chrome visible while route content loads", () => {
    renderLayout(<SuspendedContent />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
});

function renderLayout(content: ReactNode = <h1>Public content</h1>) {
  return render(
    <MemoryRouter initialEntries={["/terms"]}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/terms" element={content} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function SuspendedContent(): never {
  throw new Promise(() => undefined);
}
