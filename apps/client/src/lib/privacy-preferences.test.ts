import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("privacy preferences and analytics", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    localStorage.clear();
    document.head.querySelectorAll("script[data-site]").forEach((script) => script.remove());
  });

  afterEach(() => {
    delete window.mimorii;
  });

  it("stores the analytics choice", async () => {
    vi.stubEnv("VITE_MIMORII_TRAFFIC_SITE", "mim_site_key");
    const { readPrivacyPreferences, storePrivacyPreferences } =
      await import("./privacy-preferences");

    const stored = storePrivacyPreferences(true);

    expect(stored).toEqual(expect.objectContaining({ version: 2, analytics: true }));
    expect(readPrivacyPreferences()).toEqual(stored);
  });

  it("ignores choices made for earlier analytics", async () => {
    localStorage.setItem(
      "mimorii.privacy",
      JSON.stringify({ version: 1, analytics: true, sessionReplay: true, decidedAt: "now" })
    );
    const { readPrivacyPreferences } = await import("./privacy-preferences");

    expect(readPrivacyPreferences()).toBeNull();
  });

  it("is unavailable without a site key", async () => {
    vi.stubEnv("VITE_MIMORII_TRAFFIC_SITE", "");
    const { analyticsConfigured, setAnalyticsConsent } = await import("./analytics");

    setAnalyticsConsent(true);

    expect(analyticsConfigured).toBe(false);
    expect(document.head.querySelector("script[data-site]")).toBeNull();
  });

  it("loads the built-in tracker only after consent", async () => {
    vi.stubEnv("VITE_MIMORII_TRAFFIC_SITE", "mim_site_key");
    const { setAnalyticsConsent } = await import("./analytics");

    setAnalyticsConsent(false);
    expect(document.head.querySelector("script[data-site]")).toBeNull();

    setAnalyticsConsent(true);
    const script = document.head.querySelector<HTMLScriptElement>("script[data-site]");
    expect(script?.src).toBe(`${window.location.origin}/api/traffic/script.js`);
    expect(script?.dataset).toMatchObject({ site: "mim_site_key", consent: "" });

    const consent = vi.fn();
    window.mimorii = { track: vi.fn(), consent };
    script?.dispatchEvent(new Event("load"));
    expect(consent).toHaveBeenLastCalledWith(true);

    setAnalyticsConsent(false);
    expect(consent).toHaveBeenLastCalledWith(false);
  });
});
