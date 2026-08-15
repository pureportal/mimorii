import type { ManagedSponsor } from "@mimorii/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminSponsors } from "./admin-sponsors";

const { apiBlobMock, apiMock } = vi.hoisted(() => ({
  apiBlobMock: vi.fn<(path: string, options?: RequestInit) => Promise<Blob>>(),
  apiMock: vi.fn<(path: string, options?: RequestInit) => Promise<unknown>>(),
}));

vi.mock("../../lib/api", () => ({
  api: apiMock,
  apiBlob: apiBlobMock,
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));

const sponsor: ManagedSponsor = {
  id: "sponsor-1",
  name: "Example Sponsor",
  tier: "gold",
  websiteUrl: "https://example.com/",
  faviconUpdatedAt: "2026-08-13T10:00:00.000Z",
  displayOrder: 2,
  published: true,
  publishedAt: "2026-08-13T09:00:00.000Z",
  createdAt: "2026-08-13T09:00:00.000Z",
  updatedAt: "2026-08-13T10:00:00.000Z",
};

function renderSponsors(rows: ManagedSponsor[]) {
  apiMock.mockImplementation((path: string, options?: RequestInit) => {
    if (path === "/admin/sponsors" && !options?.method) return Promise.resolve(rows);
    return Promise.resolve(undefined);
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminSponsors />
    </QueryClientProvider>
  );
}

function imageFile(name = "company.png", type = "image/png") {
  return new File(["image bytes"], name, { type });
}

describe("sponsor management", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiBlobMock.mockReset();
    apiBlobMock.mockResolvedValue(new Blob(["current image"], { type: "image/png" }));
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:sponsor-image"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.resolve({ width: 512, height: 256, close: vi.fn() }))
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uploads a browsed image when creating a sponsor", async () => {
    renderSponsors([]);
    fireEvent.click(await screen.findByRole("button", { name: "Add sponsor" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New Sponsor" } });
    const image = imageFile();
    fireEvent.change(screen.getByLabelText("Image", { selector: "input" }), {
      target: { files: [image] },
    });
    expect(await screen.findByText("company.png")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save sponsor" }));

    await waitFor(() => {
      const request = apiMock.mock.calls.find(
        ([path, options]) => path === "/admin/sponsors" && options?.method === "POST"
      );
      const body = request?.[1]?.body;
      if (!(body instanceof FormData)) throw new Error("Expected a multipart sponsor request");
      expect(body.get("name")).toBe("New Sponsor");
      expect(body.get("favicon")).toBe(image);
      expect(body.has("displayOrder")).toBe(false);
    });
  });

  it("accepts an image dropped onto the upload field", async () => {
    renderSponsors([]);
    fireEvent.click(await screen.findByRole("button", { name: "Add sponsor" }));
    const image = imageFile("dropped.webp", "image/webp");
    const dropzone = screen.getByText("Drop image or browse").closest("label");
    if (!dropzone) throw new Error("Expected an image dropzone");
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [image],
        items: [{ kind: "file", type: image.type }],
      },
    });

    expect(await screen.findByText("dropped.webp")).toBeInTheDocument();
  });

  it("rejects unsupported files before saving", async () => {
    renderSponsors([]);
    fireEvent.click(await screen.findByRole("button", { name: "Add sponsor" }));
    fireEvent.change(screen.getByLabelText("Image", { selector: "input" }), {
      target: { files: [imageFile("logo.svg", "image/svg+xml")] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a PNG, JPEG, WebP, or GIF image"
    );
    expect(screen.getByRole("button", { name: "Save sponsor" })).toBeDisabled();
  });

  it("uploads a replacement while editing a sponsor", async () => {
    renderSponsors([sponsor]);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Example Sponsor" }));
    await waitFor(() => expect(apiBlobMock).toHaveBeenCalled());
    const replacement = imageFile("replacement.webp", "image/webp");
    fireEvent.change(screen.getByLabelText("Image", { selector: "input" }), {
      target: { files: [replacement] },
    });
    expect(await screen.findByText("replacement.webp")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save sponsor" }));

    await waitFor(() => {
      const request = apiMock.mock.calls.find(
        ([path, options]) => path === "/admin/sponsors/sponsor-1" && options?.method === "PATCH"
      );
      const body = request?.[1]?.body;
      if (!(body instanceof FormData)) throw new Error("Expected a multipart sponsor request");
      expect(body.get("favicon")).toBe(replacement);
      expect(body.get("expectedUpdatedAt")).toBe(sponsor.updatedAt);
    });
  });

  it("removes the current image on save", async () => {
    renderSponsors([sponsor]);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Example Sponsor" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    expect(screen.getByText("Image will be removed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save sponsor" }));

    await waitFor(() => {
      const request = apiMock.mock.calls.find(
        ([path, options]) => path === "/admin/sponsors/sponsor-1" && options?.method === "PATCH"
      );
      const body = request?.[1]?.body;
      if (!(body instanceof FormData)) throw new Error("Expected a multipart sponsor request");
      expect(body.get("removeFavicon")).toBe("true");
      expect(body.has("favicon")).toBe(false);
    });
  });

  it("saves publication changes", async () => {
    renderSponsors([sponsor]);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Example Sponsor" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Published" }));
    fireEvent.click(screen.getByRole("button", { name: "Save sponsor" }));

    await waitFor(() => {
      const request = apiMock.mock.calls.find(
        ([path, options]) => path === "/admin/sponsors/sponsor-1" && options?.method === "PATCH"
      );
      const body = request?.[1]?.body;
      if (!(body instanceof FormData)) throw new Error("Expected a multipart sponsor request");
      expect(body.get("published")).toBe("false");
    });
  });

  it("deletes a sponsor through confirmation", async () => {
    renderSponsors([sponsor]);
    fireEvent.click(await screen.findByRole("button", { name: "Delete Example Sponsor" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete sponsor" }));

    await waitFor(() => {
      const request = apiMock.mock.calls.find(
        ([path, options]) => path === "/admin/sponsors/sponsor-1" && options?.method === "DELETE"
      );
      const body = request?.[1]?.body;
      if (typeof body !== "string") throw new Error("Expected a JSON sponsor request");
      expect(JSON.parse(body)).toEqual({
        expectedUpdatedAt: sponsor.updatedAt,
      });
    });
  });

  it("shows tier groups, reorder handles, links, and publication state", async () => {
    renderSponsors([sponsor]);

    expect(await screen.findByRole("heading", { name: "Gold" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reorder Example Sponsor" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /https:\/\/example.com/i })).toHaveAttribute(
      "href",
      sponsor.websiteUrl
    );
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.queryByLabelText("Order")).not.toBeInTheDocument();
  });
});
