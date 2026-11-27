import { applicationRuntime } from "./runtime";

interface MimoriiTracker {
  track: (name: string) => void;
  consent: (granted: boolean) => void;
}

declare global {
  interface Window {
    mimorii?: MimoriiTracker;
  }
}

const siteKey: string = import.meta.env.VITE_MIMORII_TRAFFIC_SITE?.trim() ?? "";

export const analyticsConfigured = applicationRuntime === "web" && Boolean(siteKey);

let granted = false;
let script: HTMLScriptElement | null = null;

export function setAnalyticsConsent(next: boolean): void {
  granted = analyticsConfigured && next;
  if (window.mimorii) {
    window.mimorii.consent(granted);
    return;
  }
  if (!granted || script) return;
  script = document.createElement("script");
  script.defer = true;
  script.src = `${window.location.origin}/api/traffic/script.js`;
  script.dataset.site = siteKey;
  script.dataset.consent = "";
  script.addEventListener("load", () => window.mimorii?.consent(granted));
  document.head.append(script);
}

export function trackEvent(name: string): void {
  window.mimorii?.track(name);
}
