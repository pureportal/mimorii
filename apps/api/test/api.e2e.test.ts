import type { INestApplication } from "@nestjs/common";
import { termsVersion } from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/common/crypto.js";
import { DatabaseService } from "../src/database/database.service.js";
import { seedGlobalAdministrator } from "../src/database/seed/global-admin.js";
import { HeartbeatsService } from "../src/heartbeats/heartbeats.service.js";
import { NotificationsService } from "../src/notifications/notifications.service.js";

interface Registration {
  accessToken: string;
  user: { id: string; email: string; name: string };
  teams: Array<{ id: string; name: string; role: string }>;
}

const seededUser = {
  email: "t4ggno@example.com",
  password: "password",
} as const;

const databaseConfigured = [
  "MIMORII_DB_HOST",
  "MIMORII_DB_PORT",
  "MIMORII_DB_NAME",
  "MIMORII_DB_USER",
  "MIMORII_DB_PASSWORD",
].every((name) => Boolean(process.env[name]));

describe.skipIf(!databaseConfigured)("Mimorii API", () => {
  let app: INestApplication;
  let fixtureServer: Server | undefined;
  let fixtureUrl: string;
  const webhookRequests: Array<{
    event: string | undefined;
    signature: string | undefined;
    body: string;
  }> = [];

  beforeAll(async () => {
    process.env.MIMORII_JWT_SECRET = "test-only-secret-with-at-least-thirty-two-characters";
    process.env.MIMORII_SCHEDULER_ENABLED = "false";
    process.env.MIMORII_ALLOW_PRIVATE_DIRECT_TARGETS = "true";
    process.env.MIMORII_RATE_LIMIT = "10000";
    const { createApplication } = await import("../src/bootstrap.js");
    app = await createApplication();
    await app.init();

    fixtureServer = createServer((incoming, response) => {
      if (incoming.method === "POST" && incoming.url === "/webhook") {
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
        incoming.on("end", () => {
          webhookRequests.push({
            event:
              typeof incoming.headers["x-mimorii-event"] === "string"
                ? incoming.headers["x-mimorii-event"]
                : undefined,
            signature:
              typeof incoming.headers["x-mimorii-signature"] === "string"
                ? incoming.headers["x-mimorii-signature"]
                : undefined,
            body: Buffer.concat(chunks).toString("utf8"),
          });
          response.writeHead(204);
          response.end();
        });
        return;
      }
      if (incoming.url === "/json-health") {
        response.writeHead(200, {
          "content-type": "application/json",
          "x-fixture-state": "ready",
        });
        response.end(JSON.stringify({ service: { state: "ready" } }));
        return;
      }
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("mimorii fixture healthy");
    });
    await new Promise<void>((resolve) => fixtureServer!.listen(0, "127.0.0.1", resolve));
    fixtureUrl = `http://127.0.0.1:${(fixtureServer!.address() as AddressInfo).port}/health`;
  }, 60_000);

  afterAll(async () => {
    if (fixtureServer) {
      await new Promise<void>((resolve, reject) =>
        fixtureServer!.close((error) => (error ? reject(error) : resolve()))
      );
    }
    if (app) await app.close();
  }, 60_000);

  async function register(email: string, name = "Aiko Tanaka") {
    const response = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ name, email, password: "SecurePassword123", acceptedTerms: true });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body as Registration;
  }

  it("publishes health and OpenAPI documents", async () => {
    const health = await request(app.getHttpServer()).get("/api/health").expect(200);
    expect(health.body).toMatchObject({ status: "ok", database: true, scheduler: false });

    const openapi = await request(app.getHttpServer()).get("/docs-json").expect(200);
    expect(openapi.body.info.title).toBe("Mimorii API");
    expect(openapi.body.paths["/api/auth/register"]).toBeDefined();
    expect(openapi.body.paths["/api/auth/api-tokens"]).toBeDefined();
    expect(openapi.body.paths["/api/agent/heartbeat"]).toBeDefined();
    expect(openapi.body.paths["/api/heartbeats/{token}"]).toBeDefined();
    expect(openapi.body.paths["/api/sponsors"]).toBeDefined();
    expect(openapi.body.paths["/api/sponsors/applications"]).toBeDefined();
    expect(openapi.body.paths["/api/admin/statistics"]).toBeDefined();
    expect(openapi.body.paths["/api/teams/{teamId}/dashboards"]).toBeDefined();
    expect(openapi.body.paths["/api/dashboards/{slug}"]).toBeDefined();
    expect(openapi.body.paths["/api/teams/{teamId}/notifications/policies"]).toBeDefined();
  });

  it("lists published sponsors and accepts validated sponsorship applications", async () => {
    const database = app.get(DatabaseService);
    const timestamp = new Date().toISOString();
    await database.run(
      `INSERT INTO sponsors
       (id, name, tier, website_url, display_order, published_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      "published-sponsor",
      "Example Sponsor",
      "platinum",
      "https://sponsor.example/",
      0,
      timestamp,
      timestamp
    );
    await database.run(
      `INSERT INTO sponsors
       (id, name, tier, display_order, published_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      "published-sponsor-two",
      "Platinum Partner",
      "platinum",
      1,
      timestamp,
      timestamp
    );
    await database.run(
      `INSERT INTO sponsors
       (id, name, tier, display_order, published_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      "unpublished-sponsor",
      "Unpublished Sponsor",
      "gold",
      0,
      null,
      timestamp
    );

    const sponsors = await request(app.getHttpServer()).get("/api/sponsors").expect(200);
    expect(sponsors.body).toEqual([
      {
        tier: "platinum",
        sponsors: [
          {
            id: "published-sponsor",
            name: "Example Sponsor",
            websiteUrl: "https://sponsor.example/",
            faviconUpdatedAt: null,
          },
          {
            id: "published-sponsor-two",
            name: "Platinum Partner",
            websiteUrl: null,
            faviconUpdatedAt: null,
          },
        ],
      },
      { tier: "gold", sponsors: [] },
      { tier: "silver", sponsors: [] },
    ]);

    await request(app.getHttpServer())
      .post("/api/sponsors/applications")
      .send({
        organizationName: "Example Organization",
        contactName: "Sponsor Contact",
        email: "not-an-email",
        tier: "diamond",
      })
      .expect(400);

    const application = await request(app.getHttpServer())
      .post("/api/sponsors/applications")
      .send({
        organizationName: "  Example Organization  ",
        contactName: "  Sponsor Contact  ",
        email: "SPONSOR@EXAMPLE.COM",
        websiteUrl: "https://example.com/sponsor",
        tier: "gold",
        message: "  We would like to sponsor Mimorii.  ",
      })
      .expect(201);
    expect(application.body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(new Date(application.body.submittedAt).toString()).not.toBe("Invalid Date");

    const stored = await database.get<{
      organization_name: string;
      contact_name: string;
      email: string;
      website_url: string;
      tier: string;
      message: string;
    }>("SELECT * FROM sponsorship_applications WHERE id = ?", application.body.id);
    expect(stored).toMatchObject({
      organization_name: "Example Organization",
      contact_name: "Sponsor Contact",
      email: "sponsor@example.com",
      website_url: "https://example.com/sponsor",
      tier: "gold",
      message: "We would like to sponsor Mimorii.",
    });
  });

  it("registers, signs in, updates a user, and accepts a team invitation", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({
        name: "Terms Required",
        email: "terms-required@example.com",
        password: "SecurePassword123",
      })
      .expect(400);

    const owner = await register(seededUser.email, "Owner");
    const termsAcceptance = await app.get(DatabaseService).get<{
      terms_version: string;
      terms_accepted_at: string;
    }>("SELECT terms_version, terms_accepted_at FROM users WHERE id = ?", owner.user.id);
    expect(termsAcceptance?.terms_version).toBe(termsVersion);
    expect(termsAcceptance?.terms_accepted_at).toBeTypeOf("string");
    await app
      .get(DatabaseService)
      .run(
        "UPDATE users SET password_hash = ? WHERE email = ?",
        await hashPassword(seededUser.password),
        seededUser.email
      );
    const ownerTeamId = owner.teams[0]!.id;
    const login = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: seededUser.email, password: seededUser.password })
      .expect(200);
    expect(login.body.accessToken).toBeTypeOf("string");

    await request(app.getHttpServer())
      .patch("/api/auth/profile")
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Mimorii Owner" })
      .expect(200)
      .expect(({ body }) => expect(body.name).toBe("Mimorii Owner"));

    const invitation = await request(app.getHttpServer())
      .post(`/api/teams/${ownerTeamId}/invitations`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ email: "member@example.com", role: "member" })
      .expect(201);
    expect(invitation.body.token).toMatch(/^mim_invite_/);

    const member = await register("member@example.com", "Member");
    await request(app.getHttpServer())
      .post(`/api/team-invitations/${invitation.body.token}/accept`)
      .set("authorization", `Bearer ${member.accessToken}`)
      .expect(201);

    expect(
      await app
        .get(DatabaseService)
        .get("SELECT id FROM team_invites WHERE id = ?", invitation.body.id)
    ).toBeUndefined();

    const members = await request(app.getHttpServer())
      .get(`/api/teams/${ownerTeamId}/members`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .expect(200);
    expect(members.body).toHaveLength(2);
    expect(members.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: "member@example.com", role: "member" }),
      ])
    );
  });

  it("persists tour acknowledgements independently in the user profile", async () => {
    const suffix = randomUUID().slice(0, 8);
    const email = `tour-profile-${suffix}@example.com`;
    const account = await register(email, "Tour Profile");
    const authorization = `Bearer ${account.accessToken}`;

    expect(account.user).toMatchObject({ acknowledgedTourIds: [] });

    const overview = await request(app.getHttpServer())
      .put("/api/auth/profile/tour-acknowledgements/overview")
      .set("authorization", authorization)
      .expect(200);
    expect(overview.body.acknowledgedTourIds).toEqual(["overview"]);

    await request(app.getHttpServer())
      .put("/api/auth/profile/tour-acknowledgements/overview")
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) => expect(body.acknowledgedTourIds).toEqual(["overview"]));

    await request(app.getHttpServer())
      .put("/api/auth/profile/tour-acknowledgements/checks")
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) => expect(body.acknowledgedTourIds).toEqual(["overview", "checks"]));

    await request(app.getHttpServer())
      .put("/api/auth/profile/tour-acknowledgements/Invalid tour")
      .set("authorization", authorization)
      .expect(400);

    await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) => expect(body.user.acknowledgedTourIds).toEqual(["overview", "checks"]));

    const signedInAgain = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email, password: "SecurePassword123" })
      .expect(200);
    expect(signedInAgain.body.user.acknowledgedTourIds).toEqual(["overview", "checks"]);

    const stored = await app.get(DatabaseService).get<{ acknowledged_tour_ids: string }>(
      `SELECT acknowledged_tour_ids::TEXT AS acknowledged_tour_ids
       FROM users WHERE id = ?`,
      account.user.id
    );
    if (!stored) throw new Error("Tour profile was not persisted");
    const storedTourIds: unknown = JSON.parse(stored.acknowledged_tour_ids);
    expect(storedTourIds).toEqual(["overview", "checks"]);
  });

  it("runs direct checks and persists availability history", async () => {
    const account = await register("direct@example.com", "Direct Monitor");
    const teamId = account.teams[0]!.id;
    const authorization = `Bearer ${account.accessToken}`;
    const resource = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/resources`)
      .set("authorization", authorization)
      .send({ name: "Fixture", kind: "endpoint", target: fixtureUrl, tags: ["test"] })
      .expect(201);
    const check = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/checks`)
      .set("authorization", authorization)
      .send({
        resourceId: resource.body.id,
        name: "Fixture HTTP",
        type: "http",
        config: {
          url: fixtureUrl,
          method: "GET",
          expectedStatuses: [200],
          responseContains: "healthy",
          followRedirects: true,
          validateTls: true,
        },
        intervalSeconds: 60,
        timeoutMs: 3_000,
      })
      .expect(201);

    const run = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/checks/${check.body.id}/run`)
      .set("authorization", authorization)
      .expect(200);
    expect(run.body).toMatchObject({ queued: false, result: { status: "up", statusCode: 200 } });

    const history = await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/checks/${check.body.id}/history`)
      .set("authorization", authorization)
      .expect(200);
    expect(history.body).toEqual([expect.objectContaining({ status: "up", statusCode: 200 })]);

    const overview = await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/analytics/overview`)
      .set("authorization", authorization)
      .expect(200);
    expect(overview.body).toMatchObject({ resources: 1, checks: 1, up: 1, uptime24h: 100 });

    process.env.MIMORII_ALLOW_PRIVATE_DIRECT_TARGETS = "false";
    const unsafeResource = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/resources`)
      .set("authorization", authorization)
      .send({ name: "Private direct", kind: "service", target: "127.0.0.1" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/checks`)
      .set("authorization", authorization)
      .send({
        resourceId: unsafeResource.body.id,
        name: "Unsafe port",
        type: "tcp",
        config: { host: "127.0.0.1", port: 22 },
      })
      .expect(400);
    process.env.MIMORII_ALLOW_PRIVATE_DIRECT_TARGETS = "true";
  });

  it("evaluates HTTP headers and JSON assertions", async () => {
    const account = await register("assertions@example.com", "Assertions");
    const teamId = account.teams[0]!.id;
    const authorization = `Bearer ${account.accessToken}`;
    const url = new URL("/json-health", fixtureUrl).toString();
    const resource = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/resources`)
      .set("authorization", authorization)
      .send({ name: "JSON fixture", kind: "endpoint", target: url })
      .expect(201);
    const check = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/checks`)
      .set("authorization", authorization)
      .send({
        resourceId: resource.body.id,
        name: "JSON health",
        type: "http",
        config: {
          url,
          expectedStatuses: [200],
          expectedHeaders: {
            "content-type": "application/json",
            "x-fixture-state": "ready",
          },
          jsonPointer: "/service/state",
          expectedJsonValue: "ready",
          latencyWarningMs: 30_000,
        },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/checks/${check.body.id}/run`)
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) => expect(body.result.status).toBe("up"));
  });

  it("queues relay checks, ingests agent metrics, and tracks incidents", async () => {
    const account = await register("agent@example.com", "Agent Monitor");
    const teamId = account.teams[0]!.id;
    const authorization = `Bearer ${account.accessToken}`;
    const createdAgent = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/agents`)
      .set("authorization", authorization)
      .send({ name: "Private network", kind: "desktop", collectionIntervalSeconds: 45 })
      .expect(201);
    expect(createdAgent.body.kind).toBe("desktop");
    expect(createdAgent.body.collectionIntervalSeconds).toBe(45);
    await request(app.getHttpServer())
      .patch(`/api/teams/${teamId}/agents/${createdAgent.body.id}`)
      .set("authorization", authorization)
      .send({ collectionIntervalSeconds: 60 })
      .expect(200)
      .expect(({ body }) => expect(body.collectionIntervalSeconds).toBe(60));
    const agentAuthorization = `Bearer ${createdAgent.body.enrollmentKey}`;
    const resource = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/resources`)
      .set("authorization", authorization)
      .send({
        name: "Internal database",
        kind: "server",
        target: "database.internal",
        agentId: createdAgent.body.id,
      })
      .expect(201);
    const check = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/checks`)
      .set("authorization", authorization)
      .send({
        resourceId: resource.body.id,
        name: "PostgreSQL",
        type: "tcp",
        config: { host: "database.internal", port: 5432 },
        failureThreshold: 2,
      })
      .expect(201);

    const submitResult = async (status: "up" | "down") => {
      await request(app.getHttpServer())
        .post(`/api/teams/${teamId}/checks/${check.body.id}/run`)
        .set("authorization", authorization)
        .expect(200);
      const taskResponse = await request(app.getHttpServer())
        .get("/api/agent/tasks")
        .set("authorization", agentAuthorization)
        .expect(200);
      expect(taskResponse.body.collectionIntervalSeconds).toBe(60);
      expect(taskResponse.body.tasks).toHaveLength(1);
      const timestamp = new Date().toISOString();
      const previousTimestamp = new Date(Date.now() - 15_000).toISOString();
      const snapshot = {
        hostname: "db-01",
        platform: "linux",
        version: "0.1.0",
        uptimeSeconds: 7200,
        cpuPercent: 24.5,
        loadAverage: 0.7,
        memoryUsedBytes: 4_000_000,
        memoryTotalBytes: 8_000_000,
        swapUsedBytes: 500_000,
        swapTotalBytes: 2_000_000,
        processCount: 42,
        networkReceivedBytes: 10_000_000,
        networkTransmittedBytes: 5_000_000,
        disks: [{ mount: "/", usedBytes: 20_000_000, totalBytes: 100_000_000 }],
        technologies: [{ name: "postgres", category: "database", version: "16" }],
      };
      await request(app.getHttpServer())
        .post("/api/agent/heartbeat")
        .set("authorization", agentAuthorization)
        .send({
          snapshots: [
            { ...snapshot, cpuPercent: 20, observedAt: previousTimestamp },
            { ...snapshot, observedAt: timestamp },
          ],
          results: [
            {
              taskId: taskResponse.body.tasks[0].id,
              status,
              latencyMs: status === "up" ? 12 : null,
              statusCode: null,
              message: status === "down" ? "Connection failed" : null,
              metrics: { port: 5432 },
              checkedAt: timestamp,
            },
          ],
          capabilities: ["http", "tcp", "dns", "host", "disk"],
        })
        .expect(200)
        .expect(({ body }) => {
          expect(body.acceptedSnapshots).toBe(2);
          expect(body.acceptedResults).toBe(1);
        });
    };

    await submitResult("up");
    await submitResult("down");
    await submitResult("down");

    const downOverview = await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/analytics/overview`)
      .set("authorization", authorization)
      .expect(200);
    expect(downOverview.body).toMatchObject({ down: 1, openIncidents: 1 });

    await submitResult("up");
    const recoveredOverview = await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/analytics/overview`)
      .set("authorization", authorization)
      .expect(200);
    expect(recoveredOverview.body).toMatchObject({ up: 1, openIncidents: 0 });
    expect(recoveredOverview.body.incidents[0]).toMatchObject({ status: "resolved" });

    const snapshots = await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/agents/${createdAgent.body.id}/snapshots`)
      .set("authorization", authorization)
      .expect(200);
    expect(snapshots.body).toHaveLength(8);
    expect(snapshots.body[0]).toMatchObject({ hostname: "db-01", cpuPercent: 24.5 });
    expect(
      snapshots.body.some((snapshot: { cpuPercent: number }) => snapshot.cpuPercent === 20)
    ).toBe(true);
  });

  it("ingests typed mobile status without assigning active checks", async () => {
    const account = await register("mobile-agent@example.com", "Mobile Agent");
    const teamId = account.teams[0]!.id;
    const authorization = `Bearer ${account.accessToken}`;
    const createdAgent = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/agents`)
      .set("authorization", authorization)
      .send({ name: "Field phone", kind: "mobile", collectionIntervalSeconds: 900 })
      .expect(201);
    expect(createdAgent.body).toMatchObject({
      kind: "mobile",
      capabilities: ["device-status"],
      collectionIntervalSeconds: 900,
    });

    const agentAuthorization = `Bearer ${createdAgent.body.enrollmentKey}`;
    const observedAt = new Date().toISOString();
    const status = {
      collectorId: createdAgent.body.id,
      submissionId: randomUUID(),
      schemaVersion: 1,
      observedAt,
      device: {
        manufacturer: "Google",
        model: "Pixel",
        androidRelease: "16",
        apiLevel: 36,
        securityPatch: "2026-08-05",
      },
      collector: { appVersion: "0.1.0", buildNumber: 1 },
      uptimeSeconds: 7_200,
      battery: {
        percent: 72,
        charging: false,
        powerSource: "none",
        health: "good",
        temperatureCelsius: 31.2,
      },
      memory: { totalBytes: 8_000_000_000, availableBytes: 3_000_000_000, lowMemory: false },
      storage: { totalBytes: 128_000_000_000, availableBytes: 64_000_000_000 },
      connectivity: {
        connected: true,
        internetValidated: true,
        metered: false,
        roaming: false,
        vpn: false,
        transport: "wifi",
      },
      power: { batterySaver: false, deviceIdle: false, backgroundRestricted: false },
      thermalStatus: "none",
    };

    const accepted = await request(app.getHttpServer())
      .post("/api/agent/device-status")
      .set("authorization", agentAuthorization)
      .send(status)
      .expect(200)
      .expect(({ body }) => expect(body.collectionIntervalSeconds).toBe(900));

    await request(app.getHttpServer())
      .post("/api/agent/device-status")
      .set("authorization", agentAuthorization)
      .send({ ...status, collectorId: randomUUID(), submissionId: randomUUID() })
      .expect(403);

    await request(app.getHttpServer())
      .post("/api/agent/device-status")
      .set("authorization", agentAuthorization)
      .send(status)
      .expect(200)
      .expect(({ body }) => expect(body.acceptedAt).toBe(accepted.body.acceptedAt));

    const storedSubmission = await app
      .get(DatabaseService)
      .get<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM mobile_device_statuses WHERE id = ?",
        status.submissionId
      );
    expect(storedSubmission?.count).toBe(1);

    const clockCorrectedStatus = {
      ...status,
      submissionId: randomUUID(),
      observedAt: new Date(Date.now() - 60_000).toISOString(),
      battery: { ...status.battery, percent: 68 },
    };
    await request(app.getHttpServer())
      .post("/api/agent/device-status")
      .set("authorization", agentAuthorization)
      .send(clockCorrectedStatus)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/agents/${createdAgent.body.id}/device-status`)
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          observedAt: clockCorrectedStatus.observedAt,
          device: { model: "Pixel" },
          battery: { percent: 68 },
        })
      );

    await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/agents`)
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) =>
        expect(body[0]).toMatchObject({
          kind: "mobile",
          status: "online",
          platform: "Android 16",
          deviceStatus: { battery: { percent: 68 } },
        })
      );

    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/resources`)
      .set("authorization", authorization)
      .send({
        name: "Mobile-routed resource",
        kind: "server",
        target: "device.internal",
        agentId: createdAgent.body.id,
      })
      .expect(400);

    await request(app.getHttpServer())
      .get("/api/agent/tasks")
      .set("authorization", agentAuthorization)
      .expect(403);
  });

  it("manages incidents, maintenance, status pages, objectives, and analytics", async () => {
    const account = await register("operations@example.com", "Operations");
    const teamId = account.teams[0]!.id;
    const authorization = `Bearer ${account.accessToken}`;
    const resource = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/resources`)
      .set("authorization", authorization)
      .send({ name: "Public API", kind: "endpoint", target: fixtureUrl })
      .expect(201);
    const check = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/checks`)
      .set("authorization", authorization)
      .send({
        resourceId: resource.body.id,
        name: "API health",
        type: "http",
        config: {
          url: fixtureUrl,
          method: "GET",
          expectedStatuses: [200],
          followRedirects: true,
          validateTls: true,
        },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/checks/${check.body.id}/run`)
      .set("authorization", authorization)
      .expect(200);

    const incident = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/incidents`)
      .set("authorization", authorization)
      .send({
        title: "Elevated API errors",
        impact: "minor",
        resourceIds: [resource.body.id],
        message: "The team is investigating.",
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/incidents/${incident.body.id}/updates`)
      .set("authorization", authorization)
      .send({ status: "resolved", message: "Error rates returned to normal." })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe("resolved"));

    const startsAt = new Date(Date.now() - 60_000).toISOString();
    const endsAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const maintenance = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/maintenance`)
      .set("authorization", authorization)
      .send({
        name: "Database upgrade",
        startsAt,
        endsAt,
        recurrence: "none",
        resourceIds: [resource.body.id],
        suppressNotifications: true,
      })
      .expect(201);
    expect(maintenance.body.status).toBe("active");

    const statusPage = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/status-pages`)
      .set("authorization", authorization)
      .send({
        name: "Mimorii status",
        slug: `mimorii-${Date.now()}`,
        resourceIds: [resource.body.id],
        published: true,
        showUptime: true,
      })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/api/public/status-pages/${statusPage.body.slug}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.state).toBe("maintenance");
        expect(body.components[0]).toMatchObject({ name: "Public API", status: "maintenance" });
      });

    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/objectives`)
      .set("authorization", authorization)
      .send({
        name: "API availability",
        resourceId: resource.body.id,
        targetPercent: 99.9,
        windowDays: 30,
        latencyTargetMs: 1_000,
      })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe("met"));

    await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/analytics/report`)
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({ totalResults: 1, availabilityPercent: 100 })
      );

    await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/resources/${resource.body.id}/technologies`)
      .set("authorization", authorization)
      .expect(200);
  });

  it("creates configurable dashboards and enforces every access mode", async () => {
    const testId = `${Date.now()}-${randomUUID()}`;
    const owner = await register(`dashboards-${testId}@example.com`, "Dashboard owner");
    const outsider = await register(`dash-out-${testId}@example.com`, "Dashboard outsider");
    const teamId = owner.teams[0]!.id;
    const authorization = `Bearer ${owner.accessToken}`;
    const outsiderAuthorization = `Bearer ${outsider.accessToken}`;
    const resource = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/resources`)
      .set("authorization", authorization)
      .send({ name: "Dashboard API", kind: "endpoint", target: fixtureUrl })
      .expect(201);
    const check = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/checks`)
      .set("authorization", authorization)
      .send({
        resourceId: resource.body.id,
        name: "Dashboard health",
        type: "http",
        config: {
          url: fixtureUrl,
          method: "GET",
          expectedStatuses: [200],
          followRedirects: true,
          validateTls: true,
        },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/checks/${check.body.id}/run`)
      .set("authorization", authorization)
      .expect(200);

    const createItems = () => [
      {
        id: randomUUID(),
        type: "metric",
        title: "Availability",
        width: 1,
        metric: "uptime",
        resourceId: resource.body.id,
        windowDays: 1,
      },
      {
        id: randomUUID(),
        type: "uptime",
        title: "Uptime history",
        width: 2,
        resourceId: resource.body.id,
        windowDays: 7,
      },
      {
        id: randomUUID(),
        type: "status",
        title: "Current state",
        width: 1,
        resourceId: resource.body.id,
      },
      {
        id: randomUUID(),
        type: "incidents",
        title: "Recent incidents",
        width: 3,
        resourceId: null,
        limit: 3,
      },
    ];
    const publicSlug = `dashboard-public-${Date.now()}`;
    const publicItems = createItems();
    const publicDashboard = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/dashboards`)
      .set("authorization", authorization)
      .send({
        name: "Public dashboard",
        slug: publicSlug,
        accessMode: "public",
        items: publicItems,
      })
      .expect(201);
    expect(publicDashboard.body).toMatchObject({
      accessKey: null,
      dashboard: { accessMode: "public", itemCount: 4, hasAccessKey: false },
    });
    await request(app.getHttpServer())
      .get(`/api/dashboards/${publicSlug}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.items.map((item: { id: string }) => item.id)).toEqual([
          "item-1",
          "item-2",
          "item-3",
          "item-4",
        ]);
        expect(body.items.map((item: { width: number }) => item.width)).toEqual([1, 2, 1, 3]);
        expect(body.items[0]).toMatchObject({
          type: "metric",
          value: 100,
          resourceName: "Dashboard API",
        });
        expect(body.items[0]).not.toHaveProperty("resourceId");
        expect(body.items[0].id).not.toBe(publicItems[0]!.id);
        expect(body.items[1].dailyUptime).toHaveLength(7);
        expect(body.items[2]).toMatchObject({ type: "status", status: "up" });
      });

    const privateSlug = `dashboard-private-${Date.now()}`;
    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/dashboards`)
      .set("authorization", authorization)
      .send({
        name: "Private dashboard",
        slug: privateSlug,
        accessMode: "private",
        items: createItems(),
      })
      .expect(201);
    await request(app.getHttpServer()).get(`/api/dashboards/${privateSlug}`).expect(401);
    await request(app.getHttpServer())
      .get(`/api/dashboards/${privateSlug}`)
      .set("authorization", authorization)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/dashboards/${privateSlug}`)
      .set("authorization", outsiderAuthorization)
      .expect(404);

    const protectedSlug = `dashboard-protected-${Date.now()}`;
    const protectedItems = createItems();
    const protectedDashboard = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/dashboards`)
      .set("authorization", authorization)
      .send({
        name: "Protected dashboard",
        slug: protectedSlug,
        accessMode: "protected",
        items: protectedItems,
      })
      .expect(201);
    const protectedId = protectedDashboard.body.dashboard.id as string;
    const originalKey = protectedDashboard.body.accessKey as string;
    expect(originalKey).toMatch(/^mim_dash_[A-Za-z0-9_-]{43}$/);
    expect(protectedDashboard.body.dashboard.hasAccessKey).toBe(true);
    const database = app.get(DatabaseService);
    const stored = await database.get<{ access_key_hash: string }>(
      "SELECT access_key_hash FROM dashboards WHERE id = ?",
      protectedId
    );
    expect(stored?.access_key_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored?.access_key_hash).not.toBe(originalKey);

    const missingKey = await request(app.getHttpServer())
      .get(`/api/dashboards/${protectedSlug}`)
      .expect(404);
    const invalidKey = await request(app.getHttpServer())
      .get(`/api/dashboards/${protectedSlug}`)
      .set("x-dashboard-key", "mim_dash_invalid")
      .expect(404);
    expect(invalidKey.body).toEqual(missingKey.body);
    await request(app.getHttpServer())
      .get(`/api/dashboards/${protectedSlug}`)
      .set("x-dashboard-key", originalKey)
      .expect(200);

    const reordered = [
      { ...protectedItems[1]!, width: 3 },
      protectedItems[0]!,
      protectedItems[3]!,
      protectedItems[2]!,
    ];
    await request(app.getHttpServer())
      .patch(`/api/teams/${teamId}/dashboards/${protectedId}`)
      .set("authorization", authorization)
      .send({ items: reordered })
      .expect(200)
      .expect(({ body }) => {
        expect(body.dashboard.items.map((item: { id: string }) => item.id)).toEqual(
          reordered.map((item) => item.id)
        );
        expect(body.dashboard.items[0].width).toBe(3);
      });
    await request(app.getHttpServer())
      .get(`/api/dashboards/${protectedSlug}`)
      .set("x-dashboard-key", originalKey)
      .expect(200)
      .expect(({ body }) => {
        expect(body.items.map((item: { title: string }) => item.title)).toEqual(
          reordered.map((item) => item.title)
        );
      });

    await request(app.getHttpServer())
      .patch(`/api/teams/${teamId}/dashboards/${protectedId}`)
      .set("authorization", outsiderAuthorization)
      .send({ name: "Unauthorized change" })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/dashboards/${protectedId}/access-key`)
      .set("authorization", outsiderAuthorization)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/dashboards`)
      .send({ name: "Bypass", slug: `bypass-${Date.now()}`, accessMode: "public", items: [] })
      .expect(401);

    const rotated = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/dashboards/${protectedId}/access-key`)
      .set("authorization", authorization)
      .expect(201);
    const rotatedKey = rotated.body.accessKey as string;
    expect(rotatedKey).not.toBe(originalKey);
    await request(app.getHttpServer())
      .get(`/api/dashboards/${protectedSlug}`)
      .set("x-dashboard-key", originalKey)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/dashboards/${protectedSlug}`)
      .set("x-dashboard-key", rotatedKey)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/teams/${teamId}/dashboards/${protectedId}/access-key`)
      .set("authorization", authorization)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/dashboards/${protectedSlug}`)
      .set("x-dashboard-key", rotatedKey)
      .expect(404);

    const dashboards = await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/dashboards`)
      .set("authorization", authorization)
      .expect(200);
    expect(dashboards.body).toHaveLength(3);
    expect(dashboards.body[0]).not.toHaveProperty("accessKey");

    await request(app.getHttpServer())
      .delete(`/api/teams/${teamId}/dashboards/${publicDashboard.body.dashboard.id}`)
      .set("authorization", authorization)
      .expect(204);
    await request(app.getHttpServer()).get(`/api/dashboards/${publicSlug}`).expect(404);
  });

  it("delivers signed webhook notifications and records delivery state", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "operations@example.com", password: "SecurePassword123" })
      .expect(200);
    const account = login.body as Registration;
    const teamId = account.teams[0]!.id;
    const authorization = `Bearer ${account.accessToken}`;
    const webhookUrl = new URL("/webhook", fixtureUrl).toString();
    const channel = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/notifications/channels`)
      .set("authorization", authorization)
      .send({
        name: "Operations webhook",
        type: "webhook",
        webhookUrl,
        webhookSecret: "test-signing-secret",
        enabled: true,
      })
      .expect(201);
    expect(channel.body).toMatchObject({
      name: "Operations webhook",
      type: "webhook",
      target: webhookUrl,
    });

    const policy = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/notifications/policies`)
      .set("authorization", authorization)
      .send({
        name: "Major production incidents",
        events: ["incident.opened", "incident.updated"],
        condition: {
          kind: "group",
          operator: "and",
          conditions: [
            { kind: "condition", field: "impact", operator: "in", value: ["major", "critical"] },
            {
              kind: "condition",
              field: "resourceTags",
              operator: "contains",
              value: "production",
            },
          ],
        },
        channelIds: [channel.body.id],
        enabled: true,
      })
      .expect(201);
    expect(policy.body).toMatchObject({
      condition: {
        kind: "group",
        operator: "and",
        conditions: [
          { kind: "condition", field: "impact", operator: "in", value: ["major", "critical"] },
          {
            kind: "condition",
            field: "resourceTags",
            operator: "contains",
            value: "production",
          },
        ],
      },
      channelIds: [channel.body.id],
    });

    const delivery = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/notifications/channels/${channel.body.id}/test`)
      .set("authorization", authorization)
      .expect(200);
    expect(delivery.body).toMatchObject({ status: "delivered", attempts: 1 });
    expect(webhookRequests.at(-1)).toMatchObject({ event: "incident.updated" });
    expect(webhookRequests.at(-1)?.signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(JSON.parse(webhookRequests.at(-1)!.body)).toMatchObject({
      event: "incident.updated",
      data: { title: "Mimorii test notification" },
    });

    const resource = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/resources`)
      .set("authorization", authorization)
      .send({ name: "Production worker", kind: "service", target: "worker", tags: ["production"] })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/incidents`)
      .set("authorization", authorization)
      .send({
        title: "Minor worker delay",
        impact: "minor",
        resourceIds: [resource.body.id],
        message: "The worker is delayed.",
      })
      .expect(201);
    const beforeMajor = await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/notifications/deliveries`)
      .set("authorization", authorization)
      .expect(200);
    expect(beforeMajor.body).toHaveLength(1);

    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/incidents`)
      .set("authorization", authorization)
      .send({
        title: "Production worker stopped",
        impact: "major",
        resourceIds: [resource.body.id],
        message: "The worker stopped.",
      })
      .expect(201);
    const routed = await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/notifications/deliveries`)
      .set("authorization", authorization)
      .expect(200);
    expect(routed.body[0]).toMatchObject({ event: "incident.opened", status: "pending" });
    process.env.MIMORII_SCHEDULER_ENABLED = "true";
    try {
      await app.get(NotificationsService).dispatch();
    } finally {
      process.env.MIMORII_SCHEDULER_ENABLED = "false";
    }
    await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/notifications/deliveries`)
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) => expect(body[0]).toMatchObject({ status: "delivered" }));
    expect(webhookRequests.at(-1)).toMatchObject({ event: "incident.opened" });
    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/notifications/deliveries/${routed.body[0].id}/retry`)
      .set("authorization", authorization)
      .expect(400);
    await app
      .get(DatabaseService)
      .run("UPDATE notification_deliveries SET status = 'failed' WHERE id = ?", routed.body[0].id);
    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/notifications/deliveries/${routed.body[0].id}/retry`)
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe("delivered"));
    await request(app.getHttpServer())
      .patch(`/api/teams/${teamId}/notifications/policies/${policy.body.id}`)
      .set("authorization", authorization)
      .send({
        name: "Production incidents",
        condition: {
          kind: "group",
          operator: "and",
          conditions: [
            {
              kind: "condition",
              field: "resourceTags",
              operator: "contains",
              value: "production",
            },
          ],
        },
      })
      .expect(200)
      .expect(({ body }) => expect(body.name).toBe("Production incidents"));
    await request(app.getHttpServer())
      .delete(`/api/teams/${teamId}/notifications/policies/${policy.body.id}`)
      .set("authorization", authorization)
      .expect(204);
  });

  it("tracks heartbeat jobs, deadlines, incidents, recovery, and token rotation", async () => {
    const account = await register("heartbeats@example.com", "Heartbeat operator");
    const teamId = account.teams[0]!.id;
    const authorization = `Bearer ${account.accessToken}`;
    const resource = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/resources`)
      .set("authorization", authorization)
      .send({ name: "Nightly import", kind: "service", target: "nightly-import" })
      .expect(201);
    const created = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/heartbeats`)
      .set("authorization", authorization)
      .send({
        resourceId: resource.body.id,
        name: "Import schedule",
        intervalSeconds: 60,
        graceSeconds: 0,
        maxRuntimeSeconds: 60,
      })
      .expect(201);
    expect(created.body).toMatchObject({
      heartbeat: { status: "pending", resourceName: "Nightly import" },
    });
    expect(created.body.pingToken).toMatch(/^mim_hb_/);
    const token = created.body.pingToken as string;
    const statusPage = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/status-pages`)
      .set("authorization", authorization)
      .send({
        name: "Import status",
        slug: `import-${Date.now()}`,
        resourceIds: [resource.body.id],
        published: true,
        showUptime: true,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/heartbeats/${token}/start`)
      .send({ message: "Import started", metadata: { batch: 42 } })
      .expect(202)
      .expect(({ body }) => expect(body.status).toBe("up"));
    await request(app.getHttpServer())
      .post(`/api/heartbeats/${token}`)
      .send({ message: "Import complete", durationMs: 1_250, metadata: { records: 800 } })
      .expect(202);

    const database = app.get(DatabaseService);
    await database.run(
      "UPDATE heartbeat_monitors SET next_expected_at = ? WHERE id = ?",
      new Date(Date.now() - 1_000).toISOString(),
      created.body.heartbeat.id
    );
    process.env.MIMORII_SCHEDULER_ENABLED = "true";
    try {
      await app.get(HeartbeatsService).sweep();
    } finally {
      process.env.MIMORII_SCHEDULER_ENABLED = "false";
    }

    await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/heartbeats/${created.body.heartbeat.id}`)
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ status: "down" }));
    const activeIncidents = await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/incidents?status=active`)
      .set("authorization", authorization)
      .expect(200);
    expect(activeIncidents.body[0]).toMatchObject({
      heartbeatId: created.body.heartbeat.id,
      status: "investigating",
    });
    await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/resources/${resource.body.id}`)
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe("down"));
    await request(app.getHttpServer())
      .get(`/api/public/status-pages/${statusPage.body.slug}`)
      .expect(200)
      .expect(({ body }) => expect(body.state).toBe("outage"));

    await request(app.getHttpServer())
      .post(`/api/heartbeats/${token}`)
      .send({ message: "Import recovered" })
      .expect(202)
      .expect(({ body }) => expect(body.status).toBe("up"));
    const history = await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/heartbeats/${created.body.heartbeat.id}/history`)
      .set("authorization", authorization)
      .expect(200);
    expect(history.body.map((event: { type: string }) => event.type)).toEqual([
      "succeeded",
      "missed",
      "succeeded",
      "started",
    ]);
    await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/heartbeats/${created.body.heartbeat.id}`)
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ runs30d: 3, successfulRuns30d: 2 });
        expect(body.successRate30d).toBeCloseTo(66.67, 1);
        expect(body.averageDurationMs30d).toBe(1_250);
      });
    await request(app.getHttpServer())
      .get(`/api/public/status-pages/${statusPage.body.slug}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.state).toBe("operational");
        expect(body.components[0].uptime30d).toBeCloseTo(66.67, 1);
      });
    await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/analytics/report?resourceId=${resource.body.id}`)
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body.totalResults).toBe(3);
        expect(body.availabilityPercent).toBeCloseTo(66.67, 1);
      });
    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/objectives`)
      .set("authorization", authorization)
      .send({
        name: "Import reliability",
        resourceId: resource.body.id,
        targetPercent: 99,
        windowDays: 7,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe("breached");
        expect(body.availabilityPercent).toBeCloseTo(66.67, 1);
      });
    await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/analytics/overview`)
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({ heartbeats: 1, heartbeatsUp: 1, heartbeatsDown: 0 })
      );

    const rotated = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/heartbeats/${created.body.heartbeat.id}/rotate-token`)
      .set("authorization", authorization)
      .expect(200);
    await request(app.getHttpServer()).post(`/api/heartbeats/${token}`).send({}).expect(404);
    await request(app.getHttpServer())
      .post(`/api/heartbeats/${rotated.body.pingToken}`)
      .expect(202);
    await request(app.getHttpServer())
      .patch(`/api/teams/${teamId}/heartbeats/${created.body.heartbeat.id}`)
      .set("authorization", authorization)
      .send({ enabled: false })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe("paused"));
    await request(app.getHttpServer())
      .post(`/api/heartbeats/${rotated.body.pingToken}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/teams/${teamId}/heartbeats/${created.body.heartbeat.id}`)
      .set("authorization", authorization)
      .expect(204);
  });

  it("creates, authenticates, expires, and revokes personal API tokens", async () => {
    const account = await register("automation@example.com", "Automation owner");
    const authorization = `Bearer ${account.accessToken}`;
    const created = await request(app.getHttpServer())
      .post("/api/auth/api-tokens")
      .set("authorization", authorization)
      .send({ name: "Deployment automation", expiresInDays: 30 })
      .expect(201);
    expect(created.body).toMatchObject({
      apiToken: { name: "Deployment automation", expiresAt: expect.any(String) },
      token: expect.stringMatching(/^mim_pat_/),
    });
    const apiAuthorization = `Bearer ${created.body.token}`;
    await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("authorization", apiAuthorization)
      .expect(200)
      .expect(({ body }) => expect(body.user.email).toBe("automation@example.com"));
    await request(app.getHttpServer())
      .get("/api/auth/api-tokens")
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) =>
        expect(body[0]).toMatchObject({
          id: created.body.apiToken.id,
          lastUsedAt: expect.any(String),
        })
      );
    await request(app.getHttpServer())
      .delete(`/api/auth/api-tokens/${created.body.apiToken.id}`)
      .set("authorization", authorization)
      .expect(204);
    await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("authorization", apiAuthorization)
      .expect(401);
  });

  it("manages team invitations and team settings", async () => {
    const account = await register("team-settings@example.com", "Team owner");
    const teamId = account.teams[0]!.id;
    const authorization = `Bearer ${account.accessToken}`;
    const invitation = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/invitations`)
      .set("authorization", authorization)
      .send({ email: "pending@example.com", role: "viewer" })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/invitations`)
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toEqual([
          expect.objectContaining({ id: invitation.body.id, status: "pending" }),
        ])
      );

    await request(app.getHttpServer())
      .delete(`/api/teams/${teamId}/invitations/${invitation.body.id}`)
      .set("authorization", authorization)
      .expect(204);

    await request(app.getHttpServer())
      .patch(`/api/teams/${teamId}`)
      .set("authorization", authorization)
      .send({ name: "Platform operations" })
      .expect(200)
      .expect(({ body }) => expect(body.name).toBe("Platform operations"));

    await request(app.getHttpServer())
      .delete(`/api/teams/${teamId}`)
      .set("authorization", authorization)
      .send({ name: "Platform operations" })
      .expect(204);
    await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) => expect(body.teams).toEqual([]));
    await request(app.getHttpServer())
      .post("/api/teams")
      .set("authorization", authorization)
      .send({ name: "Recovered team" })
      .expect(201);
  });

  it("handles concurrent account and team-slug creation", async () => {
    const suffix = randomUUID().slice(0, 8);
    const registration = {
      name: "Concurrent account",
      email: `concurrent-${suffix}@example.com`,
      password: "SecurePassword123",
      acceptedTerms: true,
    };
    const duplicateResponses = await Promise.all([
      request(app.getHttpServer()).post("/api/auth/register").send(registration),
      request(app.getHttpServer()).post("/api/auth/register").send(registration),
    ]);
    expect(duplicateResponses.map((response) => response.status).toSorted((a, b) => a - b)).toEqual(
      [201, 409]
    );

    const sameNameResponses = await Promise.all([
      request(app.getHttpServer())
        .post("/api/auth/register")
        .send({ ...registration, email: `slug-a-${suffix}@example.com` }),
      request(app.getHttpServer())
        .post("/api/auth/register")
        .send({ ...registration, email: `slug-b-${suffix}@example.com` }),
    ]);
    expect(sameNameResponses.map((response) => response.status)).toEqual([201, 201]);
    expect(sameNameResponses[0]!.body.teams[0].slug).not.toBe(
      sameNameResponses[1]!.body.teams[0].slug
    );
  });

  it("enforces and performs Global Administrator workflows", async () => {
    const suffix = randomUUID().slice(0, 8);
    const ordinaryEmail = `ordinary-${suffix}@example.com`;
    const administratorEmail = `global-admin-${suffix}@example.com`;
    const ordinary = await register(ordinaryEmail, "Ordinary user");
    const administrator = await register(administratorEmail, "Global administrator");
    const database = app.get(DatabaseService);
    await seedGlobalAdministrator(database, administrator.user.id, {
      NODE_ENV: "development",
    });
    const signedInAdministrator = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: administratorEmail, password: "SecurePassword123" })
      .expect(200);
    expect(signedInAdministrator.body.user.isGlobalAdmin).toBe(true);
    const adminAuthorization = `Bearer ${signedInAdministrator.body.accessToken}`;

    await request(app.getHttpServer()).get("/api/admin/statistics").expect(401);
    await request(app.getHttpServer())
      .get("/api/admin/statistics")
      .set("authorization", `Bearer ${ordinary.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/admin/users/${administrator.user.id}/access`)
      .set("authorization", `Bearer ${ordinary.accessToken}`)
      .send({
        isGlobalAdmin: false,
        disabled: false,
        expectedIsGlobalAdmin: true,
        expectedDisabled: false,
      })
      .expect(403);

    const ordinaryPersonalToken = await request(app.getHttpServer())
      .post("/api/auth/api-tokens")
      .set("authorization", `Bearer ${ordinary.accessToken}`)
      .send({ name: "Ordinary automation", expiresInDays: 30 })
      .expect(201);

    const personalToken = await request(app.getHttpServer())
      .post("/api/auth/api-tokens")
      .set("authorization", adminAuthorization)
      .send({ name: "Administrator automation", expiresInDays: 30 })
      .expect(201);
    await request(app.getHttpServer())
      .get("/api/admin/statistics")
      .set("authorization", `Bearer ${personalToken.body.token}`)
      .expect(403);

    await request(app.getHttpServer())
      .get("/api/admin/statistics")
      .set("authorization", adminAuthorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body.totalUsers).toBeGreaterThanOrEqual(2);
        expect(body.globalAdministrators).toBeGreaterThanOrEqual(1);
        expect(body.registrations).toBeInstanceOf(Array);
      });

    await request(app.getHttpServer())
      .get(`/api/admin/users?search=${encodeURIComponent(ordinaryEmail)}`)
      .set("authorization", adminAuthorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body.total).toBe(1);
        expect(body.users[0]).toMatchObject({
          id: ordinary.user.id,
          email: ordinaryEmail,
          disabledAt: null,
          isGlobalAdmin: false,
        });
        expect(body.users[0]).not.toHaveProperty("passwordHash");
      });

    await request(app.getHttpServer())
      .patch(`/api/admin/users/${ordinary.user.id}/access`)
      .set("authorization", adminAuthorization)
      .send({
        isGlobalAdmin: false,
        disabled: true,
        expectedIsGlobalAdmin: false,
        expectedDisabled: false,
      })
      .expect(200)
      .expect(({ body }) => expect(body.disabledAt).toEqual(expect.any(String)));
    await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("authorization", `Bearer ${ordinary.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("authorization", `Bearer ${ordinaryPersonalToken.body.token}`)
      .expect(401);
    await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: ordinaryEmail, password: "SecurePassword123" })
      .expect(401);

    await request(app.getHttpServer())
      .patch(`/api/admin/users/${ordinary.user.id}/access`)
      .set("authorization", adminAuthorization)
      .send({
        isGlobalAdmin: true,
        disabled: false,
        expectedIsGlobalAdmin: false,
        expectedDisabled: true,
      })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/admin/users/${ordinary.user.id}/access`)
      .set("authorization", adminAuthorization)
      .send({
        isGlobalAdmin: false,
        disabled: false,
        expectedIsGlobalAdmin: false,
        expectedDisabled: true,
      })
      .expect(409);
    const ordinaryLogin = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: ordinaryEmail, password: "SecurePassword123" })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/admin/users/${ordinary.user.id}/access`)
      .set("authorization", adminAuthorization)
      .send({
        isGlobalAdmin: false,
        disabled: false,
        expectedIsGlobalAdmin: true,
        expectedDisabled: false,
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/admin/users/${ordinary.user.id}/revoke-sessions`)
      .set("authorization", adminAuthorization)
      .expect(204);
    await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("authorization", `Bearer ${ordinaryLogin.body.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/api/admin/users/${administrator.user.id}/access`)
      .set("authorization", adminAuthorization)
      .send({
        isGlobalAdmin: false,
        disabled: false,
        expectedIsGlobalAdmin: true,
        expectedDisabled: false,
      })
      .expect(403);

    const application = await request(app.getHttpServer())
      .post("/api/sponsors/applications")
      .send({
        organizationName: `Administrator workflow ${suffix}`,
        contactName: "Sponsor contact",
        email: `sponsor-${suffix}@example.com`,
        tier: "silver",
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/admin/sponsorship-applications/${application.body.id}`)
      .set("authorization", adminAuthorization)
      .send({ status: "approved", expectedStatus: "pending" })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe("approved"));
    await request(app.getHttpServer())
      .patch(`/api/admin/sponsorship-applications/${application.body.id}`)
      .set("authorization", adminAuthorization)
      .send({ status: "declined", expectedStatus: "pending" })
      .expect(409);

    const sponsorName = `Workflow sponsor ${suffix}`;
    const firstFaviconInput = await sharp({
      create: {
        width: 480,
        height: 240,
        channels: 4,
        background: { r: 255, g: 111, b: 130, alpha: 1 },
      },
    })
      .jpeg()
      .toBuffer();
    const sponsor = await request(app.getHttpServer())
      .post("/api/admin/sponsors")
      .set("authorization", adminAuthorization)
      .field("name", sponsorName)
      .field("tier", "gold")
      .field("websiteUrl", "https://example.com/workflow")
      .field("published", "true")
      .attach("favicon", firstFaviconInput, {
        filename: "company.jpg",
        contentType: "image/jpeg",
      })
      .expect(201);
    expect(sponsor.body.faviconUpdatedAt).toBeTypeOf("string");

    const firstStoredFavicon = await database.get<{
      favicon_data: Buffer;
      favicon_updated_at: string;
    }>("SELECT favicon_data, favicon_updated_at FROM sponsors WHERE id = ?", sponsor.body.id);
    expect(firstStoredFavicon?.favicon_updated_at).toBe(sponsor.body.faviconUpdatedAt);
    expect(await sharp(firstStoredFavicon!.favicon_data).metadata()).toMatchObject({
      format: "png",
      width: 64,
      height: 64,
    });

    const firstFaviconResponse = await request(app.getHttpServer())
      .get(`/api/sponsors/${sponsor.body.id}/favicon`)
      .expect("content-type", /image\/png/)
      .expect(200);
    expect(firstFaviconResponse.body).toEqual(firstStoredFavicon!.favicon_data);
    const firstFaviconEtag = firstFaviconResponse.headers.etag;
    if (!firstFaviconEtag) throw new Error("Expected a favicon ETag");
    await request(app.getHttpServer())
      .get(`/api/sponsors/${sponsor.body.id}/favicon`)
      .set("if-none-match", firstFaviconEtag)
      .expect(304);

    await request(app.getHttpServer())
      .get(`/api/admin/sponsors/${sponsor.body.id}/favicon`)
      .set("authorization", adminAuthorization)
      .expect("content-type", /image\/png/)
      .expect(200);

    await request(app.getHttpServer())
      .post("/api/admin/sponsors")
      .set("authorization", adminAuthorization)
      .field("name", `Invalid favicon ${suffix}`)
      .field("tier", "silver")
      .field("published", "false")
      .attach("favicon", Buffer.from("not an image"), {
        filename: "invalid.png",
        contentType: "image/png",
      })
      .expect(400)
      .expect(({ body }) => expect(body.message).toBe("Choose a valid sponsor image"));

    await request(app.getHttpServer())
      .post("/api/admin/sponsors")
      .set("authorization", adminAuthorization)
      .field("name", sponsorName.toUpperCase())
      .field("tier", "gold")
      .field("published", "false")
      .expect(409);

    const replacementFaviconInput = await sharp({
      create: {
        width: 200,
        height: 400,
        channels: 4,
        background: { r: 75, g: 196, b: 167, alpha: 0.7 },
      },
    })
      .webp()
      .toBuffer();
    const replacedSponsor = await request(app.getHttpServer())
      .patch(`/api/admin/sponsors/${sponsor.body.id}`)
      .set("authorization", adminAuthorization)
      .field("name", sponsorName)
      .field("tier", "platinum")
      .field("published", "true")
      .field("expectedUpdatedAt", sponsor.body.updatedAt)
      .attach("favicon", replacementFaviconInput, {
        filename: "replacement.webp",
        contentType: "image/webp",
      })
      .expect(200)
      .expect(({ body }) => expect(body.tier).toBe("platinum"));
    expect(replacedSponsor.body.faviconUpdatedAt).not.toBe(sponsor.body.faviconUpdatedAt);

    const replacementStoredFavicon = await database.get<{
      favicon_data: Buffer;
      favicon_updated_at: string;
    }>("SELECT favicon_data, favicon_updated_at FROM sponsors WHERE id = ?", sponsor.body.id);
    expect(replacementStoredFavicon?.favicon_updated_at).toBe(
      replacedSponsor.body.faviconUpdatedAt
    );
    expect(replacementStoredFavicon!.favicon_data).not.toEqual(firstStoredFavicon!.favicon_data);

    const editedSponsor = await request(app.getHttpServer())
      .patch(`/api/admin/sponsors/${sponsor.body.id}`)
      .set("authorization", adminAuthorization)
      .field("name", sponsorName)
      .field("tier", "platinum")
      .field("published", "true")
      .field("expectedUpdatedAt", replacedSponsor.body.updatedAt)
      .expect(200);
    expect(editedSponsor.body.faviconUpdatedAt).toBe(replacedSponsor.body.faviconUpdatedAt);
    expect(
      (
        await database.get<{ favicon_data: Buffer }>(
          "SELECT favicon_data FROM sponsors WHERE id = ?",
          sponsor.body.id
        )
      )?.favicon_data
    ).toEqual(replacementStoredFavicon!.favicon_data);

    const replacementFaviconResponse = await request(app.getHttpServer())
      .get(`/api/sponsors/${sponsor.body.id}/favicon`)
      .expect("content-type", /image\/png/)
      .expect(200);
    expect(replacementFaviconResponse.body).toEqual(replacementStoredFavicon!.favicon_data);
    expect(replacementFaviconResponse.headers.etag).not.toBe(firstFaviconEtag);
    await request(app.getHttpServer())
      .get("/api/sponsors")
      .expect(200)
      .expect(({ body }) =>
        expect(body[0].sponsors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: sponsorName,
              faviconUpdatedAt: replacedSponsor.body.faviconUpdatedAt,
            }),
          ])
        )
      );

    const companion = await request(app.getHttpServer())
      .post("/api/admin/sponsors")
      .set("authorization", adminAuthorization)
      .field("name", `Reorder companion ${suffix}`)
      .field("tier", "platinum")
      .field("published", "true")
      .expect(201);
    const beforeReorder = await request(app.getHttpServer())
      .get("/api/admin/sponsors")
      .set("authorization", adminAuthorization)
      .expect(200);
    const platinumIds = beforeReorder.body
      .filter((entry: { tier: string }) => entry.tier === "platinum")
      .map((entry: { id: string }) => entry.id);
    expect(platinumIds).toEqual(expect.arrayContaining([sponsor.body.id, companion.body.id]));
    const reorderedIds = platinumIds.toReversed();
    await request(app.getHttpServer())
      .patch("/api/admin/sponsors/order")
      .set("authorization", adminAuthorization)
      .send({ tier: "platinum", sponsorIds: reorderedIds })
      .expect(200)
      .expect(({ body }) =>
        expect(
          body
            .filter((entry: { tier: string }) => entry.tier === "platinum")
            .map((entry: { id: string }) => entry.id)
        ).toEqual(reorderedIds)
      );
    const afterReorder = await request(app.getHttpServer())
      .get("/api/admin/sponsors")
      .set("authorization", adminAuthorization)
      .expect(200);
    expect(
      afterReorder.body
        .filter((entry: { tier: string }) => entry.tier === "platinum")
        .map((entry: { id: string }) => entry.id)
    ).toEqual(reorderedIds);
    const publishedPlatinumIds = reorderedIds.filter(
      (id: string) =>
        beforeReorder.body.find((entry: { id: string }) => entry.id === id)?.published === true
    );
    await request(app.getHttpServer())
      .get("/api/sponsors")
      .expect(200)
      .expect(({ body }) =>
        expect(
          body
            .find((collection: { tier: string }) => collection.tier === "platinum")
            .sponsors.map((entry: { id: string }) => entry.id)
        ).toEqual(publishedPlatinumIds)
      );
    const reorderedSponsor = afterReorder.body.find(
      (entry: { id: string }) => entry.id === sponsor.body.id
    );
    const reorderedCompanion = afterReorder.body.find(
      (entry: { id: string }) => entry.id === companion.body.id
    );

    const removedImageSponsor = await request(app.getHttpServer())
      .patch(`/api/admin/sponsors/${sponsor.body.id}`)
      .set("authorization", adminAuthorization)
      .field("name", sponsorName)
      .field("tier", "platinum")
      .field("published", "true")
      .field("expectedUpdatedAt", reorderedSponsor.updatedAt)
      .field("removeFavicon", "true")
      .expect(200);
    expect(removedImageSponsor.body.faviconUpdatedAt).toBeNull();
    await request(app.getHttpServer())
      .get(`/api/admin/sponsors/${sponsor.body.id}/favicon`)
      .set("authorization", adminAuthorization)
      .expect(404);
    await request(app.getHttpServer()).get(`/api/sponsors/${sponsor.body.id}/favicon`).expect(404);
    await request(app.getHttpServer())
      .delete(`/api/admin/sponsors/${companion.body.id}`)
      .set("authorization", adminAuthorization)
      .send({ expectedUpdatedAt: reorderedCompanion.updatedAt })
      .expect(204);
    await request(app.getHttpServer())
      .get("/api/admin/sponsors")
      .set("authorization", adminAuthorization)
      .expect(200)
      .expect(({ body }) =>
        expect(body.some((entry: { id: string }) => entry.id === companion.body.id)).toBe(false)
      );

    const originalSettings = await request(app.getHttpServer())
      .get("/api/admin/settings")
      .set("authorization", adminAuthorization)
      .expect(200);
    const changedSettings = await request(app.getHttpServer())
      .patch("/api/admin/settings")
      .set("authorization", adminAuthorization)
      .send({
        registrationEnabled: false,
        sponsorshipApplicationsEnabled: false,
        sponsorshipApplicationRetentionDays: 30,
        expectedRevision: originalSettings.body.revision,
      })
      .expect(200);
    try {
      await request(app.getHttpServer())
        .patch("/api/admin/settings")
        .set("authorization", adminAuthorization)
        .send({
          registrationEnabled: true,
          sponsorshipApplicationsEnabled: true,
          sponsorshipApplicationRetentionDays: 180,
          expectedRevision: originalSettings.body.revision,
        })
        .expect(409);
      await request(app.getHttpServer())
        .post("/api/auth/register")
        .send({
          name: "Closed registration",
          email: `closed-${suffix}@example.com`,
          password: "SecurePassword123",
          acceptedTerms: true,
        })
        .expect(403);
      await request(app.getHttpServer())
        .post("/api/sponsors/applications")
        .send({
          organizationName: "Closed applications",
          contactName: "Sponsor contact",
          email: `closed-sponsor-${suffix}@example.com`,
          tier: "silver",
        })
        .expect(403);
      await request(app.getHttpServer())
        .get("/api/admin/audit")
        .set("authorization", adminAuthorization)
        .expect(200)
        .expect(({ body }) =>
          expect(body).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ action: "platform.settings_updated" }),
              expect.objectContaining({ action: "global_admin.user_access_updated" }),
            ])
          )
        );
    } finally {
      await request(app.getHttpServer())
        .patch("/api/admin/settings")
        .set("authorization", adminAuthorization)
        .send({
          registrationEnabled: originalSettings.body.registrationEnabled,
          sponsorshipApplicationsEnabled: originalSettings.body.sponsorshipApplicationsEnabled,
          sponsorshipApplicationRetentionDays:
            originalSettings.body.sponsorshipApplicationRetentionDays,
          expectedRevision: changedSettings.body.revision,
        })
        .expect(200);
    }
  });
});
