import { Injectable } from "@nestjs/common";
import { createHmac, randomBytes } from "node:crypto";
import { DatabaseService } from "../database/database.service.js";
import {
  hostMatches,
  isBot,
  parseBatch,
  parseUserAgent,
  type TrafficBatch,
  type TrafficInputEvent,
} from "./traffic-request.js";

export type TrafficCollectResult =
  | { accepted: true; heatmaps: boolean }
  | { accepted: false; reason: "invalid" | "unknown-site" | "domain" | "bot" };

interface SiteRow {
  id: string;
  domains: string[];
  heatmaps_enabled: boolean;
}

type ClickEvent = Extract<TrafficInputEvent, { kind: "click" }>;
type StoredEvent = Exclude<TrafficInputEvent, ClickEvent>;

@Injectable()
export class TrafficCollectorService {
  private readonly salts = new Map<string, Buffer>();

  constructor(private readonly database: DatabaseService) {}

  async collect(
    body: unknown,
    client: { ip: string; userAgent: string }
  ): Promise<TrafficCollectResult> {
    const batch = parseBatch(body);
    if (!batch) return { accepted: false, reason: "invalid" };
    if (isBot(client.userAgent)) return { accepted: false, reason: "bot" };
    const site = await this.database.get<SiteRow>(
      "SELECT id, domains, heatmaps_enabled FROM traffic_sites WHERE public_key = ?",
      batch.siteKey
    );
    if (!site) return { accepted: false, reason: "unknown-site" };
    if (!hostMatches(batch.url.hostname, site.domains))
      return { accepted: false, reason: "domain" };
    const now = new Date();
    const visitorHash = await this.visitorHash(site.id, client, now);
    const { browser, os } = parseUserAgent(client.userAgent);
    const referrer =
      batch.referrer && !hostMatches(batch.referrer, site.domains) ? batch.referrer : null;
    const events = batch.events.filter((event): event is StoredEvent => event.kind !== "click");
    const clicks = site.heatmaps_enabled
      ? batch.events.filter((event): event is ClickEvent => event.kind === "click")
      : [];
    await this.database.transaction(async () => {
      if (events.length)
        await this.storeEvents(site.id, batch, events, { visitorHash, browser, os, referrer, now });
      if (clicks.length) await this.storeClicks(site.id, batch, clicks, now);
      await this.database.run(
        "UPDATE traffic_sites SET last_event_at = ? WHERE id = ?",
        now,
        site.id
      );
    });
    return { accepted: true, heatmaps: site.heatmaps_enabled };
  }

  private async storeEvents(
    siteId: string,
    batch: TrafficBatch,
    events: StoredEvent[],
    context: {
      visitorHash: string;
      browser: string;
      os: string;
      referrer: string | null;
      now: Date;
    }
  ): Promise<void> {
    const rows = events.map((event) => {
      const isPageview = event.kind === "pageview";
      return [
        siteId,
        context.now,
        event.kind,
        context.visitorHash,
        batch.path,
        isPageview ? context.referrer : null,
        isPageview ? batch.utmSource : null,
        isPageview ? batch.utmCampaign : null,
        batch.device,
        context.browser,
        context.os,
        batch.country,
        batch.language,
        eventName(event),
        eventValue(event),
        event.kind === "leave" ? event.scrollDepth : null,
        event.kind === "error" ? event.source : null,
      ];
    });
    await this.database.run(
      `INSERT INTO traffic_events
       (site_id, occurred_at, kind, visitor_hash, path, referrer_host, utm_source, utm_campaign,
        device, browser, os, country, language, name, value, scroll_depth, source)
       VALUES ${rows.map(() => `(${Array(17).fill("?").join(", ")})`).join(", ")}`,
      ...rows.flat()
    );
  }

  private async storeClicks(
    siteId: string,
    batch: TrafficBatch,
    clicks: ClickEvent[],
    now: Date
  ): Promise<void> {
    await this.database.run(
      `INSERT INTO traffic_clicks (site_id, occurred_at, path, device, selector, label, x, y, rage)
       VALUES ${clicks.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}`,
      ...clicks.flatMap((click) => [
        siteId,
        now,
        batch.path,
        batch.device,
        click.selector,
        click.label,
        click.x,
        click.y,
        click.rage,
      ])
    );
  }

  private async visitorHash(
    siteId: string,
    client: { ip: string; userAgent: string },
    now: Date
  ): Promise<string> {
    const salt = await this.salt(now.toISOString().slice(0, 10));
    return createHmac("sha256", salt)
      .update(`${siteId}\n${client.ip}\n${client.userAgent}`)
      .digest()
      .readBigInt64BE(0)
      .toString();
  }

  private async salt(day: string): Promise<Buffer> {
    const cached = this.salts.get(day);
    if (cached) return cached;
    await this.database.run("DELETE FROM traffic_salts WHERE day < ?", day);
    await this.database.run(
      "INSERT INTO traffic_salts (day, salt) VALUES (?, ?) ON CONFLICT (day) DO NOTHING",
      day,
      randomBytes(32)
    );
    const row = await this.database.get<{ salt: Buffer }>(
      "SELECT salt FROM traffic_salts WHERE day = ?",
      day
    );
    this.salts.clear();
    this.salts.set(day, row!.salt);
    return row!.salt;
  }
}

function eventName(event: StoredEvent): string | null {
  switch (event.kind) {
    case "event":
    case "vital":
      return event.name;
    case "error":
      return event.message;
    default:
      return null;
  }
}

function eventValue(event: StoredEvent): number | null {
  switch (event.kind) {
    case "leave":
      return event.engagedMs;
    case "vital":
      return event.value;
    default:
      return null;
  }
}
