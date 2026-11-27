import type { INestApplication } from "@nestjs/common";
import type {
  CreatedApp,
  IncidentSummary,
  LogAlertRuleSummary,
  TrafficHeatmap,
  TrafficReport,
} from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseService } from "../src/database/database.service.js";
import { seedGlobalAdministrator } from "../src/database/seed/global-admin.js";
import { LogAlertsService } from "../src/logs/log-alerts.service.js";
import { registerAccount, signIn } from "./fixtures/two-factor.js";

const databaseConfigured = [
  "MIMORII_DB_HOST",
  "MIMORII_DB_PORT",
  "MIMORII_DB_NAME",
  "MIMORII_DB_USER",
  "MIMORII_DB_PASSWORD",
].every((name) => Boolean(process.env[name]));

const firefox = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0";
const safari =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

describe.skipIf(!databaseConfigured)("Apps and website traffic", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.MIMORII_JWT_SECRET = "test-only-secret-with-at-least-thirty-two-characters";
    process.env.MIMORII_SCHEDULER_ENABLED = "false";
    process.env.MIMORII_RATE_LIMIT = "10000";
    process.env.MIMORII_PUBLIC_URL = "http://localhost:4310";
    const { createApplication } = await import("../src/bootstrap.js");
    app = await createApplication();
    await app.init();
  }, 300_000);

  afterAll(async () => {
    if (app) await app.close();
  }, 60_000);

  it("connects Machdoch with a health check, activity logs, and desktop alerts", async () => {
    const server = app.getHttpServer();
    const suffix = randomUUID().slice(0, 8);
    const owner = await registerAccount(app, {
      name: "Owner",
      email: `machdoch-${suffix}@example.com`,
      password: "SecurePassword123",
    });
    const administratorEmail = `machdoch-admin-${suffix}@example.com`;
    const administrator = await registerAccount(app, {
      name: "Administrator",
      email: administratorEmail,
      password: "SecurePassword123",
    });
    await seedGlobalAdministrator(app.get(DatabaseService), administrator.user.id, {
      NODE_ENV: "development",
    });
    const admin = await signIn(app, administratorEmail, "SecurePassword123");
    const authorization = `Bearer ${owner.accessToken}`;
    const teamId = owner.teams[0]!.id;
    await request(server)
      .patch(`/api/admin/teams/${teamId}/logs`)
      .set("authorization", `Bearer ${admin.accessToken}`)
      .send({ enabled: true })
      .expect(200);

    const machdoch = await request(server)
      .post(`/api/teams/${teamId}/apps`)
      .set("authorization", authorization)
      .send({ kind: "machdoch-cloud", name: "Machdoch", address: "https://example.com" })
      .expect(201);
    const created = machdoch.body as CreatedApp;
    expect(created.resource).toMatchObject({
      app: "machdoch-cloud",
      logQuery: '{service="machdoch-cloud"}',
    });
    expect(created.logToken).toMatch(/^mim_log_/);
    const checks = await request(server)
      .get(`/api/teams/${teamId}/checks?resourceId=${created.resource.id}`)
      .set("authorization", authorization)
      .expect(200);
    expect(
      checks.body.map((check: { config: { target: { url: string } } }) => check.config.target.url)
    ).toEqual(["https://example.com/healthz"]);

    const delivered = await request(server)
      .post("/api/logs/push")
      .set("authorization", `Bearer ${created.logToken}`)
      .send({
        labels: { service: "machdoch-cloud" },
        entries: [
          {
            timestamp: new Date().toISOString(),
            level: "error",
            message: "Task failed · MD-12 Fix login · Model request timed out",
            labels: { activity: "task", device: "Build server" },
            attributes: { status: "failed", model: "claude-opus-5-5", tokens: 1200 },
          },
          {
            timestamp: new Date().toISOString(),
            level: "warn",
            message: "Client disconnected",
            labels: { activity: "client", device: "Office PC" },
            attributes: { status: "warning" },
          },
        ],
      })
      .expect(202);
    expect(delivered.body).toMatchObject({ accepted: 2, rejected: 0 });
    const logs = await request(server)
      .get(`/api/teams/${teamId}/logs`)
      .query({ query: `${created.resource.logQuery} |= "Task failed"` })
      .set("authorization", authorization)
      .expect(200);
    expect(JSON.stringify(logs.body)).toContain("Model request timed out");

    await app.get(LogAlertsService).evaluate(teamId);
    const incidents = await request(server)
      .get(`/api/teams/${teamId}/incidents?status=active`)
      .set("authorization", authorization)
      .expect(200);
    expect(
      (incidents.body as IncidentSummary[]).map((incident) => ({
        title: incident.title,
        impact: incident.impact,
        resourceIds: incident.resources.map((resource) => resource.id),
      }))
    ).toEqual(
      expect.arrayContaining([
        {
          title: "Machdoch: Desktop app disconnected",
          impact: "minor",
          resourceIds: [created.resource.id],
        },
        { title: "Machdoch: Errors", impact: "major", resourceIds: [created.resource.id] },
      ])
    );
    const rules = await request(server)
      .get(`/api/teams/${teamId}/logs/alerts`)
      .set("authorization", authorization)
      .expect(200);
    expect(
      (rules.body as LogAlertRuleSummary[]).map((rule) => [rule.name, rule.autoResolve])
    ).toEqual([
      ["Desktop app disconnected", false],
      ["Errors", true],
    ]);
  });

  it("connects an app, tracks its website, and renders heatmaps", async () => {
    const server = app.getHttpServer();
    const owner = await registerAccount(app, {
      name: "Owner",
      email: `traffic-${randomUUID().slice(0, 8)}@example.com`,
      password: "SecurePassword123",
    });
    const authorization = `Bearer ${owner.accessToken}`;
    const teamId = owner.teams[0]!.id;

    const lifie = await request(server)
      .post(`/api/teams/${teamId}/apps`)
      .set("authorization", authorization)
      .send({ kind: "lifie", name: "Lifie", address: "example.com" })
      .expect(201);
    const created = lifie.body as CreatedApp;
    expect(created.resource).toMatchObject({ name: "Lifie", kind: "service", app: "lifie" });
    expect(created.enrollmentCode).toBeNull();
    const checks = await request(server)
      .get(`/api/teams/${teamId}/checks?resourceId=${created.resource.id}`)
      .set("authorization", authorization)
      .expect(200);
    expect(checks.body).toHaveLength(1);
    expect(checks.body[0].config.target.url).toBe("https://example.com/health");
    expect(checks.body[0].config.jsonAssertions.conditions[0]).toMatchObject({
      pointer: "/status",
      expectedValue: "ok",
    });

    const foxytail = await request(server)
      .post(`/api/teams/${teamId}/apps`)
      .set("authorization", authorization)
      .send({ kind: "foxytail", name: "Foxytail" })
      .expect(201);
    expect(foxytail.body.enrollmentCode).toEqual(expect.any(String));
    await request(server)
      .post(`/api/teams/${teamId}/apps`)
      .set("authorization", authorization)
      .send({ kind: "machdoch-cloud", name: "Machdoch" })
      .expect(403);

    await request(server)
      .post(`/api/teams/${teamId}/resources/${created.resource.id}/alerts`)
      .set("authorization", authorization)
      .send({ name: "Memory", metric: "memoryPercent", operator: "greaterThan", threshold: 90 })
      .expect(400);

    const site = await request(server)
      .post(`/api/teams/${teamId}/traffic/sites`)
      .set("authorization", authorization)
      .send({ resourceId: created.resource.id })
      .expect(201);
    expect(site.body.domains).toEqual(["example.com"]);
    expect(site.body.heatmapsEnabled).toBe(true);
    const siteId: string = site.body.id;
    const siteKey: string = site.body.publicKey;

    const script = await request(server).get("/api/traffic/script.js").expect(200);
    expect(script.headers["content-type"]).toContain("application/javascript");
    expect(script.headers["access-control-allow-origin"]).toBe("*");
    expect(() => new Function(script.text)).not.toThrow();

    const collect = (userAgent: string, body: Record<string, unknown>) =>
      request(server)
        .post("/api/traffic/collect")
        .set("content-type", "text/plain")
        .set("origin", "https://www.example.com")
        .set("user-agent", userAgent)
        .send(JSON.stringify({ k: siteKey, z: "Europe/Berlin", l: "de-DE", ...body }))
        .expect(202);

    const first = await collect(firefox, {
      u: "https://www.example.com/pricing?utm_source=newsletter&utm_campaign=spring&email=someone@example.com",
      r: "https://news.ycombinator.com/item?id=1",
      w: 1440,
      e: [{ t: "pageview" }],
    });
    expect(first.body).toEqual({ heatmaps: true });
    expect(first.headers["access-control-allow-origin"]).toBe("*");
    await collect(firefox, {
      u: "https://www.example.com/pricing",
      w: 1440,
      e: [
        { t: "event", n: "Signup" },
        { t: "vital", n: "LCP", v: 1800 },
        { t: "error", n: "TypeError: price is undefined", s: "https://www.example.com/app.js?v=3" },
        { t: "click", s: "main>button.buy", l: "Buy now", x: 500, y: 400 },
        { t: "click", s: "main>button.buy", l: "Buy now", x: 510, y: 420, g: 1 },
        { t: "leave", v: 42_000, s: 80 },
      ],
    });
    await collect(safari, { u: "https://example.com/", w: 390, e: [{ t: "pageview" }] });
    await collect("Googlebot/2.1 (+http://www.google.com/bot.html)", {
      u: "https://example.com/",
      e: [{ t: "pageview" }],
    });
    const foreign = await collect(firefox, {
      u: "https://evil.example.net/",
      e: [{ t: "pageview" }],
    });
    expect(foreign.body).toEqual({ heatmaps: false });

    const report = await request(server)
      .get(`/api/teams/${teamId}/traffic/sites/${siteId}/report`)
      .set("authorization", authorization)
      .expect(200);
    const data = report.body as TrafficReport;
    expect(data.totals).toMatchObject({ visitors: 2, pageviews: 2 });
    expect(data.pages.map((page) => page.path).toSorted()).toEqual(["/", "/pricing"]);
    expect(data.referrers.map((row) => row.value).toSorted()).toEqual(["Direct", "newsletter"]);
    expect(data.campaigns[0]).toMatchObject({ value: "spring", visitors: 1 });
    expect(data.countries[0]).toMatchObject({ value: "DE", visitors: 2 });
    expect(data.languages[0]).toMatchObject({ value: "de" });
    expect(data.devices.map((row) => row.value).toSorted()).toEqual(["desktop", "mobile"]);
    expect(data.browsers.map((row) => row.value).toSorted()).toEqual(["Firefox", "Safari"]);
    expect(data.events).toEqual([expect.objectContaining({ name: "Signup", count: 1 })]);
    expect(data.vitals).toEqual([
      expect.objectContaining({ name: "LCP", p75: 1800, rating: "good" }),
    ]);
    expect(data.errors[0]).toMatchObject({
      message: "TypeError: price is undefined",
      source: "https://www.example.com/app.js",
      path: "/pricing",
    });

    const database = app.get(DatabaseService);
    const stored = await database.all<{ path: string; visitor_hash: string }>(
      "SELECT path, visitor_hash::text FROM traffic_events WHERE site_id = ?",
      siteId
    );
    expect(stored.every((row) => !row.path.includes("?"))).toBe(true);
    expect(JSON.stringify(stored)).not.toContain("127.0.0.1");

    const live = await request(server)
      .get(`/api/teams/${teamId}/traffic/sites/${siteId}/live`)
      .set("authorization", authorization)
      .expect(200);
    expect(live.body.visitors).toBe(2);

    const heatmap = await request(server)
      .get(`/api/teams/${teamId}/traffic/sites/${siteId}/heatmap`)
      .query({ path: "/pricing", device: "desktop" })
      .set("authorization", authorization)
      .expect(200);
    const heatmapData = heatmap.body as TrafficHeatmap;
    expect(heatmapData).toMatchObject({ clicks: 2, rageClicks: 1, pageviews: 1 });
    expect(heatmapData.elements[0]).toMatchObject({
      selector: "main>button.buy",
      label: "Buy now",
    });
    expect(heatmapData.scroll.find((row) => row.depth === 75)?.pageviews).toBe(1);

    const link = await request(server)
      .post(`/api/teams/${teamId}/traffic/sites/${siteId}/heatmap-link`)
      .set("authorization", authorization)
      .send({ path: "/pricing", device: "desktop" })
      .expect(200);
    const linkUrl = new URL(link.body.url);
    expect(`${linkUrl.origin}${linkUrl.pathname}`).toBe("https://example.com/pricing");
    const token = decodeURIComponent(linkUrl.hash.replace("#mimorii-heatmap=", ""));
    const overlay = await request(server)
      .get("/api/traffic/heatmap")
      .query({ token, path: "/pricing", device: "desktop" })
      .expect(200);
    expect(overlay.body.points).toEqual(
      expect.arrayContaining([expect.objectContaining({ selector: "main>button.buy" })])
    );
    await request(server)
      .get("/api/traffic/heatmap")
      .query({ token: `${token}x`, path: "/pricing", device: "desktop" })
      .expect(401);

    await request(server)
      .patch(`/api/teams/${teamId}/traffic/sites/${siteId}`)
      .set("authorization", authorization)
      .send({ heatmapsEnabled: false })
      .expect(200);
    const remainingClicks = await database.get<{ count: string }>(
      "SELECT COUNT(*) AS count FROM traffic_clicks WHERE site_id = ?",
      siteId
    );
    expect(Number(remainingClicks?.count)).toBe(0);

    const sites = await request(server)
      .get(`/api/teams/${teamId}/traffic/sites`)
      .set("authorization", authorization)
      .expect(200);
    expect(sites.body[0]).toMatchObject({ id: siteId, visitorsToday: 2, liveVisitors: 2 });
  }, 120_000);
});
