import { BadRequestException, Injectable } from "@nestjs/common";
import {
  rateWebVital,
  trafficDevices,
  type TrafficBreakdownRow,
  type TrafficDevice,
  type TrafficErrorRow,
  type TrafficEventRow,
  type TrafficHeatmap,
  type TrafficHeatmapOverlay,
  type TrafficLive,
  type TrafficPageRow,
  type TrafficReport,
  type TrafficSeriesPoint,
  type TrafficTotals,
  type TrafficVitalRow,
  type WebVitalName,
} from "@mimorii/contracts";
import { DatabaseService } from "../database/database.service.js";
import { normalizePath } from "./traffic-request.js";

const DAY_MS = 86_400_000;

interface Window {
  from: Date;
  to: Date;
}

const breakdownColumns = {
  referrers: "COALESCE(utm_source, referrer_host, 'Direct')",
  campaigns: "utm_campaign",
  countries: "COALESCE(country, 'Unknown')",
  devices: "device",
  browsers: "browser",
  operatingSystems: "os",
  languages: "COALESCE(language, 'Unknown')",
} as const;

type BreakdownKey = keyof typeof breakdownColumns;

const sessionsCte = `
  WITH pv AS (
    SELECT visitor_hash, path, occurred_at,
      CASE WHEN occurred_at - LAG(occurred_at) OVER (PARTITION BY visitor_hash ORDER BY occurred_at)
        <= interval '30 minutes' THEN 0 ELSE 1 END AS starts
    FROM traffic_events
    WHERE site_id = ? AND kind = 'pageview' AND occurred_at >= ? AND occurred_at < ?
  ), numbered AS (
    SELECT visitor_hash, SUM(starts) OVER (
      PARTITION BY visitor_hash ORDER BY occurred_at ROWS UNBOUNDED PRECEDING) AS session
    FROM pv
  ), sessions AS (
    SELECT COUNT(*) AS views FROM numbered GROUP BY visitor_hash, session
  )`;

@Injectable()
export class TrafficReportsService {
  constructor(private readonly database: DatabaseService) {}

  async report(siteId: string, range: { from?: string; to?: string }): Promise<TrafficReport> {
    const window = parseWindow(range);
    const span = window.to.getTime() - window.from.getTime();
    const previous = { from: new Date(window.from.getTime() - span), to: window.from };
    const granularity = span <= 2 * DAY_MS ? "hour" : "day";
    const breakdownKeys = Object.keys(breakdownColumns) as BreakdownKey[];
    const [
      totals,
      previousTotals,
      series,
      pages,
      entryPages,
      events,
      vitals,
      errors,
      ...breakdowns
    ] = await Promise.all([
      this.totals(siteId, window),
      this.totals(siteId, previous),
      this.series(siteId, window, granularity),
      this.pages(siteId, window),
      this.entryPages(siteId, window),
      this.events(siteId, window),
      this.vitals(siteId, window),
      this.errors(siteId, window),
      ...breakdownKeys.map((key) => this.breakdown(siteId, window, key)),
    ]);
    const breakdownByKey = Object.fromEntries(
      breakdownKeys.map((key, index) => [key, breakdowns[index]!])
    ) as Record<BreakdownKey, TrafficBreakdownRow[]>;
    return {
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      granularity,
      totals,
      previousTotals,
      series,
      pages,
      entryPages,
      events,
      vitals,
      errors,
      ...breakdownByKey,
    };
  }

  async live(siteId: string): Promise<TrafficLive> {
    const since = new Date(Date.now() - 5 * 60_000);
    const [count, pages] = await Promise.all([
      this.database.get<{ visitors: number }>(
        `SELECT COUNT(DISTINCT visitor_hash)::int AS visitors FROM traffic_events
         WHERE site_id = ? AND occurred_at >= ?`,
        siteId,
        since
      ),
      this.database.all<{ path: string; visitors: number }>(
        `SELECT path, COUNT(DISTINCT visitor_hash)::int AS visitors FROM traffic_events
         WHERE site_id = ? AND occurred_at >= ?
         GROUP BY path ORDER BY visitors DESC, path LIMIT 10`,
        siteId,
        since
      ),
    ]);
    return { visitors: count?.visitors ?? 0, pages };
  }

