import type { ResourceSummary } from "@mimorii/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiBlob } from "../lib/api";
import { ResourceImage } from "./resource-image";

vi.mock("../lib/api", () => ({ apiBlob: vi.fn() }));

const resource: ResourceSummary = {
  id: "resource-1",
  teamId: "team-1",
  name: "Website",
  kind: "endpoint",
  target: "https://example.com/",
  description: null,
  tags: [],
  agentId: null,
  status: "up",
  checksUp: 1,
  checksTotal: 1,
  lastCheckedAt: null,
  inMaintenance: false,
  imageUpdatedAt: "2026-08-21T12:00:00.000Z",
  createdAt: "2026-08-21T10:00:00.000Z",
};

describe("resource image", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads an authenticated resource image and releases its object URL", async () => {
    vi.mocked(apiBlob).mockResolvedValue(new Blob(["image"], { type: "image/png" }));
    const createObjectURL = vi.fn(() => "blob:resource-image");
    const revokeObjectURL = vi.fn();
    class MockURL extends URL {
      static override createObjectURL = createObjectURL;
      static override revokeObjectURL = revokeObjectURL;
    }
    vi.stubGlobal("URL", MockURL);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const view = render(
      <QueryClientProvider client={client}>
        <ResourceImage resource={resource} className="size-12" />
      </QueryClientProvider>
    );

    await waitFor(() =>
      expect(view.container.querySelector("img")).toHaveAttribute("src", "blob:resource-image")
    );
    expect(apiBlob).toHaveBeenCalledWith("/teams/team-1/resources/resource-1/image");
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:resource-image");
  });
});
