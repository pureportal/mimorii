import { analyticsConfigured } from "./analytics";

export const PRIVACY_PREFERENCES_KEY = "mimorii.privacy";

const privacyPreferencesVersion = 2;

export interface PrivacyPreferences {
  version: typeof privacyPreferencesVersion;
  analytics: boolean;
  decidedAt: string;
}

export function readPrivacyPreferences(): PrivacyPreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PRIVACY_PREFERENCES_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return isPrivacyPreferences(value) ? value : null;
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
    "decidedAt" in value &&
    typeof value.decidedAt === "string"
  );
}

export function storePrivacyPreferences(analytics: boolean): PrivacyPreferences {
  const preferences: PrivacyPreferences = {
    version: privacyPreferencesVersion,
    analytics: analyticsConfigured && analytics,
    decidedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(PRIVACY_PREFERENCES_KEY, JSON.stringify(preferences));
  return preferences;
}