  async heatmap(
    siteId: string,
    input: { path?: string; device?: string; from?: string; to?: string }
  ): Promise<TrafficHeatmap> {
    const window = parseWindow(input);
    const path = requirePath(input.path);
    const device = parseDevice(input.device);
    const scope = [siteId, path, device, window.from, window.to];
    const [elements, totals, scroll] = await Promise.all([
      this.database.all<{
        selector: string;
        label: string | null;
        clicks: number;
        rage_clicks: number;
      }>(
        `SELECT selector, MODE() WITHIN GROUP (ORDER BY label) AS label, COUNT(*)::int AS clicks,
           COUNT(*) FILTER (WHERE rage)::int AS rage_clicks
         FROM traffic_clicks
         WHERE site_id = ? AND path = ? AND device = ? AND occurred_at >= ? AND occurred_at < ?
         GROUP BY selector ORDER BY clicks DESC, selector LIMIT 50`,
        ...scope
      ),
      this.database.get<{ pageviews: number; clicks: number; rage_clicks: number }>(
        `SELECT
           (SELECT COUNT(*)::int FROM traffic_events
            WHERE site_id = ? AND path = ? AND device = ? AND occurred_at >= ? AND occurred_at < ?
              AND kind = 'pageview') AS pageviews,
           COUNT(*)::int AS clicks, COUNT(*) FILTER (WHERE rage)::int AS rage_clicks
         FROM traffic_clicks
         WHERE site_id = ? AND path = ? AND device = ? AND occurred_at >= ? AND occurred_at < ?`,
        ...scope,
        ...scope
      ),
      this.database.get<{ d25: number; d50: number; d75: number; d100: number }>(
        `SELECT COUNT(*) FILTER (WHERE scroll_depth >= 25)::int AS d25,
           COUNT(*) FILTER (WHERE scroll_depth >= 50)::int AS d50,
           COUNT(*) FILTER (WHERE scroll_depth >= 75)::int AS d75,
           COUNT(*) FILTER (WHERE scroll_depth >= 98)::int AS d100
         FROM traffic_events
         WHERE site_id = ? AND path = ? AND device = ? AND occurred_at >= ? AND occurred_at < ?
           AND kind = 'leave'`,
        ...scope
      ),
    ]);
    return {
      path,
      device,
      pageviews: totals?.pageviews ?? 0,
      clicks: totals?.clicks ?? 0,
      rageClicks: totals?.rage_clicks ?? 0,
      elements: elements.map((row) => ({
        selector: row.selector,
        label: row.label,
        clicks: row.clicks,
        rageClicks: row.rage_clicks,
      })),
      scroll: [
        { depth: 25, pageviews: scroll?.d25 ?? 0 },
        { depth: 50, pageviews: scroll?.d50 ?? 0 },
        { depth: 75, pageviews: scroll?.d75 ?? 0 },
        { depth: 100, pageviews: scroll?.d100 ?? 0 },
      ],
    };
  }

  async overlay(
    siteId: string,
    input: { path?: string; device?: string }
  ): Promise<TrafficHeatmapOverlay> {
    const path = requirePath(input.path);
    const device = parseDevice(input.device);
    const points = await this.database.all<{
      selector: string;
      x: number;
      y: number;
      clicks: number;
      rage_clicks: number;
    }>(
      `SELECT selector, (x / 25) * 25 + 12 AS x, (y / 25) * 25 + 12 AS y, COUNT(*)::int AS clicks,
         COUNT(*) FILTER (WHERE rage)::int AS rage_clicks
       FROM traffic_clicks
       WHERE site_id = ? AND path = ? AND device = ? AND occurred_at >= ?
       GROUP BY 1, 2, 3 ORDER BY clicks DESC LIMIT 2000`,
      siteId,
      path,
      device,
      new Date(Date.now() - 30 * DAY_MS)
    );
    return {
      path,
      device,
      points: points.map((point) => ({
        selector: point.selector,
        x: point.x,
        y: point.y,
        clicks: point.clicks,
        rageClicks: point.rage_clicks,
      })),
    };
  }

