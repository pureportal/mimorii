import type { SponsorshipTierCollection } from "@mimorii/contracts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SponsorFavicon } from "./sponsor-favicon";

const mocks = vi.hoisted(() => ({
  collections: [] as SponsorshipTierCollection[],
  reducedMotion: false,
}));

vi.mock("../lib/sponsors", () => ({
  useSponsors: () => ({ data: mocks.collections }),
}));

vi.mock("../lib/api", () => ({
  apiAssetUrl: (path: string) => `/api${path}`,
}));

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: {
    div: ({ children }: { children: ReactNode }) => (
      <div data-testid="favicon-motion">{children}</div>
    ),
  },
  useReducedMotion: () => mocks.reducedMotion,
}));

const collections: SponsorshipTierCollection[] = [
  {
    tier: "platinum",
    sponsors: [
      {
        id: "first",
        name: "First Sponsor",
        websiteUrl: "https://first.example/",
        faviconUpdatedAt: "2026-08-14T10:00:00.000Z",
      },
    ],
  },
  {
    tier: "gold",
    sponsors: [
      {
        id: "without-favicon",
        name: "No Favicon",
        websiteUrl: "https://missing.example/",
        faviconUpdatedAt: null,
      },
      {
        id: "second",
        name: "Second Sponsor",
        websiteUrl: "https://second.example/",
        faviconUpdatedAt: "2026-08-14T11:00:00.000Z",
      },
    ],
  },
];

describe("SponsorFavicon", () => {
  beforeEach(() => {
    mocks.collections = [];
    mocks.reducedMotion = false;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders nothing when no published sponsor has a favicon", () => {
    mocks.collections = [{ ...collections[1]!, sponsors: [collections[1]!.sponsors[0]!] }];
    render(<SponsorFavicon />);

    expect(screen.queryByRole("complementary", { name: "Sponsor" })).toBeNull();
  });

  it("shows exactly one favicon without visible sponsor copy", () => {
    mocks.collections = collections;
    const { container } = render(<SponsorFavicon />);

    const sponsorLink = screen.getByRole("link", { name: "Visit First Sponsor" });
    expect(sponsorLink).toHaveAttribute("href", "https://first.example/");
    expect(sponsorLink.querySelector("img")).toHaveAttribute(
      "src",
      "/api/sponsors/first/favicon?v=2026-08-14T10%3A00%3A00.000Z"
    );
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container).not.toHaveTextContent(/First Sponsor|Platinum|Gold/);
  });

  it("allows layouts to place the favicon in their own safe corner", () => {
    mocks.collections = collections;
    render(<SponsorFavicon placement="inline" />);

    expect(screen.getByRole("complementary", { name: "Sponsor" })).not.toHaveClass("fixed");
  });

  it("rotates eligible sponsors and pauses while the link has focus", async () => {
    vi.useFakeTimers();
    mocks.collections = collections;
    mocks.reducedMotion = true;
    render(<SponsorFavicon />);

    const firstSponsor = screen.getByRole("link", { name: "Visit First Sponsor" });
    fireEvent.focus(firstSponsor);
    await act(() => vi.advanceTimersByTime(8_000));
    expect(screen.getByRole("link", { name: "Visit First Sponsor" })).toBeInTheDocument();

    fireEvent.blur(firstSponsor);
    await act(() => vi.advanceTimersByTime(8_000));
    expect(screen.getByRole("link", { name: "Visit Second Sponsor" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Visit No Favicon" })).toBeNull();
  });

  it("removes the transition wrapper when reduced motion is requested", () => {
    mocks.collections = collections;
    mocks.reducedMotion = true;
    render(<SponsorFavicon />);

    expect(screen.queryByTestId("favicon-motion")).toBeNull();
  });
});
