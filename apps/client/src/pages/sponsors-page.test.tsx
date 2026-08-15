import type { SponsorshipTierCollection } from "@mimorii/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LandingPage } from "./landing-page";
import { PrivacyProvider } from "../lib/privacy";
import { SponsorsPage } from "./sponsors-page";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));

vi.mock("../lib/api", () => ({
  api: apiMock,
  apiAssetUrl: (path: string) => `/api${path}`,
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));

const sponsorFixtures: SponsorshipTierCollection[] = [
  {
    tier: "platinum",
    sponsors: [
      {
        id: "platinum-partner",
        name: "Platinum Partner",
        websiteUrl: "https://platinum.example/",
        faviconUpdatedAt: "2026-08-13T10:00:00.000Z",
      },
      {
        id: "example-sponsor",
        name: "Example Sponsor",
        websiteUrl: null,
        faviconUpdatedAt: null,
      },
    ],
  },
  {
    tier: "gold",
    sponsors: [
      {
        id: "gold-partner",
        name: "Gold Partner",
        websiteUrl: null,
        faviconUpdatedAt: null,
      },
    ],
  },
  { tier: "silver", sponsors: [] },
];

function renderPage(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PrivacyProvider>{children}</PrivacyProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function fillApplication() {
  fireEvent.change(screen.getByLabelText("Organization"), {
    target: { value: "Example Organization" },
  });
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sponsor Contact" } });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "sponsor@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Website"), {
    target: { value: "https://example.com" },
  });
  fireEvent.change(screen.getByLabelText("Tier"), { target: { value: "gold" } });
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "We would like to sponsor Mimorii." },
  });
}

describe("sponsorship experience", () => {
  afterEach(cleanup);

  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((path: string) => {
      if (path === "/sponsors") return Promise.resolve(sponsorFixtures);
      return Promise.resolve({ id: "application", submittedAt: "2026-08-12T12:00:00.000Z" });
    });
  });

  it("shows every sponsor in its tier with distinct artwork", async () => {
    renderPage(<SponsorsPage />);

    expect(await screen.findByText("Platinum Partner")).toBeInTheDocument();
    expect(screen.getByText("Example Sponsor")).toBeInTheDocument();
    expect(screen.getByText("Gold Partner")).toBeInTheDocument();
    expect(screen.getByText("Platinum Partner").closest("a")?.querySelector("img")).toHaveAttribute(
      "src",
      "/api/sponsors/platinum-partner/favicon?v=2026-08-13T10%3A00%3A00.000Z"
    );
    const artwork = [
      screen.getByRole("img", { name: "Platinum cloud empress" }),
      screen.getByRole("img", { name: "Gold infrastructure commander" }),
      screen.getByRole("img", { name: "Silver cloud engineer" }),
    ];
    expect(new Set(artwork.map((image) => image.getAttribute("src"))).size).toBe(3);
  });

  it("submits an application", async () => {
    renderPage(<SponsorsPage />);
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/sponsors"));

    fillApplication();
    fireEvent.click(screen.getByRole("button", { name: "Send application" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Application received");
    const submission = apiMock.mock.calls.find(
      ([path, options]) => path === "/sponsors/applications" && options?.method === "POST"
    );
    expect(submission).toBeDefined();
    expect(JSON.parse(submission![1].body)).toEqual({
      organizationName: "Example Organization",
      contactName: "Sponsor Contact",
      email: "sponsor@example.com",
      websiteUrl: "https://example.com",
      tier: "gold",
      message: "We would like to sponsor Mimorii.",
    });
  });

  it("shows a recoverable submission error", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/sponsors") return Promise.resolve([]);
      return Promise.reject(new Error("Application could not be sent"));
    });
    renderPage(<SponsorsPage />);
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/sponsors"));

    fillApplication();
    fireEvent.click(screen.getByRole("button", { name: "Send application" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Application could not be sent");
    expect(screen.getByRole("button", { name: "Send application" })).toBeEnabled();
  });

  it("shows every platinum sponsor identity on the landing page", async () => {
    renderPage(<LandingPage />);

    expect(await screen.findByText("Platinum Partner")).toBeInTheDocument();
    expect(screen.getByText("Example Sponsor")).toBeInTheDocument();
    expect(screen.queryByText("Gold Partner")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Platinum sponsors" })).toHaveAttribute(
      "aria-roledescription",
      "carousel"
    );
  });
});
