export const trafficDevices = ["desktop", "tablet", "mobile"] as const;
export type TrafficDevice = (typeof trafficDevices)[number];

export const webVitalNames = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export type WebVitalName = (typeof webVitalNames)[number];

export const webVitalThresholds: Record<WebVitalName, { good: number; poor: number }> = {
  LCP: { good: 2_500, poor: 4_000 },
  INP: { good: 200, poor: 500 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1_800, poor: 3_000 },
  TTFB: { good: 800, poor: 1_800 },
};

export type WebVitalRating = "good" | "needs-improvement" | "poor";

export function rateWebVital(name: WebVitalName, value: number): WebVitalRating {
  const threshold = webVitalThresholds[name];
  if (value <= threshold.good) return "good";
  return value <= threshold.poor ? "needs-improvement" : "poor";
}

export const trafficRetention = { eventDays: 395, clickDays: 90 } as const;

export interface TrafficSiteSummary {
  id: string;
  resourceId: string;
  resourceName: string;
  publicKey: string;
  domains: string[];
  heatmapsEnabled: boolean;
  lastEventAt: string | null;
  visitorsToday: number;
  liveVisitors: number;
  createdAt: string;
}

export interface TrafficTotals {
  visitors: number;
  pageviews: number;
  sessions: number;
  bounceRate: number | null;
  averageEngagementMs: number | null;
}

export interface TrafficSeriesPoint {
  bucket: string;
  visitors: number;
  pageviews: number;
}

export interface TrafficBreakdownRow {
  value: string;
  visitors: number;
  pageviews: number;
}

export interface TrafficPageRow {
  path: string;
  visitors: number;
  pageviews: number;
  averageEngagementMs: number | null;
  averageScrollDepth: number | null;
}

export interface TrafficEventRow {
  name: string;
  count: number;
  visitors: number;
}

export interface TrafficVitalRow {
  name: WebVitalName;
  p75: number;
  samples: number;
  rating: WebVitalRating;
}

export interface TrafficErrorRow {
  message: string;
  count: number;
  visitors: number;
  source: string | null;
  path: string | null;
  lastSeenAt: string;
}

export interface TrafficReport {
  from: string;
  to: string;
  granularity: "hour" | "day";
  totals: TrafficTotals;
  previousTotals: TrafficTotals;
  series: TrafficSeriesPoint[];
  pages: TrafficPageRow[];
  entryPages: TrafficBreakdownRow[];
  referrers: TrafficBreakdownRow[];
  campaigns: TrafficBreakdownRow[];
  countries: TrafficBreakdownRow[];
  devices: TrafficBreakdownRow[];
  browsers: TrafficBreakdownRow[];
  operatingSystems: TrafficBreakdownRow[];
  languages: TrafficBreakdownRow[];
  events: TrafficEventRow[];
  vitals: TrafficVitalRow[];
  errors: TrafficErrorRow[];
}

export interface TrafficLive {
  visitors: number;
  pages: Array<{ path: string; visitors: number }>;
}

export interface TrafficHeatmapElement {
  selector: string;
  label: string | null;
  clicks: number;
  rageClicks: number;
}

export interface TrafficScrollDepth {
  depth: 25 | 50 | 75 | 100;
  pageviews: number;
}

export interface TrafficHeatmap {
  path: string;
  device: TrafficDevice;
  pageviews: number;
  clicks: number;
  rageClicks: number;
  elements: TrafficHeatmapElement[];
  scroll: TrafficScrollDepth[];
}

export interface TrafficHeatmapPoint {
  selector: string;
  x: number;
  y: number;
  clicks: number;
  rageClicks: number;
}

export interface TrafficHeatmapOverlay {
  path: string;
  device: TrafficDevice;
  points: TrafficHeatmapPoint[];
}

export interface TrafficHeatmapLink {
  url: string;
  expiresAt: string;
}
