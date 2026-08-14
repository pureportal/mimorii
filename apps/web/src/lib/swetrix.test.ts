import { beforeEach, describe, expect, it, vi } from "vitest";

const swetrixMock = vi.hoisted(() => {
  const replayStop = vi.fn(() => Promise.resolve());
  return {
    clearFeatureFlagsCache: vi.fn(),
    getExperiment: vi.fn(() => Promise.resolve<string | null>(null)),
    getExperiments: vi.fn(() => Promise.resolve<Record<string, string>>({})),
    getFeatureFlag: vi.fn(() => Promise.resolve(false)),
    getFeatureFlags: vi.fn(() => Promise.resolve<Record<string, boolean>>({})),
    getProfileId: vi.fn(() => Promise.resolve<string | null>(null)),
    getSessionId: vi.fn(() => Promise.resolve<string | null>(null)),
    identify: vi.fn(() => Promise.resolve()),
    init: vi.fn(),
    replayStop,
    reset: vi.fn(),
    setTraits: vi.fn(() => Promise.resolve()),
    startSessionReplay: vi.fn(() =>
      Promise.resolve({ flush: vi.fn(() => Promise.resolve()), stop: replayStop })
    ),
    trackErrors: vi.fn((_options?: unknown) => ({ stop: vi.fn() })),
    trackViews: vi.fn((_options?: unknown) => Promise.resolve({ stop: vi.fn() })),
  };
});
const privacyPreferencesKey = "mimorii.privacy";
const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
  Promise.resolve(new Response(null, { status: 204 }))
);

vi.mock("swetrix", () => swetrixMock);

