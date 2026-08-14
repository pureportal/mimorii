export const PRIVACY_PREFERENCES_KEY = "mimorii.privacy";

const privacyPreferencesVersion = 1;

export interface PrivacyPreferences {
  version: typeof privacyPreferencesVersion;
  analytics: boolean;
  sessionReplay: boolean;
  decidedAt: string;
}

export interface PrivacyPreferenceSelection {
  analytics: boolean;
  sessionReplay: boolean;
}

export const analyticsConfigured =
  Boolean(import.meta.env.VITE_SWETRIX_PROJECT_ID?.trim()) && hasValidSwetrixEndpoint();

export const sessionReplayConfigured =
  analyticsConfigured && import.meta.env.VITE_SWETRIX_SESSION_REPLAY_ENABLED === "true";

export function readPrivacyPreferences(): PrivacyPreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PRIVACY_PREFERENCES_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!isPrivacyPreferences(value)) return null;
    return {
      version: privacyPreferencesVersion,
      analytics: value.analytics,
      sessionReplay: value.analytics && sessionReplayConfigured && value.sessionReplay,
      decidedAt: value.decidedAt,
    };
  } catch {
    return null;
  }
}

function isPrivacyPreferences(value: unknown): value is PrivacyPreferences {
  if (!value || typeof value !== "object") return false;
  return (
    "version" in value &&
    value.version === privacyPreferencesVersion &&
    "analytics" in value &&
    typeof value.analytics === "boolean" &&
    "sessionReplay" in value &&
    typeof value.sessionReplay === "boolean" &&
    "decidedAt" in value &&
    typeof value.decidedAt === "string"
  );
}

export function storePrivacyPreferences(selection: PrivacyPreferenceSelection): PrivacyPreferences {
  const preferences: PrivacyPreferences = {
    version: privacyPreferencesVersion,
    analytics: analyticsConfigured && selection.analytics,
    sessionReplay:
      analyticsConfigured &&
      selection.analytics &&
      sessionReplayConfigured &&
      selection.sessionReplay,
    decidedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(PRIVACY_PREFERENCES_KEY, JSON.stringify(preferences));
  return preferences;
}

export function hasAnalyticsConsent(): boolean {
  return readPrivacyPreferences()?.analytics === true;
}

export function hasSessionReplayConsent(): boolean {
  return readPrivacyPreferences()?.sessionReplay === true;
}

function hasValidSwetrixEndpoint(): boolean {
  const configuredUrl = import.meta.env.VITE_SWETRIX_API_URL?.trim();
  if (!configuredUrl) return false;
  try {
    const url = new URL(configuredUrl);
    return (
      new Set(["http:", "https:"]).has(url.protocol) &&
      url.pathname.replace(/\/+$/, "").endsWith("/log")
    );
  } catch {
    return false;
  }
}