  private async totals(siteId: string, window: Window): Promise<TrafficTotals> {
    const row = await this.database.get<{
      pageviews: number;
      visitors: number;
      sessions: number;
      bounces: number;
      engagement: number | null;
    }>(
      `${sessionsCte}
       SELECT (SELECT COUNT(*) FROM pv)::int AS pageviews,
         (SELECT COUNT(DISTINCT visitor_hash) FROM pv)::int AS visitors,
         (SELECT COUNT(*) FROM sessions)::int AS sessions,
         (SELECT COUNT(*) FILTER (WHERE views = 1) FROM sessions)::int AS bounces,
         (SELECT AVG(value) FROM traffic_events
          WHERE site_id = ? AND kind = 'leave' AND occurred_at >= ? AND occurred_at < ?) AS engagement`,
      siteId,
      window.from,
      window.to,
      siteId,
      window.from,
      window.to
    );
    const sessions = row?.sessions ?? 0;
    return {
      visitors: row?.visitors ?? 0,
      pageviews: row?.pageviews ?? 0,
      sessions,
      bounceRate: sessions ? (row!.bounces / sessions) * 100 : null,
      averageEngagementMs:
        row?.engagement === null || row?.engagement === undefined
          ? null
          : Math.round(row.engagement),
    };
  }

  private series(
    siteId: string,
    window: Window,
    granularity: "hour" | "day"
  ): Promise<TrafficSeriesPoint[]> {
    return this.database.all<TrafficSeriesPoint>(
      `SELECT to_char(b.bucket AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS bucket,
         COALESCE(s.visitors, 0)::int AS visitors, COALESCE(s.pageviews, 0)::int AS pageviews
       FROM generate_series(date_trunc(?, ?::timestamptz), ?::timestamptz - interval '1 microsecond',
         (?::text)::interval) AS b(bucket)
       LEFT JOIN (
         SELECT date_trunc(?, occurred_at) AS bucket, COUNT(DISTINCT visitor_hash) AS visitors,
           COUNT(*) AS pageviews
         FROM traffic_events
         WHERE site_id = ? AND kind = 'pageview' AND occurred_at >= ? AND occurred_at < ?
         GROUP BY 1
       ) s ON s.bucket = b.bucket
       ORDER BY b.bucket`,
      granularity,
      window.from,
      window.to,
      `1 ${granularity}`,
      granularity,
      siteId,
      window.from,
      window.to
    );
  }

  private async pages(siteId: string, window: Window): Promise<TrafficPageRow[]> {
    const rows = await this.database.all<{
      path: string;
      visitors: number;
      pageviews: number;
      engagement: number | null;
      scroll: number | null;
    }>(
      `SELECT p.path, p.visitors, p.pageviews, l.engagement, l.scroll
       FROM (
         SELECT path, COUNT(DISTINCT visitor_hash)::int AS visitors, COUNT(*)::int AS pageviews
         FROM traffic_events
         WHERE site_id = ? AND kind = 'pageview' AND occurred_at >= ? AND occurred_at < ?
         GROUP BY path ORDER BY pageviews DESC, path LIMIT 20
       ) p
       LEFT JOIN (
         SELECT path, AVG(value) AS engagement, AVG(scroll_depth) AS scroll
         FROM traffic_events
         WHERE site_id = ? AND kind = 'leave' AND occurred_at >= ? AND occurred_at < ?
         GROUP BY path
       ) l ON l.path = p.path
       ORDER BY p.pageviews DESC, p.path`,
      siteId,
      window.from,
      window.to,
      siteId,
      window.from,
      window.to
    );
    return rows.map((row) => ({
      path: row.path,
      visitors: row.visitors,
      pageviews: row.pageviews,
      averageEngagementMs: row.engagement === null ? null : Math.round(row.engagement),
      averageScrollDepth: row.scroll === null ? null : Math.round(row.scroll),
    }));
  }

  private entryPages(siteId: string, window: Window): Promise<TrafficBreakdownRow[]> {
    return this.database.all<TrafficBreakdownRow>(
      `${sessionsCte}
       SELECT path AS value, COUNT(DISTINCT visitor_hash)::int AS visitors, COUNT(*)::int AS pageviews
       FROM pv WHERE starts = 1 GROUP BY path ORDER BY pageviews DESC, path LIMIT 10`,
      siteId,
      window.from,
      window.to
    );
  }

