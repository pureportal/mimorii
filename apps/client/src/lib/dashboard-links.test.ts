import { beforeEach, describe, expect, it, vi } from "vitest";

describe("dashboard links", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("keeps protected keys in the fragment", async () => {
    const { dashboardAccessKey, dashboardKeyFingerprint, dashboardShareUrl, dashboardViewPath } =
      await import("./dashboard-links");
    const url = new URL(dashboardShareUrl("dashboard-1", "service health", "mim_dash_secret"));

    expect(url.pathname).toBe("/dashboard/dashboard-1/service%20health");
    expect(url.search).toBe("");
    expect(url.hash).toBe("#key=mim_dash_secret");
    expect(dashboardAccessKey(url.hash)).toBe("mim_dash_secret");
    expect(dashboardKeyFingerprint("mim_dash_secret")).not.toContain("mim_dash_secret");
    expect(dashboardKeyFingerprint("mim_dash_rotated")).not.toBe(
      dashboardKeyFingerprint("mim_dash_secret")
    );
    expect(dashboardViewPath("dashboard-1", "service health", "mim_dash_secret")).toBe(
      "/dashboard/dashboard-1/service%20health#key=mim_dash_secret"
    );
  });
});
