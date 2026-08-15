import { beforeEach, describe, expect, it, vi } from "vitest";

describe("privacy preferences", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  it("stores analytics consent without enabling replay", async () => {
    vi.stubEnv("VITE_SWETRIX_PROJECT_ID", "project-id");
    vi.stubEnv("VITE_SWETRIX_API_URL", "https://analytics.example.com/backend/v1/log");
    vi.stubEnv("VITE_SWETRIX_SESSION_REPLAY_ENABLED", "true");
    const { readPrivacyPreferences, storePrivacyPreferences } =
      await import("./privacy-preferences");

    const stored = storePrivacyPreferences({ analytics: true, sessionReplay: false });

    expect(stored).toEqual(
      expect.objectContaining({ version: 1, analytics: true, sessionReplay: false })
    );
    expect(readPrivacyPreferences()).toEqual(stored);
  });

  it("does not enable replay without its separate choice", async () => {
    vi.stubEnv("VITE_SWETRIX_PROJECT_ID", "project-id");
    vi.stubEnv("VITE_SWETRIX_API_URL", "https://analytics.example.com/backend/v1/log");
    vi.stubEnv("VITE_SWETRIX_SESSION_REPLAY_ENABLED", "true");
    const { storePrivacyPreferences } = await import("./privacy-preferences");

    expect(storePrivacyPreferences({ analytics: false, sessionReplay: true }).sessionReplay).toBe(
      false
    );
  });

  it("ignores invalid or obsolete stored choices", async () => {
    localStorage.setItem(
      "mimorii.privacy",
      JSON.stringify({ version: 0, analytics: true, sessionReplay: true, decidedAt: "now" })
    );
    const { readPrivacyPreferences } = await import("./privacy-preferences");

    expect(readPrivacyPreferences()).toBeNull();
  });

  it("requires an explicit analytics endpoint", async () => {
    vi.stubEnv("VITE_SWETRIX_PROJECT_ID", "project-id");
    vi.stubEnv("VITE_SWETRIX_API_URL", "");
    const { analyticsConfigured } = await import("./privacy-preferences");

    expect(analyticsConfigured).toBe(false);
  });

  it("requires an explicit project ID", async () => {
    vi.stubEnv("VITE_SWETRIX_PROJECT_ID", "");
    vi.stubEnv("VITE_SWETRIX_PROJECT_URL", "https://analytics.example.com/projects/project-id");
    vi.stubEnv("VITE_SWETRIX_API_URL", "https://analytics.example.com/backend/v1/log");
    const { analyticsConfigured } = await import("./privacy-preferences");

    expect(analyticsConfigured).toBe(false);
  });
});
