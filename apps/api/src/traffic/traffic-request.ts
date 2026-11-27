import { webVitalNames, type TrafficDevice, type WebVitalName } from "@mimorii/contracts";
import { timezoneCountries } from "./timezone-countries.js";

export const maximumBatchEvents = 100;

const botPattern =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|pingdom|uptime|monitor|curl|wget|python|java\/|go-http|axios|node-fetch|okhttp|preview|facebookexternalhit|embedly|phantomjs|selenium|puppeteer|playwright/i;

export type TrafficInputEvent =
  | { kind: "pageview" }
  | { kind: "leave"; engagedMs: number; scrollDepth: number }
  | { kind: "event"; name: string }
  | { kind: "vital"; name: WebVitalName; value: number }
  | { kind: "error"; message: string; source: string | null }
  | {
      kind: "click";
      selector: string;
      label: string | null;
      x: number;
      y: number;
      rage: boolean;
    };

export interface TrafficBatch {
  siteKey: string;
  url: URL;
  path: string;
  referrer: string | null;
  device: TrafficDevice;
  country: string | null;
  language: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  events: TrafficInputEvent[];
}

export interface TrafficClient {
  browser: string;
  os: string;
}

export function isBot(userAgent: string): boolean {
  return !userAgent || botPattern.test(userAgent);
}

export function parseUserAgent(userAgent: string): TrafficClient {
  return { browser: browserName(userAgent), os: operatingSystem(userAgent) };
}

function browserName(userAgent: string): string {
  if (/Edg(e|A|iOS)?\//.test(userAgent)) return "Edge";
  if (/OPR\/|Opera/.test(userAgent)) return "Opera";
  if (/SamsungBrowser\//.test(userAgent)) return "Samsung Internet";
  if (/Firefox\/|FxiOS\//.test(userAgent)) return "Firefox";
  if (/Chrome\/|CriOS\//.test(userAgent)) return "Chrome";
  if (/Version\/.*Safari\//.test(userAgent)) return "Safari";
  return "Other";
}

function operatingSystem(userAgent: string): string {
  if (/Windows/.test(userAgent)) return "Windows";
  if (/Android/.test(userAgent)) return "Android";
  if (/iPhone|iPad|iPod/.test(userAgent)) return "iOS";
  if (/Mac OS X|Macintosh/.test(userAgent)) return "macOS";
  if (/CrOS/.test(userAgent)) return "ChromeOS";
  if (/Linux/.test(userAgent)) return "Linux";
  return "Other";
}

export function hostMatches(hostname: string, domains: readonly string[]): boolean {
  const host = hostname.toLowerCase();
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function normalizeDomain(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    const host = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname;
    const domain = host.replace(/^www\./, "");
    return /^[a-z0-9.-]+$/.test(domain) && domain.length <= 253 ? domain : null;
  } catch {
    return null;
  }
}

const identifierSegment =
  /^(?:[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}|\d{5,}|[\da-f]{24,})$/i;

function isIdentifier(segment: string): boolean {
  return (
    identifierSegment.test(segment) ||
    (segment.length >= 16 &&
      /^[\w-]+$/.test(segment) &&
      /\d.*\d/.test(segment) &&
      /[A-Z]/.test(segment) &&
      /[a-z]/.test(segment))
  );
}

export function normalizePath(url: URL): string {
  const path = url.pathname
    .replace(/\/{2,}/g, "/")
    .replace(/(.)\/$/, "$1")
    .split("/")
    .map((segment) => (isIdentifier(segment) ? ":id" : segment))
    .join("/");
  return path.slice(0, 300) || "/";
}

function scrubbed(value: string | null): string | null {
  return (
    value
      ?.replace(/[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi, "[email]")
      .replace(/\d{6,}/g, "[number]") ?? null
  );
}

export function parseBatch(body: unknown): TrafficBatch | null {
  const record = asRecord(typeof body === "string" ? safeJson(body) : body);
  if (!record) return null;
  const siteKey = text(record.k, 80);
  const url = parseUrl(record.u);
  if (!siteKey || !url || !Array.isArray(record.e)) return null;
  const events = record.e.slice(0, maximumBatchEvents).flatMap((value) => {
    const event = parseEvent(value);
    return event ? [event] : [];
  });
  if (!events.length) return null;
  return {
    siteKey,
    url,
    path: normalizePath(url),
    referrer:
      parseUrl(record.r)
        ?.hostname.replace(/^www\./, "")
        .toLowerCase() ?? null,
    device: deviceFromWidth(record.w),
    country: countryFromTimezone(record.z),
    language: languageCode(record.l),
    utmSource: text(url.searchParams.get("utm_source") ?? url.searchParams.get("ref"), 100),
    utmCampaign: text(url.searchParams.get("utm_campaign"), 100),
    events,
  };
}

function parseEvent(value: unknown): TrafficInputEvent | null {
  const event = asRecord(value);
  if (!event) return null;
  switch (event.t) {
    case "pageview":
      return { kind: "pageview" };
    case "leave": {
      const engagedMs = bounded(event.v, 0, 1_800_000);
      const scrollDepth = bounded(event.s, 0, 100);
      return engagedMs === null || scrollDepth === null
        ? null
        : { kind: "leave", engagedMs, scrollDepth: Math.round(scrollDepth) };
    }
    case "event": {
      const name = scrubbed(text(event.n, 100));
      return name ? { kind: "event", name } : null;
    }
    case "vital": {
      const name = webVitalNames.find((vital) => vital === event.n);
      const vitalValue = bounded(event.v, 0, name === "CLS" ? 100 : 600_000);
      return name && vitalValue !== null ? { kind: "vital", name, value: vitalValue } : null;
    }
    case "error": {
      const message = scrubbed(text(event.n, 300));
      const source = parseUrl(event.s);
      return message
        ? {
            kind: "error",
            message,
            source: source ? `${source.origin}${source.pathname}`.slice(0, 300) : null,
          }
        : null;
    }
    case "click": {
      const selector = text(event.s, 300);
      const x = bounded(event.x, 0, 1000);
      const y = bounded(event.y, 0, 1000);
      return selector && x !== null && y !== null
        ? {
            kind: "click",
            selector,
            label: scrubbed(text(event.l, 60)),
            x: Math.round(x),
            y: Math.round(y),
            rage: event.g === 1,
          }
        : null;
    }
    default:
      return null;
  }
}

function deviceFromWidth(value: unknown): TrafficDevice {
  const width = bounded(value, 0, 100_000) ?? 1_280;
  return width < 768 ? "mobile" : width < 1_024 ? "tablet" : "desktop";
}

function countryFromTimezone(value: unknown): string | null {
  return typeof value === "string" ? (timezoneCountries[value] ?? null) : null;
}

function languageCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.split("-")[0]?.toLowerCase() ?? "";
  return /^[a-z]{2,3}$/.test(code) ? code : null;
}

function parseUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function text(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maximumLength) : null;
}

function bounded(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(Math.max(value, minimum), maximum)
    : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