describe("Swetrix integration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("VITE_SWETRIX_API_URL", "https://analytics.example.com/backend/v1/log");
    localStorage.clear();
    grantAnalyticsConsent();
    window.history.replaceState({}, "", "/");
  });

  it("stays inactive without a project configuration", async () => {
    vi.stubEnv("VITE_SWETRIX_PROJECT_ID", "");
    vi.stubEnv("VITE_SWETRIX_API_URL", "https://analytics.example.com/backend/v1/log");

    const { initializeSwetrix } = await import("./swetrix");

    expect(initializeSwetrix()).toBe(false);
    expect(swetrixMock.init).not.toHaveBeenCalled();
  });

  it("requires analytics consent", async () => {
    localStorage.clear();
    vi.stubEnv("VITE_SWETRIX_PROJECT_ID", "project-id");
    vi.stubEnv("VITE_SWETRIX_API_URL", "https://analytics.example.com/backend/v1/log");

    const { initializeSwetrix } = await import("./swetrix");

    expect(initializeSwetrix()).toBe(false);
    expect(swetrixMock.init).not.toHaveBeenCalled();
  });

  it("rejects a malformed custom ingestion endpoint", async () => {
    vi.stubEnv("VITE_SWETRIX_PROJECT_ID", "project-id");
    vi.stubEnv("VITE_SWETRIX_API_URL", "https://analytics.example.com/backend/v1");

    const { initializeSwetrix } = await import("./swetrix");

    expect(initializeSwetrix()).toBe(false);
    expect(swetrixMock.init).not.toHaveBeenCalled();
  });

  it("initializes all core tracking for the configured project", async () => {
    vi.stubEnv("VITE_SWETRIX_PROJECT_ID", "project-id");
    vi.stubEnv("VITE_SWETRIX_API_URL", "https://analytics.example.com/backend/v1/log");
    vi.stubEnv("VITE_SWETRIX_DEV_MODE", "true");
    vi.stubEnv("MODE", "test");

    const { initializeSwetrix, trackSwetrixEvent } = await import("./swetrix");

    expect(initializeSwetrix()).toBe(true);
    expect(swetrixMock.init).toHaveBeenCalledWith(
      "project-id",
      expect.objectContaining({
        apiURL: "https://analytics.example.com/backend/v1/log",
        devMode: true,
        disabled: false,
        preloadSessionReplay: false,
        respectDNT: true,
      })
    );
    expect(swetrixMock.trackViews).toHaveBeenCalledWith(
      expect.objectContaining({ heartbeatOnBackground: false, callback: expect.any(Function) })
    );
    expect(swetrixMock.trackErrors).toHaveBeenCalledWith(
      expect.not.objectContaining({ sampleRate: expect.anything() })
    );

    trackSwetrixEvent({ ev: "CHECK_CREATED", meta: { scope: "checks" }, unique: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://analytics.example.com/backend/v1/log/custom",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      })
    );
    const eventBody = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body;
    if (typeof eventBody !== "string") {
      throw new TypeError("Expected a JSON request body");
    }
    const eventPayload = JSON.parse(eventBody) as Record<string, unknown>;
    expect(eventPayload).toEqual({
      ev: "CHECK_CREATED",
      lc: expect.any(String),
      unique: true,
      meta: expect.objectContaining({ environment: "test", runtime: "web", scope: "checks" }),
      pg: "/",
      pid: "project-id",
      tz: expect.any(String),
    });
  });

  it("stops tracking on withdrawal and can restart after renewed consent", async () => {
    vi.stubEnv("VITE_SWETRIX_PROJECT_ID", "project-id");
    vi.stubEnv("VITE_SWETRIX_DEV_MODE", "true");
    const pageStop = vi.fn();
    swetrixMock.trackViews.mockResolvedValueOnce({ stop: pageStop });
    const { initializeSwetrix, stopSwetrixTracking } = await import("./swetrix");

    expect(initializeSwetrix()).toBe(true);
    await vi.waitFor(() => expect(swetrixMock.trackViews).toHaveBeenCalledOnce());
    localStorage.clear();
    stopSwetrixTracking();
    expect(pageStop).toHaveBeenCalledOnce();

    grantAnalyticsConsent();
    expect(initializeSwetrix()).toBe(true);
    expect(swetrixMock.init).toHaveBeenCalledOnce();
    expect(swetrixMock.trackViews).toHaveBeenCalledTimes(2);
  });

  it("removes secrets and identifiers from page and error payloads", async () => {
    vi.stubEnv("VITE_SWETRIX_PROJECT_ID", "project-id");
    vi.stubEnv("VITE_SWETRIX_DEV_MODE", "true");
    vi.stubEnv("VITE_SWETRIX_ERROR_SAMPLE_RATE", "1");
    window.history.replaceState({}, "", "/invite/private-token?verify=verification-secret");

    const { initializeSwetrix } = await import("./swetrix");
    initializeSwetrix();

    const pageOptions = swetrixMock.trackViews.mock.calls[0]?.[0];
    if (!hasPayloadCallback(pageOptions)) throw new Error("Page callback was not registered");
    const page = pageOptions.callback({
      pg: "/invite/private-token",
      ref: "https://source.example/private?person=someone",
      so: "private-source",
      me: "private-medium",
      ca: "private-campaign",
      te: "private-term",
      co: "private-content",
      qs: "verify=verification-secret",
    });
    expect(page).toEqual(
      expect.objectContaining({
        pg: "/invite/:token",
        ref: undefined,
        so: undefined,
        me: undefined,
        ca: undefined,
        te: undefined,
        co: undefined,
        qs: undefined,
      })
    );

    const errorOptions = swetrixMock.trackErrors.mock.calls[0]?.[0];
    if (!hasPayloadCallback(errorOptions)) throw new Error("Error callback was not registered");
    const error = errorOptions.callback({
      name: "RequestError",
      pg: "/app",
      filename: "https://mimorii.example/app.js?token=private-token#frame",
      message: "Request failed?verify=verification-secret",
      stackTrace: "Authorization: Bearer private-token",
    });
    expect(error).toEqual(
      expect.objectContaining({
        filename: "https://mimorii.example/app.js",
        message: "Request failed?verify=[redacted]",
        pg: "/app",
        stackTrace: "Authorization: Bearer [redacted]",
      })
    );
    expect(errorOptions.callback({ name: "RequestError", pg: "/invite/private-token" })).toBe(
      false
    );
    expect(pageOptions.callback({ pg: "/private/unrecognized/path" })).toBe(false);
  });

  it("does not send events or errors from dynamic routes", async () => {
    vi.stubEnv("VITE_SWETRIX_PROJECT_ID", "project-id");
    vi.stubEnv("VITE_SWETRIX_DEV_MODE", "true");
    window.history.replaceState({}, "", "/app/monitoring/resources/private-resource-id");

    const { initializeSwetrix, trackSwetrixError, trackSwetrixEvent } = await import("./swetrix");
    initializeSwetrix();
    trackSwetrixEvent({ ev: "RESOURCE_UPDATED" });
    trackSwetrixError(new Error("Resource private-resource-id failed"));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends wrapper errors with a fixed route and redacted text", async () => {
    vi.stubEnv("VITE_SWETRIX_PROJECT_ID", "project-id");
    vi.stubEnv("VITE_SWETRIX_DEV_MODE", "true");
    window.history.replaceState({}, "", "/app");

    const { initializeSwetrix, trackSwetrixError } = await import("./swetrix");
    initializeSwetrix();
    trackSwetrixError(new Error("Request failed?token=private-token"), { source: "query" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://analytics.example.com/backend/v1/log/error",
      expect.objectContaining({ method: "POST" })
    );
    const errorBody = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body;
    if (typeof errorBody !== "string") {
      throw new TypeError("Expected a JSON request body");
    }
    const errorPayload = JSON.parse(errorBody) as Record<string, unknown>;
    expect(errorPayload).toEqual(
      expect.objectContaining({
        message: "Request failed?token=[redacted]",
        meta: expect.objectContaining({ source: "query" }),
        name: "Error",
        pg: "/app",
        pid: "project-id",
      })
    );
  });

  it("applies error sampling in the wrapper", async () => {
    vi.stubEnv("VITE_SWETRIX_PROJECT_ID", "project-id");
    vi.stubEnv("VITE_SWETRIX_DEV_MODE", "true");
    vi.stubEnv("VITE_SWETRIX_ERROR_SAMPLE_RATE", "0");

    const { initializeSwetrix, trackSwetrixError } = await import("./swetrix");
    initializeSwetrix();
    trackSwetrixError(new Error("Not sent"));

    const errorOptions = swetrixMock.trackErrors.mock.calls[0]?.[0];
    if (!hasPayloadCallback(errorOptions)) throw new Error("Error callback was not registered");
    expect(errorOptions.callback({ name: "Error" })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts privacy-preserving replay only on eligible routes", async () => {
    vi.stubEnv("VITE_SWETRIX_PROJECT_ID", "project-id");
    vi.stubEnv("VITE_SWETRIX_DEV_MODE", "true");
    vi.stubEnv("VITE_SWETRIX_SESSION_REPLAY_ENABLED", "true");
    vi.stubEnv("VITE_SWETRIX_SESSION_REPLAY_SAMPLE_RATE", "0.25");
    grantAnalyticsConsent(true);
    window.history.replaceState({}, "", "/app");

    const { initializeSwetrix } = await import("./swetrix");
    initializeSwetrix();

    const pageOptions = swetrixMock.trackViews.mock.calls[0]?.[0];
    if (!hasPayloadCallback(pageOptions)) throw new Error("Page callback was not registered");
    pageOptions.callback({ pg: "/app" });

    await vi.waitFor(() => {
      expect(swetrixMock.startSessionReplay).toHaveBeenCalledWith({
        idleTimeoutMs: 300_000,
        maskAllText: true,
        maxDurationMs: 900_000,
        privacy: "total",
        recordIframes: false,
        sampleRate: 0.25,
      });
    });
  });

  it("does not start replay on dynamic routes", async () => {
    vi.stubEnv("VITE_SWETRIX_PROJECT_ID", "project-id");
    vi.stubEnv("VITE_SWETRIX_DEV_MODE", "true");
    vi.stubEnv("VITE_SWETRIX_SESSION_REPLAY_ENABLED", "true");
    grantAnalyticsConsent(true);
    window.history.replaceState({}, "", "/app/monitoring/resources/private-resource-id");

    const { initializeSwetrix } = await import("./swetrix");
    initializeSwetrix();

    const pageOptions = swetrixMock.trackViews.mock.calls[0]?.[0];
    if (!hasPayloadCallback(pageOptions)) throw new Error("Page callback was not registered");
    pageOptions.callback({ pg: "/app/monitoring/resources/private-resource-id" });

    expect(swetrixMock.startSessionReplay).not.toHaveBeenCalled();
  });

  it("stops an active replay before tracking an ineligible location", async () => {
    vi.stubEnv("VITE_SWETRIX_PROJECT_ID", "project-id");
    vi.stubEnv("VITE_SWETRIX_DEV_MODE", "true");
    vi.stubEnv("VITE_SWETRIX_SESSION_REPLAY_ENABLED", "true");
    grantAnalyticsConsent(true);
    window.history.replaceState({}, "", "/app");

    const { initializeSwetrix, startSwetrixSessionReplay } = await import("./swetrix");
    initializeSwetrix();
    await startSwetrixSessionReplay();
    window.history.replaceState({}, "", "/app/monitoring/resources/private-resource-id");

    expect(await startSwetrixSessionReplay()).toBeNull();
    expect(swetrixMock.replayStop).toHaveBeenCalledOnce();
  });

  it("uses safe defaults when assignment evaluation fails", async () => {
    vi.stubEnv("VITE_SWETRIX_PROJECT_ID", "project-id");
    swetrixMock.getFeatureFlag.mockRejectedValueOnce(new Error("unavailable"));
    swetrixMock.getExperiment.mockRejectedValueOnce(new Error("unavailable"));

    const { getSwetrixExperimentVariant, getSwetrixFeatureFlag } = await import("./swetrix");

    expect(await getSwetrixFeatureFlag("new-checks", true)).toBe(true);
    expect(await getSwetrixExperimentVariant("checks-copy", "control")).toBe("control");
  });

  it("supports profiles, traits, assignments, and attribution", async () => {
    vi.stubEnv("VITE_SWETRIX_PROJECT_ID", "project-id");
    vi.stubEnv("VITE_SWETRIX_DEV_MODE", "true");
    swetrixMock.getFeatureFlags.mockResolvedValueOnce({ dashboard: true });
    swetrixMock.getExperiments.mockResolvedValueOnce({ onboarding: "guided" });
    swetrixMock.getProfileId.mockResolvedValueOnce("profile-id");
    swetrixMock.getSessionId.mockResolvedValueOnce("session-id");

    const {
      clearSwetrixAssignments,
      getSwetrixAttribution,
      getSwetrixExperiments,
      getSwetrixFeatureFlags,
      identifySwetrixUser,
      resetSwetrixUser,
      updateSwetrixUserTraits,
    } = await import("./swetrix");

    identifySwetrixUser(" user-id ", { team_role: "owner" });
    updateSwetrixUserTraits({ team_role: "admin" });
    expect(await getSwetrixFeatureFlags("user-id", true)).toEqual({ dashboard: true });
    expect(await getSwetrixExperiments("user-id", true)).toEqual({ onboarding: "guided" });
    expect(await getSwetrixAttribution()).toEqual({
      profileId: "profile-id",
      sessionId: "session-id",
    });
    clearSwetrixAssignments();
    resetSwetrixUser();

    expect(swetrixMock.identify).toHaveBeenCalledWith("user-id", { team_role: "owner" });
    expect(swetrixMock.setTraits).toHaveBeenCalledWith({ team_role: "admin" });
    expect(swetrixMock.getFeatureFlags).toHaveBeenCalledWith({ profileId: "user-id" }, true);
    expect(swetrixMock.getExperiments).toHaveBeenCalledWith({ profileId: "user-id" }, true);
    expect(swetrixMock.clearFeatureFlagsCache).toHaveBeenCalledOnce();
    expect(swetrixMock.reset).toHaveBeenCalledOnce();
  });
});

function grantAnalyticsConsent(sessionReplay = false): void {
  localStorage.setItem(
    privacyPreferencesKey,
    JSON.stringify({
      version: 1,
      analytics: true,
      sessionReplay,
      decidedAt: "2026-08-13T00:00:00.000Z",
    })
  );
}

function hasPayloadCallback(
  value: unknown
): value is { callback: (payload: Record<string, unknown>) => unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "callback" in value &&
    typeof value.callback === "function"
  );
}
