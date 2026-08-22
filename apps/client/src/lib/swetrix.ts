import * as Swetrix from "swetrix";
import type {
  ErrorActions,
  IErrorEventPayload,
  IPageViewPayload,
  LibOptions,
  PageActions,
  Traits,
  TrackEventOptions,
} from "swetrix";
import { appRoutes } from "./app-navigation";
import { hasAnalyticsConsent, hasSessionReplayConsent } from "./privacy-preferences";

const staticPaths = new Set([
  "/",
  "/login",
  "/register",
  "/sponsors",
  "/privacy",
  "/terms",
  "/imprint",
  appRoutes.overview,
  appRoutes.resources,
  appRoutes.checks,
  appRoutes.heartbeats,
  appRoutes.agents,
  appRoutes.incidents,
  appRoutes.maintenance,
  appRoutes.alertChannels,
  appRoutes.alertRules,
  appRoutes.alertHistory,
  appRoutes.reports,
  appRoutes.serviceGoals,
  appRoutes.dashboards,
  appRoutes.dashboardNew,
  appRoutes.statusPages,
  appRoutes.team,
  appRoutes.auditLog,
  appRoutes.account,
  appRoutes.platform,
  appRoutes.platformUsers,
  appRoutes.platformSponsorships,
  appRoutes.platformSettings,
  appRoutes.platformAudit,
]);
const dynamicPaths: Array<[RegExp, string]> = [
  [/^\/invite\/[^/]+$/, "/invite/:token"],
  [/^\/status\/[^/]+$/, "/status/:slug"],
  [/^\/dashboard\/[^/]+$/, "/dashboard/:slug"],
  [/^\/app\/monitoring\/resources\/[^/]+$/, "/app/monitoring/resources/:id"],
  [/^\/app\/publishing\/dashboards\/[^/]+\/edit$/, "/app/publishing/dashboards/:id/edit"],
];
const projectId = readProjectId();
const apiUrl = readApiUrl();
const developmentMode = import.meta.env.VITE_SWETRIX_DEV_MODE === "true";
const errorSampleRate = readRate(import.meta.env.VITE_SWETRIX_ERROR_SAMPLE_RATE, 1);
const sessionReplayEnabled = import.meta.env.VITE_SWETRIX_SESSION_REPLAY_ENABLED === "true";
const sessionReplaySampleRate = readRate(
  import.meta.env.VITE_SWETRIX_SESSION_REPLAY_SAMPLE_RATE,
  0.1
);
const sessionReplayMaxDurationMs = readDuration(
  import.meta.env.VITE_SWETRIX_SESSION_REPLAY_MAX_DURATION_MS,
  15 * 60 * 1000
);
const sessionReplayIdleTimeoutMs = readDuration(
  import.meta.env.VITE_SWETRIX_SESSION_REPLAY_IDLE_TIMEOUT_MS,
  5 * 60 * 1000
);

type SessionReplayActions = Awaited<ReturnType<typeof Swetrix.startSessionReplay>>;

let sdkInitialized = false;
let trackingActive = false;
let trackingGeneration = 0;
let pageActions: PageActions | null = null;
let errorActions: ErrorActions | null = null;
let sessionReplayActions: SessionReplayActions | null = null;
let sessionReplayStart: Promise<SessionReplayActions | null> | null = null;
let rejectionListener: ((event: PromiseRejectionEvent) => void) | null = null;
let identifiedProfileId: string | null = null;

export function initializeSwetrix(): boolean {
  if (trackingActive) return true;
  if (!hasAnalyticsConsent() || !projectId || apiUrl === null || typeof window === "undefined") {
    return false;
  }

  if (!sdkInitialized) {
    const options: LibOptions = {
      apiURL: apiUrl,
      devMode: developmentMode || isTauriRuntime(),
      disabled: import.meta.env.DEV && !developmentMode,
      respectDNT: true,
      preloadSessionReplay: false,
    };
    try {
      Swetrix.init(projectId, options);
    } catch {
      return false;
    }
    sdkInitialized = true;
  }

  trackingActive = true;
  trackingGeneration += 1;
  const generation = trackingGeneration;
  void Swetrix.trackViews({
    heartbeatOnBackground: false,
    callback: sanitizePageView,
  })
    .then((actions) => {
      if (trackingActive && generation === trackingGeneration) pageActions = actions;
      else actions.stop();
    })
    .catch(() => undefined);

  try {
    errorActions = Swetrix.trackErrors({ callback: sanitizeAutomaticError });
  } catch {
    errorActions = null;
  }

  rejectionListener = (event) => {
    trackSwetrixError(event.reason, { source: "unhandled_promise" });
  };
  window.addEventListener("unhandledrejection", rejectionListener);
  return true;
}