  private breakdown(
    siteId: string,
    window: Window,
    key: BreakdownKey
  ): Promise<TrafficBreakdownRow[]> {
    const column = breakdownColumns[key];
    return this.database.all<TrafficBreakdownRow>(
      `SELECT ${column} AS value, COUNT(DISTINCT visitor_hash)::int AS visitors, COUNT(*)::int AS pageviews
       FROM traffic_events
       WHERE site_id = ? AND kind = 'pageview' AND occurred_at >= ? AND occurred_at < ?
         AND ${column} IS NOT NULL
       GROUP BY 1 ORDER BY visitors DESC, pageviews DESC, 1 LIMIT 10`,
      siteId,
      window.from,
      window.to
    );
  }

  private events(siteId: string, window: Window): Promise<TrafficEventRow[]> {
    return this.database.all<TrafficEventRow>(
      `SELECT name, COUNT(*)::int AS count, COUNT(DISTINCT visitor_hash)::int AS visitors
       FROM traffic_events
       WHERE site_id = ? AND kind = 'event' AND occurred_at >= ? AND occurred_at < ?
       GROUP BY name ORDER BY count DESC, name LIMIT 20`,
      siteId,
      window.from,
      window.to
    );
  }

  private async vitals(siteId: string, window: Window): Promise<TrafficVitalRow[]> {
    const rows = await this.database.all<{ name: WebVitalName; p75: number; samples: number }>(
      `SELECT name, percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75, COUNT(*)::int AS samples
       FROM traffic_events
       WHERE site_id = ? AND kind = 'vital' AND occurred_at >= ? AND occurred_at < ?
       GROUP BY name`,
      siteId,
      window.from,
      window.to
    );
    return rows.map((row) => ({
      name: row.name,
      p75: row.name === "CLS" ? Math.round(row.p75 * 1000) / 1000 : Math.round(row.p75),
      samples: row.samples,
      rating: rateWebVital(row.name, row.p75),
    }));
  }

  private async errors(siteId: string, window: Window): Promise<TrafficErrorRow[]> {
    const rows = await this.database.all<{
      message: string;
      count: number;
      visitors: number;
      source: string | null;
      path: string | null;
      last_seen_at: string;
    }>(
      `SELECT name AS message, COUNT(*)::int AS count, COUNT(DISTINCT visitor_hash)::int AS visitors,
         MODE() WITHIN GROUP (ORDER BY source) AS source, MODE() WITHIN GROUP (ORDER BY path) AS path,
         MAX(occurred_at) AS last_seen_at
       FROM traffic_events
       WHERE site_id = ? AND kind = 'error' AND occurred_at >= ? AND occurred_at < ?
       GROUP BY name ORDER BY count DESC, name LIMIT 20`,
      siteId,
      window.from,
      window.to
    );
    return rows.map((row) => ({
      message: row.message,
      count: row.count,
      visitors: row.visitors,
      source: row.source,
      path: row.path,
      lastSeenAt: new Date(row.last_seen_at).toISOString(),
    }));
  }
}

function parseWindow(range: { from?: string; to?: string }): Window {
  const to = range.to ? new Date(range.to) : new Date();
  const from = range.from ? new Date(range.from) : new Date(to.getTime() - 7 * DAY_MS);
  if (Number.isNaN(to.getTime()) || Number.isNaN(from.getTime()) || from >= to) {
    throw new BadRequestException("Choose a valid time range");
  }
  if (to.getTime() - from.getTime() > 400 * DAY_MS) {
    throw new BadRequestException("Choose a range of up to 400 days");
  }
  return { from, to };
}

function requirePath(value: string | undefined): string {
  if (!value?.startsWith("/") || value.length > 300) throw new BadRequestException("Choose a page");
  return normalizePath(new URL(value, "https://page.invalid"));
}

function parseDevice(value: string | undefined): TrafficDevice {
  const device = trafficDevices.find((candidate) => candidate === value);
  if (!device) throw new BadRequestException("Choose a device");
  return device;
}
