import { getServerUrl } from "./api";

export const trafficRanges = [
  { id: "24h", label: "24 hours", hours: 24 },
  { id: "7d", label: "7 days", hours: 7 * 24 },
  { id: "30d", label: "30 days", hours: 30 * 24 },
  { id: "90d", label: "90 days", hours: 90 * 24 },
] as const;

export type TrafficRangeId = (typeof trafficRanges)[number]["id"];

export function trafficRangeParameters(id: TrafficRangeId, now = Date.now()): URLSearchParams {
  const range = trafficRanges.find((candidate) => candidate.id === id)!;
  const hour = 3_600_000;
  const to = Math.ceil(now / hour) * hour;
  return new URLSearchParams({
    from: new Date(to - range.hours * hour).toISOString(),
    to: new Date(to).toISOString(),
  });
}

export function trackingSnippet(publicKey: string, waitForConsent: boolean): string {
  const consent = waitForConsent ? " data-consent" : "";
  return `<script defer src="${getServerUrl()}/traffic/script.js" data-site="${publicKey}"${consent}></script>`;
}

export function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

const countryNames = new Intl.DisplayNames(undefined, { type: "region" });
const languageNames = new Intl.DisplayNames(undefined, { type: "language" });

export function countryName(code: string): string {
  if (code === "Unknown") return code;
  try {
    return countryNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export function languageName(code: string): string {
  if (code === "Unknown") return code;
  try {
    return languageNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export function countryFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(0x1f1a5 + code.charCodeAt(0), 0x1f1a5 + code.charCodeAt(1));
}