export function stopSwetrixTracking(): void {
  trackingActive = false;
  identifiedProfileId = null;
  trackingGeneration += 1;
  pageActions?.stop();
  pageActions = null;
  errorActions?.stop();
  errorActions = null;
  if (rejectionListener) window.removeEventListener("unhandledrejection", rejectionListener);
  rejectionListener = null;
  void stopSwetrixSessionReplay();
  if (sdkInitialized) {
    Swetrix.reset();
    Swetrix.clearFeatureFlagsCache();
  }
}

export function trackSwetrixEvent(event: Omit<TrackEventOptions, "profileId">): void {
  const eventName = event.ev.trim();
  if (
    !eventName ||
    !isStaticPath(window.location.pathname) ||
    !ensureInitialized() ||
    !canSendAnalyticsRequest() ||
    !projectId ||
    !apiUrl
  ) {
    return;
  }

  const payload = JSON.stringify({
    ev: eventName,
    lc: navigator.languages[0] ?? navigator.language,
    meta: withRuntimeMetadata(event.meta),
    pg: normalizePath(window.location.pathname),
    pid: projectId,
    profileId: identifiedProfileId ?? undefined,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    unique: event.unique,
  });
  sendAnalyticsRequest("custom", payload);
}

export function trackSwetrixError(error: unknown, meta?: IErrorEventPayload["meta"]): void {
  if (
    !isErrorPath(window.location.pathname) ||
    !shouldSample(errorSampleRate) ||
    !ensureInitialized() ||
    !canSendAnalyticsRequest() ||
    !projectId ||
    !apiUrl
  ) {
    return;
  }

  const payload = errorPayload(error);
  sendAnalyticsRequest(
    "error",
    JSON.stringify({
      colno: null,
      filename: null,
      lc: navigator.languages[0] ?? navigator.language,
      lineno: null,
      message: redactSensitiveText(payload.message),
      meta: withRuntimeMetadata(meta),
      name: payload.name,
      pg: normalizePath(window.location.pathname),
      pid: projectId,
      stackTrace: redactSensitiveText(payload.stackTrace),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
  );
}

export function identifySwetrixUser(profileId: string, traits?: Traits): void {
  const normalizedProfileId = profileId.trim();
  if (!normalizedProfileId || !ensureInitialized()) return;
  identifiedProfileId = normalizedProfileId;
  void Swetrix.identify(normalizedProfileId, traits).catch(() => undefined);
}

export function updateSwetrixUserTraits(traits: Traits): void {
  if (!ensureInitialized()) return;
  void Swetrix.setTraits(traits).catch(() => undefined);
}

export function resetSwetrixUser(): void {
  identifiedProfileId = null;
  if (!ensureInitialized()) return;
  Swetrix.reset();
}

export async function getSwetrixFeatureFlags(
  profileId?: string,
  forceRefresh = false
): Promise<Record<string, boolean>> {
  if (!ensureInitialized()) return {};
  try {
    return await Swetrix.getFeatureFlags(profileId ? { profileId } : undefined, forceRefresh);
  } catch {
    return {};
  }
}

export async function getSwetrixFeatureFlag(
  key: string,
  defaultValue = false,
  profileId?: string
): Promise<boolean> {
  if (!ensureInitialized()) return defaultValue;
  try {
    return await Swetrix.getFeatureFlag(key, profileId ? { profileId } : undefined, defaultValue);
  } catch {
    return defaultValue;
  }
}

export async function getSwetrixExperiments(
  profileId?: string,
  forceRefresh = false
): Promise<Record<string, string>> {
  if (!ensureInitialized()) return {};
  try {
    return await Swetrix.getExperiments(profileId ? { profileId } : undefined, forceRefresh);
  } catch {
    return {};
  }
}

export async function getSwetrixExperimentVariant(
  experimentId: string,
  defaultVariant: string | null = null,
  profileId?: string
): Promise<string | null> {
  if (!ensureInitialized()) return defaultVariant;
  try {
    return await Swetrix.getExperiment(
      experimentId,
      profileId ? { profileId } : undefined,
      defaultVariant
    );
  } catch {
    return defaultVariant;
  }
}

export function clearSwetrixAssignments(): void {
  if (!ensureInitialized()) return;
  Swetrix.clearFeatureFlagsCache();
}

export async function getSwetrixAttribution(): Promise<{
  profileId: string | null;
  sessionId: string | null;
}> {
  if (!ensureInitialized()) return { profileId: null, sessionId: null };
  const [profileId, sessionId] = await Promise.all([
    Swetrix.getProfileId().catch(() => null),
    Swetrix.getSessionId().catch(() => null),
  ]);
  return { profileId, sessionId };
}

export async function startSwetrixSessionReplay(): Promise<SessionReplayActions | null> {
  if (
    !sessionReplayEnabled ||
    !hasSessionReplayConsent() ||
    !isSessionReplayPath(window.location.pathname) ||
    !ensureInitialized()
  ) {
    await stopSwetrixSessionReplay();
    return null;
  }
  if (sessionReplayActions) return sessionReplayActions;
  if (sessionReplayStart) return sessionReplayStart;

  sessionReplayStart = loadBundledSessionReplayRecorder()
    .then((recorderAvailable) => {
      if (
        !recorderAvailable ||
        !trackingActive ||
        !hasSessionReplayConsent() ||
        !isSessionReplayPath(window.location.pathname)
      ) {
        return null;
      }
      return Swetrix.startSessionReplay({
        privacy: "total",
        maskAllText: true,
        recordIframes: false,
        sampleRate: sessionReplaySampleRate,
        maxDurationMs: sessionReplayMaxDurationMs,
        idleTimeoutMs: sessionReplayIdleTimeoutMs,
      });
    })
    .then(async (actions) => {
      if (!actions) return null;
      if (
        !trackingActive ||
        !hasSessionReplayConsent() ||
        !isSessionReplayPath(window.location.pathname)
      ) {
        await actions.stop();
        return null;
      }
      sessionReplayActions = actions;
      return actions;
    })
    .catch(() => null)
    .finally(() => {
      sessionReplayStart = null;
    });

  return sessionReplayStart;
}

export async function stopSwetrixSessionReplay(): Promise<void> {
  if (sessionReplayStart) await sessionReplayStart;
  const actions = sessionReplayActions;
  sessionReplayActions = null;
  if (actions) await actions.stop().catch(() => undefined);
}

function ensureInitialized(): boolean {
  return (trackingActive && hasAnalyticsConsent()) || initializeSwetrix();
}

function sanitizePageView(payload: IPageViewPayload): Partial<IPageViewPayload> | false {
  const path = payload.pg ?? window.location.pathname;
  const trackable = isTrackablePath(path);
  if (sessionReplayEnabled && hasSessionReplayConsent()) {
    if (trackable && isSessionReplayPath(path)) void startSwetrixSessionReplay();
    else void stopSwetrixSessionReplay();
  }
  if (!trackable) return false;
  return {
    ...payload,
    pg: normalizePath(path),
    ref: undefined,
    so: undefined,
    me: undefined,
    ca: undefined,
    te: undefined,
    co: undefined,
    qs: undefined,
    meta: withRuntimeMetadata(payload.meta),
  };
}

function sanitizeAutomaticError(
  payload: IErrorEventPayload & { pg?: string | null }
): Partial<IErrorEventPayload & { pg?: string | null }> | false {
  const path = payload.pg ?? window.location.pathname;
  if (!isErrorPath(path) || !shouldSample(errorSampleRate)) return false;
  return {
    ...payload,
    pg: normalizePath(path),
    filename: sanitizeUrl(payload.filename),
    message: redactSensitiveText(payload.message),
    stackTrace: redactSensitiveText(payload.stackTrace),
    meta: withRuntimeMetadata(payload.meta),
  };
}

function normalizePath(value: string): string {
  const pathname = parsePathname(value);
  if (!pathname) return "/";
  if (staticPaths.has(pathname)) return pathname;
  for (const [pattern, normalized] of dynamicPaths) {
    if (pattern.test(pathname)) return normalized;
  }
  return "/";
}

function sanitizeUrl(value: string | null | undefined): string | null | undefined {
  if (!value) return value;
  try {
    const url = new URL(value, window.location.origin);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return redactSensitiveText(value);
  }
}

function redactSensitiveText(value: string | null | undefined): string | null | undefined {
  if (!value) return value;
  return value
    .replace(/(bearer\s+)[^\s"']+/gi, "$1[redacted]")
    .replace(
      /([?&](?:authorization|key|password|secret|token|unsubscribe|verify)=)[^&#\s]+/gi,
      "$1[redacted]"
    )
    .replace(/\bmim_(?:pat|hb)_[A-Za-z0-9._~-]+\b/g, "[redacted]");
}

function errorPayload(error: unknown): Pick<IErrorEventPayload, "name" | "message" | "stackTrace"> {
  if (error instanceof Error) {
    return { name: error.name || "Error", message: error.message, stackTrace: error.stack };
  }
  if (typeof error === "string") {
    return { name: "Error", message: error };
  }
  return { name: "UnhandledPromiseRejection", message: "A promise rejected without an Error" };
}

function withRuntimeMetadata(
  meta?: Record<string, string | number | boolean | null | undefined>
): Record<string, string | number | boolean | null | undefined> {
  return {
    ...meta,
    environment: import.meta.env.MODE,
    runtime: isTauriRuntime() ? "tauri" : "web",
  };
}

function parsePathname(value: string): string | null {
  try {
    const pathname = new URL(value, window.location.origin).pathname;
    return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  } catch {
    return null;
  }
}

function isStaticPath(value: string): boolean {
  const pathname = parsePathname(value);
  return pathname !== null && staticPaths.has(pathname);
}

function isTrackablePath(value: string): boolean {
  const pathname = parsePathname(value);
  return (
    pathname !== null &&
    (staticPaths.has(pathname) || dynamicPaths.some(([pattern]) => pattern.test(pathname)))
  );
}

function isErrorPath(value: string): boolean {
  const pathname = parsePathname(value);
  return (
    pathname !== null &&
    staticPaths.has(pathname) &&
    pathname !== "/login" &&
    pathname !== "/register"
  );
}

function isSessionReplayPath(value: string): boolean {
  return isErrorPath(value) && window.location.search === "" && window.location.hash === "";
}

function isTauriRuntime(): boolean {
  return window.location.protocol === "tauri:" || window.location.hostname === "tauri.localhost";
}

function canSendAnalyticsRequest(): boolean {
  if (navigator.doNotTrack === "1" || navigator.webdriver) return false;
  if (developmentMode || isTauriRuntime()) return true;
  return !new Set(["", "localhost", "127.0.0.1"]).has(window.location.hostname);
}

function sendAnalyticsRequest(path: "custom" | "error", payload: string): void {
  if (!apiUrl) return;
  void fetch(`${apiUrl}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: payload.length < 60_000,
    body: payload,
  }).catch(() => undefined);
}

async function loadBundledSessionReplayRecorder(): Promise<boolean> {
  try {
    const { record } = await import("@rrweb/record");
    Object.assign(window, { rrwebRecord: { record } });
    return true;
  } catch {
    return false;
  }
}

function shouldSample(rate: number): boolean {
  return rate >= 1 || (rate > 0 && Math.random() < rate);
}

function readProjectId(): string | null {
  return import.meta.env.VITE_SWETRIX_PROJECT_ID?.trim() || null;
}

function readApiUrl(): string | null {
  const configuredUrl = import.meta.env.VITE_SWETRIX_API_URL?.trim();
  if (!configuredUrl) return null;
  try {
    const url = new URL(configuredUrl);
    if (!new Set(["http:", "https:"]).has(url.protocol)) return null;
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    if (!url.pathname.endsWith("/log")) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function readRate(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value.trim() === "") return defaultValue;
  const rate = Number(value);
  return Number.isFinite(rate) ? Math.min(Math.max(rate, 0), 1) : defaultValue;
}

function readDuration(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value.trim() === "") return defaultValue;
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : defaultValue;
}
