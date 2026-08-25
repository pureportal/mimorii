import type { ResourceSummary } from "@mimorii/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { ResourceImageDialog } from "./resource-image-dialog";

vi.mock("../lib/api", () => ({ api: vi.fn(), apiBlob: vi.fn() }));

const website: ResourceSummary = {
  id: "resource-1",
  teamId: "team-1",
  name: "Website",
  kind: "service",
  description: null,
  tags: [],
  agent: null,
  status: "okay",
  checksPassing: 1,
  checksTotal: 1,
  lastCheckedAt: null,
  inMaintenance: false,
  imageUpdatedAt: null,
  createdAt: "2026-08-21T10:00:00.000Z",
};

function renderDialog(resource = website) {
  const onOpenChange = vi.fn();
  const onSaved = vi.fn(async () => undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ResourceImageDialog open onOpenChange={onOpenChange} resource={resource} onSaved={onSaved} />
    </QueryClientProvider>
  );
  return { onOpenChange, onSaved };
}

describe("resource image dialog", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset().mockResolvedValue(undefined);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 300, height: 200, close: vi.fn() }))
    );
    class MockURL extends URL {
      static override createObjectURL = vi.fn(() => "blob:preview");
      static override revokeObjectURL = vi.fn();
    }
    vi.stubGlobal("URL", MockURL);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("uploads a selected custom image", async () => {
    const { onOpenChange, onSaved } = renderDialog();
    const file = new File(["image"], "resource.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image"), { target: { files: [file] } });
    const save = screen.getByRole("button", { name: "Save image" });
    await waitFor(() => expect(save).toBeEnabled());

    fireEvent.click(save);

    await waitFor(() => expect(api).toHaveBeenCalledOnce());
    const [path, options] = vi.mocked(api).mock.calls[0]!;
    if (!options) throw new Error("Expected request options");
    expect(path).toBe("/teams/team-1/resources/resource-1/image");
    expect(options).toMatchObject({ method: "POST" });
    const body = options.body;
    expect(body).toBeInstanceOf(FormData);
    if (!(body instanceof FormData)) throw new Error("Expected multipart form data");
    expect(body.get("image")).toBe(file);
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("retrieves and replaces a website favicon", async () => {
    vi.mocked(api).mockResolvedValueOnce({
      status: "updated",
      imageUpdatedAt: "2026-08-21T12:00:00.000Z",
    });
    const { onSaved } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Update favicon" }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/teams/team-1/resources/resource-1/favicon", {
        method: "POST",
      })
    );
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("closes after queueing agent favicon retrieval", async () => {
    vi.mocked(api).mockResolvedValueOnce({ status: "queued", imageUpdatedAt: null });
    const { onOpenChange, onSaved } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Update favicon" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("does not show favicon retrieval for non-website resources", () => {
    renderDialog({ ...website, kind: "host" });

    expect(screen.queryByRole("button", { name: "Update favicon" })).not.toBeInTheDocument();
  });
});
