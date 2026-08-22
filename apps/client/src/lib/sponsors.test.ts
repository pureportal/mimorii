import { afterEach, describe, expect, it, vi } from "vitest";
import { sponsorApi, sponsorUrl } from "./sponsors";

describe("official sponsor service", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("uses the official server when a community server is selected", async () => {
    localStorage.setItem("mimorii.server", "https://community.example/api");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify([]), {
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await sponsorApi("/sponsors");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://mimorii.app/api/sponsors",
      expect.objectContaining({ credentials: "omit" })
    );
    expect(sponsorUrl("sponsors/example/favicon")).toBe(
      "https://mimorii.app/api/sponsors/example/favicon"
    );
  });
});
