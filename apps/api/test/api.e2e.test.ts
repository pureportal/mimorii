import type { INestApplication } from "@nestjs/common";
import { termsVersion } from "@mimorii/contracts";
import { createHash, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { OAuthClientMetadataService } from "../src/auth/oauth-client-metadata.service.js";
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

function mcpRequest(method: string, parameters: Record<string, unknown>, name?: string) {
  return {
    body: {
      jsonrpc: "2.0",
      id: 1,
      method,
      params: {
        ...parameters,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": { name: "e2e-client", version: "1.0.0" },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    },
    name,
  };
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
    process.env.MIMORII_PUBLIC_URL = "http://localhost:4310";
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
    expect(openapi.body.paths["/api/dashboards/{id}/{slug}"]).toBeDefined();
    expect(openapi.body.paths["/api/public/status-pages/{id}/{slug}"]).toBeDefined();
    expect(openapi.body.paths["/api/teams/{teamId}/notifications/policies"]).toBeDefined();
    expect(openapi.body.paths["/api/teams/{teamId}/resources/{id}/metrics"]).toBeDefined();
    expect(openapi.body.paths["/api/teams/{teamId}/resources/{resourceId}/alerts"]).toBeDefined();
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

    const communityOrigin = "https://community.example";
    const sponsors = await request(app.getHttpServer())
      .get("/api/sponsors")
      .set("Origin", communityOrigin)
      .expect(200);
    expect(sponsors.headers["access-control-allow-origin"]).toBe("*");
    expect(sponsors.headers["cross-origin-resource-policy"]).toBe("cross-origin");
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

    const sponsorPreflight = await request(app.getHttpServer())
      .options("/api/sponsors/applications")
      .set("Origin", communityOrigin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type")
      .expect(204);
    expect(sponsorPreflight.headers["access-control-allow-origin"]).toBe("*");
    expect(sponsorPreflight.headers["access-control-allow-methods"]).toContain("POST");
    expect(sponsorPreflight.headers["access-control-allow-headers"]).toContain("Content-Type");

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

  it("allows client applications to save tour progress through CORS", async () => {
    const preflight = await request(app.getHttpServer())
      .options("/api/auth/profile/tour-acknowledgements/overview")
      .set("origin", "http://localhost:5180")
      .set("access-control-request-method", "PUT")
      .set("access-control-request-headers", "authorization")
      .expect(204);

    expect(preflight.headers["access-control-allow-methods"]).toContain("PUT");
  });

  it("runs direct checks and persists availability history", async () => {
    const account = await register("direct@example.com", "Direct Monitor");
    const teamId = account.teams[0]!.id;
    const authorization = `Bearer ${account.accessToken}`;
    const resource = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/resources`)
      .set("authorization", authorization)
      .send({ name: "Fixture", kind: "service", tags: ["test"] })
      .expect(201);
    expect(resource.body.imageUpdatedAt).toBeNull();

    const firstImageInput = await sharp({
      create: {
        width: 360,
        height: 180,
        channels: 4,
        background: { r: 80, g: 110, b: 210, alpha: 1 },
      },
    })
      .jpeg()
      .toBuffer();
    const firstImage = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/resources/${resource.body.id}/image`)
      .set("authorization", authorization)
      .attach("image", firstImageInput, { filename: "resource.jpg", contentType: "image/jpeg" })
      .expect(200);
    expect(firstImage.body.imageUpdatedAt).toBeTypeOf("string");

    const firstStoredImage = await app.get(DatabaseService).get<{
      image_data: Buffer;
      updated_at: string;
    }>("SELECT image_data, updated_at FROM resource_images WHERE resource_id = ?", resource.body.id);
    expect(firstStoredImage?.updated_at).toBe(firstImage.body.imageUpdatedAt);
    expect(await sharp(firstStoredImage!.image_data).metadata()).toMatchObject({
      format: "png",
      width: 128,
      height: 128,
    });

    const servedImage = await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/resources/${resource.body.id}/image`)
      .set("authorization", authorization)
      .expect("content-type", /image\/png/)
      .expect(200);
    expect(servedImage.body).toEqual(firstStoredImage!.image_data);
    const servedImageEtag = servedImage.headers.etag;
    if (!servedImageEtag) throw new Error("Expected a resource image ETag");
    await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/resources/${resource.body.id}/image`)
      .set("authorization", authorization)
      .set("if-none-match", servedImageEtag)
      .expect(304);

    const replacementInput = await sharp({
      create: {
        width: 160,
        height: 320,
        channels: 4,
        background: { r: 230, g: 90, b: 115, alpha: 1 },
      },
    })
      .webp()
      .toBuffer();
    const replacement = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/resources/${resource.body.id}/image`)
      .set("authorization", authorization)
      .attach("image", replacementInput, {
        filename: "replacement.webp",
        contentType: "image/webp",
      })
      .expect(200);
    expect(replacement.body.imageUpdatedAt).not.toBe(firstImage.body.imageUpdatedAt);
    const replacementStoredImage = await app
      .get(DatabaseService)
      .get<{ image_data: Buffer }>(
        "SELECT image_data FROM resource_images WHERE resource_id = ?",
        resource.body.id
      );
    expect(replacementStoredImage!.image_data).not.toEqual(firstStoredImage!.image_data);

    await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/resources/${resource.body.id}`)
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) => expect(body.imageUpdatedAt).toBe(replacement.body.imageUpdatedAt));
    const check = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/checks`)
      .set("authorization", authorization)
      .send({
        resourceId: resource.body.id,
        name: "Fixture HTTP",
        type: "http",
        config: {
          target: { url: fixtureUrl, method: "GET" },
          expectedStatuses: [200],
          responseContains: "healthy",
          followRedirects: true,
          validateTls: true,
        },
        execution: { kind: "direct" },
        intervalSeconds: 60,
        timeoutMs: 3_000,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/resources/${resource.body.id}/favicon`)
      .set("authorization", authorization)
      .expect(502)
      .expect(({ body }) => expect(body.message).toBe("Favicon could not be retrieved"));

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

    const checks = await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/checks`)
      .set("authorization", authorization)
      .expect(200);
    expect(checks.body).toEqual([
      expect.objectContaining({
        id: check.body.id,
        latestMetrics: expect.objectContaining({ responseBytes: expect.any(Number) }),
      }),
    ]);

    const overview = await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/analytics/overview`)
      .set("authorization", authorization)
      .expect(200);
    expect(overview.body).toMatchObject({ resources: 1, checks: 1, passing: 1, uptime24h: 100 });

    process.env.MIMORII_ALLOW_PRIVATE_DIRECT_TARGETS = "false";
    const unsafeResource = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/resources`)
      .set("authorization", authorization)
      .send({ name: "Private direct", kind: "service" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/checks`)
      .set("authorization", authorization)
      .send({
        resourceId: unsafeResource.body.id,
        name: "Unsafe port",
        type: "tcp",
        config: { target: { host: "127.0.0.1", port: 22 } },
        execution: { kind: "direct" },
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
      .send({ name: "JSON fixture", kind: "service" })
      .expect(201);
    const check = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/checks`)
      .set("authorization", authorization)
      .send({
        resourceId: resource.body.id,
        name: "JSON health",
        type: "http",
        config: {
          target: { url, method: "GET" },
          expectedStatuses: [200],
          expectedHeaders: {
            "content-type": "application/json",
            "x-fixture-state": "ready",
          },
          jsonAssertions: {
            kind: "group",
            operator: "and",
            conditions: [
              {
                kind: "assertion",
                name: "Service state",
                pointer: "/service/state",
                operator: "equals",
                expectedValue: "ready",
              },
            ],
          },
          latencyWarningMs: 30_000,
          followRedirects: false,
          validateTls: true,
        },
        execution: { kind: "direct" },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/checks/${check.body.id}/run`)
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) => expect(body.result.status).toBe("up"));
  });

  it("collects PostgreSQL statistics and evaluates a read-only assertion", async () => {
    const account = await register("database-check@example.com", "Database Check");
    const teamId = account.teams[0]!.id;
    const authorization = `Bearer ${account.accessToken}`;
    const resource = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/resources`)
      .set("authorization", authorization)
      .send({ name: "Mimorii database", kind: "service" })
      .expect(201);
    const check = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/checks`)
      .set("authorization", authorization)
      .send({
        resourceId: resource.body.id,
        name: "PostgreSQL health",
        type: "database",
        config: {
          target: {
            engine: "postgresql",
            host: process.env.MIMORII_DB_HOST,
            port: Number(process.env.MIMORII_DB_PORT),
            database: process.env.MIMORII_DB_NAME,
            username: process.env.MIMORII_DB_USER,
            tls: false,
          },
          connectionWarningPercent: 100,
          query: { statement: "SELECT 1 AS value", expectedValue: 1 },
        },
        secret: process.env.MIMORII_DB_PASSWORD,
        execution: { kind: "direct" },
      })
      .expect(201);
    expect(check.body).toMatchObject({
      type: "database",
      secretConfigured: true,
      execution: { kind: "direct" },
    });
    expect(check.body).not.toHaveProperty("secret");
    expect(check.body).not.toHaveProperty("encryptedSecret");

    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/checks/${check.body.id}/run`)
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) =>
        expect(body.result).toMatchObject({
          status: "up",
          metrics: {
            engine: "postgresql",
            version: expect.any(String),
            connections: expect.any(Number),
            maxConnections: expect.any(Number),
            connectionUtilizationPercent: expect.any(Number),
            databaseSizeBytes: expect.any(Number),
            transactionsCommitted: expect.any(Number),
            transactionsRolledBack: expect.any(Number),
            deadlocks: expect.any(Number),
            slowQueries: expect.any(Number),
            replicationLagSeconds: expect.any(Number),
          },
        })
      );
  });

  it("queues relay checks, ingests agent metrics, and tracks incidents", async () => {
    const account = await register("agent@example.com", "Agent Monitor");
    const teamId = account.teams[0]!.id;
    const authorization = `Bearer ${account.accessToken}`;
    const createdAgent = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/agents`)
      .set("authorization", authorization)
      .send({
        name: "Private network",
        kind: "desktop",
        platform: "linux",
        collectionIntervalSeconds: 45,
      })
      .expect(201);
    expect(createdAgent.body.kind).toBe("desktop");
    expect(createdAgent.body.collectionIntervalSeconds).toBe(45);
    await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/checks?resourceId=${createdAgent.body.resourceId}`)
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(2);
        expect(body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: "Host health",
              type: "host",
            }),
            expect.objectContaining({
              name: "Disk usage",
              type: "disk",
              config: { mount: "/", warningPercent: 85, criticalPercent: 95 },
            }),
          ])
        );
      });
    await request(app.getHttpServer())
      .patch(`/api/teams/${teamId}/agents/${createdAgent.body.id}`)
      .set("authorization", authorization)
      .send({ name: "Production network", collectionIntervalSeconds: 60 })
      .expect(200)
      .expect(({ body }) => {
        expect(body.resourceName).toBe("Production network");
        expect(body.collectionIntervalSeconds).toBe(60);
      });
    const agentAuthorization = `Bearer ${createdAgent.body.enrollmentKey}`;
    const resource = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/resources`)
      .set("authorization", authorization)
      .send({
        name: "Internal database",
        kind: "service",
      })
      .expect(201);
    const check = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/checks`)
      .set("authorization", authorization)
      .send({
        resourceId: resource.body.id,
        name: "PostgreSQL",
        type: "tcp",
        config: { target: { host: "database.internal", port: 5432 } },
        execution: { kind: "agent", agentId: createdAgent.body.id },
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
        containerRuntime: null,
      };
      await request(app.getHttpServer())
        .post("/api/agent/heartbeat")
        .set("authorization", agentAuthorization)
        .send({
          agentVersion: "2.1.0",
          snapshots: [
            {
              ...snapshot,
              snapshotId: randomUUID(),
              cpuPercent: 20,
              observedAt: previousTimestamp,
            },
            { ...snapshot, snapshotId: randomUUID(), observedAt: timestamp },
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
          capabilities: ["http", "tcp", "dns", "host"],
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
    expect(recoveredOverview.body).toMatchObject({ passing: 1, openIncidents: 0 });
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

  it("replaces a revoked host agent without duplicating or blocking its resource", async () => {
    const account = await register(
      `agent-replacement-${randomUUID()}@example.com`,
      "Agent Replacement"
    );
    const teamId = account.teams[0]!.id;
    const authorization = `Bearer ${account.accessToken}`;
    const original = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/agents`)
      .set("authorization", authorization)
      .send({ name: "Homeserver", kind: "desktop", platform: "linux" })
      .expect(201);
    const externalResource = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/resources`)
      .set("authorization", authorization)
      .send({ name: "SABnzbd", kind: "service" })
      .expect(201);
    const externalCheck = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/checks`)
      .set("authorization", authorization)
      .send({
        resourceId: externalResource.body.id,
        name: "SABnzbd TCP",
        type: "tcp",
        config: { target: { host: "sabnzbd.internal", port: 8080 } },
        execution: { kind: "agent", agentId: original.body.id },
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/teams/${teamId}/agents/${original.body.id}`)
      .set("authorization", authorization)
      .expect(204);
    await request(app.getHttpServer())
      .get("/api/agent/enrollment")
      .set("authorization", `Bearer ${original.body.enrollmentKey}`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/agents`)
      .set("authorization", authorization)
      .expect(200)
      .expect([]);
    const orphanedResource = await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/resources/${original.body.resourceId}`)
      .set("authorization", authorization)
      .expect(200);
    expect(orphanedResource.body).toMatchObject({ name: "Homeserver", agent: null });
    const suspendedChecks = await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/checks?resourceId=${original.body.resourceId}`)
      .set("authorization", authorization)
      .expect(200);
    expect(suspendedChecks.body).toHaveLength(2);
    expect(suspendedChecks.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "pending",
          nextCheckAt: null,
          execution: { kind: "agent", agentId: original.body.id },
        }),
      ])
    );

    const replacement = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/agents`)
      .set("authorization", authorization)
      .send({ resourceId: original.body.resourceId, kind: "desktop", platform: "linux" })
      .expect(201);
    expect(replacement.body.id).not.toBe(original.body.id);
    expect(replacement.body.resourceId).toBe(original.body.resourceId);
    expect(replacement.body.resourceName).toBe("Homeserver");
    await request(app.getHttpServer())
      .get("/api/agent/enrollment")
      .set("authorization", `Bearer ${replacement.body.enrollmentKey}`)
      .expect(200)
      .expect(({ body }) => expect(body.agentId).toBe(replacement.body.id));

    const resources = await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/resources`)
      .set("authorization", authorization)
      .expect(200);
    expect(
      resources.body.filter((resource: { name: string }) => resource.name === "Homeserver")
    ).toEqual([
      expect.objectContaining({
        id: original.body.resourceId,
        agent: expect.objectContaining({ id: replacement.body.id }),
      }),
    ]);
    const replacementChecks = await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/checks?resourceId=${original.body.resourceId}`)
      .set("authorization", authorization)
      .expect(200);
    expect(replacementChecks.body).toHaveLength(2);
    expect(replacementChecks.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "pending",
          nextCheckAt: expect.any(String),
          execution: { kind: "agent", agentId: replacement.body.id },
        }),
      ])
    );
    await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/checks/${externalCheck.body.id}`)
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) =>
        expect(body.execution).toEqual({ kind: "agent", agentId: replacement.body.id })
      );
  });

  it("registers a check-only agent without exposing host telemetry", async () => {
    const account = await register("check-runner@example.com", "Check Runner");
    const teamId = account.teams[0]!.id;
    const authorization = `Bearer ${account.accessToken}`;
    const createdAgent = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/agents`)
      .set("authorization", authorization)
      .send({ name: "Container probe", kind: "desktop", platform: "windows" })
      .expect(201);
    const agentAuthorization = `Bearer ${createdAgent.body.enrollmentKey}`;

    const generatedChecks = await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/checks?resourceId=${createdAgent.body.resourceId}`)
      .set("authorization", authorization)
      .expect(200);
    expect(generatedChecks.body).toHaveLength(2);
    const hostCheck = generatedChecks.body.find((check: { type: string }) => check.type === "host");
    const diskCheck = generatedChecks.body.find((check: { type: string }) => check.type === "disk");
    expect(hostCheck).toMatchObject({
      name: "Host health",
      type: "host",
      config: {
        cpuWarningPercent: 90,
        cpuCriticalPercent: 98,
        memoryWarningPercent: 90,
        memoryCriticalPercent: 98,
        swapWarningPercent: 90,
        swapCriticalPercent: 98,
      },
    });
    expect(hostCheck.config).not.toHaveProperty("loadWarning");
    expect(diskCheck).toMatchObject({
      name: "Disk usage",
      type: "disk",
      config: { mount: "C:", warningPercent: 85, criticalPercent: 95 },
    });
    await request(app.getHttpServer())
      .patch(`/api/teams/${teamId}/checks/${hostCheck.id}`)
      .set("authorization", authorization)
      .send({
        config: {
          ...hostCheck.config,
          cpuWarningPercent: 75,
        },
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.config.cpuWarningPercent).toBe(75);
      });
    await request(app.getHttpServer())
      .patch(`/api/teams/${teamId}/checks/${diskCheck.id}`)
      .set("authorization", authorization)
      .send({ config: { mount: "D:", warningPercent: 80, criticalPercent: 92 } })
      .expect(200)
      .expect(({ body }) => {
        expect(body.config).toEqual({ mount: "D:", warningPercent: 80, criticalPercent: 92 });
      });
    for (const check of [hostCheck, diskCheck]) {
      await request(app.getHttpServer())
        .delete(`/api/teams/${teamId}/checks/${check.id}`)
        .set("authorization", authorization)
        .expect(204);
    }
    await request(app.getHttpServer())
      .get("/api/agent/tasks")
      .set("authorization", agentAuthorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body.collectHostTelemetry).toBe(false);
        expect(body.tasks).toEqual([]);
      });

    await request(app.getHttpServer())
      .post("/api/agent/heartbeat")
      .set("authorization", agentAuthorization)
      .send({
        agentVersion: "2.1.0",
        snapshots: [],
        results: [],
        capabilities: ["http", "tcp", "dns"],
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.acceptedSnapshots).toBe(0);
        expect(body.acceptedResults).toBe(0);
      });

    const agents = await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/agents`)
      .set("authorization", authorization)
      .expect(200);
    expect(agents.body[0]).toMatchObject({
      platform: "windows",
      version: "2.1.0",
      capabilities: ["http", "tcp", "dns"],
    });
    await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/agents/${createdAgent.body.id}/snapshots`)
      .set("authorization", authorization)
      .expect(200)
      .expect([]);

    const resource = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/resources`)
      .set("authorization", authorization)
      .send({
        name: "Container network target",
        kind: "service",
      })
      .expect(201);
    const checkDefinitions = [
      ["HTTP", "http", { target: { url: "https://example.com/health", method: "GET" } }],
      ["TCP", "tcp", { target: { host: "database.internal", port: 5432 } }],
      ["DNS", "dns", { target: { hostname: "service.internal" }, recordType: "A" }],
    ] as const;
    const createdChecks = await Promise.all(
      checkDefinitions.map(async ([name, type, config]) => {
        const response = await request(app.getHttpServer())
          .post(`/api/teams/${teamId}/checks`)
          .set("authorization", authorization)
          .send({
            resourceId: resource.body.id,
            name,
            type,
            config,
            execution: { kind: "agent", agentId: createdAgent.body.id },
          })
          .expect(201);
        const id = response.body.id;
        if (typeof id !== "string") throw new Error("Created check ID is missing");
        return { id, type };
      })
    );
    const tcpCheck = createdChecks.find((check) => check.type === "tcp");
    if (!tcpCheck) throw new Error("TCP check was not created");
    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/checks/${tcpCheck.id}/run`)
      .set("authorization", authorization)
      .expect(200);
    const taskResponse = await request(app.getHttpServer())
      .get("/api/agent/tasks")
      .set("authorization", agentAuthorization)
      .expect(200);
    expect(taskResponse.body.tasks).toHaveLength(1);
    await request(app.getHttpServer())
      .post("/api/agent/heartbeat")
      .set("authorization", agentAuthorization)
      .send({
        agentVersion: "2.1.0",
        snapshots: [],
        results: [
          {
            taskId: taskResponse.body.tasks[0].id,
            status: "up",
            latencyMs: 3.2,
            statusCode: null,
            message: null,
            metrics: { port: 5432 },
            checkedAt: new Date().toISOString(),
          },
        ],
        capabilities: ["http", "tcp", "dns"],
      })
      .expect(200)
      .expect(({ body }) => expect(body.acceptedResults).toBe(1));
    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/checks`)
      .set("authorization", authorization)
      .send({
        resourceId: resource.body.id,
        name: "Host",
        type: "host",
        config: {
          cpuWarningPercent: 80,
          cpuCriticalPercent: 90,
          memoryWarningPercent: 80,
          memoryCriticalPercent: 90,
          loadWarning: 4,
          loadCritical: 8,
          swapWarningPercent: 80,
          swapCriticalPercent: 90,
        },
        execution: { kind: "agent", agentId: createdAgent.body.id },
      })
      .expect(400);

    await request(app.getHttpServer())
      .post("/api/agent/heartbeat")
      .set("authorization", agentAuthorization)
      .send({
        agentVersion: "2.1.0",
        snapshots: [],
        results: [],
        capabilities: ["http", "tcp", "dns", "host"],
      })
      .expect(200);
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
    await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/resources/${createdAgent.body.resourceId}`)
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          id: createdAgent.body.resourceId,
          name: "Field phone",
          kind: "device",
          agent: { id: createdAgent.body.id, kind: "mobile" },
        })
      );

    const agentAuthorization = `Bearer ${createdAgent.body.enrollmentKey}`;
    await request(app.getHttpServer())
      .get("/api/agent/enrollment")
      .set("authorization", agentAuthorization)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toEqual({
          agentId: createdAgent.body.id,
          resourceId: createdAgent.body.resourceId,
          resourceName: "Field phone",
          kind: "mobile",
          collectionIntervalSeconds: 900,
        })
      );
    const observedAt = new Date().toISOString();
    const status = {
      agentId: createdAgent.body.id,
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
      agent: { appVersion: "0.1.0", buildNumber: 1 },
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
      .send({ ...status, agentId: randomUUID(), submissionId: randomUUID() })
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

    const alert = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/resources/${createdAgent.body.resourceId}/alerts`)
      .set("authorization", authorization)
      .send({
        name: "Low battery",
        metric: "batteryPercent",
        operator: "lessThan",
        threshold: 70,
        recoveryThreshold: 75,
        requiredSamples: 1,
      })
      .expect(201);
    expect(alert.body).toMatchObject({ active: false, enabled: true, threshold: 70 });

    const lowBatteryStatus = {
      ...status,
      submissionId: randomUUID(),
      observedAt: new Date().toISOString(),
      battery: { ...status.battery, percent: 68 },
    };
    await request(app.getHttpServer())
      .post("/api/agent/device-status")
      .set("authorization", agentAuthorization)
      .send(lowBatteryStatus)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/resources/${createdAgent.body.resourceId}/alerts`)
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual([expect.objectContaining({ id: alert.body.id, active: true })]);
        expect(new Date(body[0].lastEvaluatedAt).toISOString()).toBe(lowBatteryStatus.observedAt);
        expect(new Date(body[0].triggeredAt).toISOString()).toBe(lowBatteryStatus.observedAt);
      });

    await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/resources/${createdAgent.body.resourceId}/metrics`)
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) => {
        const battery = body.find(
          (series: { metric: string }) => series.metric === "batteryPercent"
        );
        const normalizedPoints = battery.points.map(
          (point: { observedAt: string; value: number }) => ({
            ...point,
            observedAt: new Date(point.observedAt).toISOString(),
          })
        );
        expect(normalizedPoints).toEqual(
          expect.arrayContaining([
            { value: 72, observedAt },
            { value: 68, observedAt: lowBatteryStatus.observedAt },
          ])
        );
      });

    const recoveredStatus = {
      ...status,
      submissionId: randomUUID(),
      observedAt: new Date().toISOString(),
      battery: { ...status.battery, percent: 76 },
    };
    await request(app.getHttpServer())
      .post("/api/agent/device-status")
      .set("authorization", agentAuthorization)
      .send(recoveredStatus)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/teams/${teamId}/resources/${createdAgent.body.resourceId}/alerts`)
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body[0]).toMatchObject({
          id: alert.body.id,
          active: false,
          triggeredAt: null,
        });
        expect(new Date(body[0].lastEvaluatedAt).toISOString()).toBe(recoveredStatus.observedAt);
      });

    const mobileTarget = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/resources`)
      .set("authorization", authorization)
      .send({
        name: "Mobile-routed resource",
        kind: "service",
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/checks`)
      .set("authorization", authorization)
      .send({
        resourceId: mobileTarget.body.id,
        name: "Mobile relay",
        type: "http",
        config: {
          target: { url: "https://example.com/", method: "GET" },
          expectedStatuses: [200],
          followRedirects: false,
          validateTls: true,
        },
        execution: { kind: "agent", agentId: createdAgent.body.id },
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
      .send({ name: "Public API", kind: "service" })
      .expect(201);
    const check = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/checks`)
      .set("authorization", authorization)
      .send({
        resourceId: resource.body.id,
        name: "API health",
        type: "http",
        config: {
          target: { url: fixtureUrl, method: "GET" },
          expectedStatuses: [200],
          followRedirects: true,
          validateTls: true,
        },
        execution: { kind: "direct" },
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
      .send({ status: "monitoring", message: "" })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("monitoring");
        expect(body.updates[0]).toMatchObject({ status: "monitoring", message: "" });
      });
    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/incidents/${incident.body.id}/updates`)
      .set("authorization", authorization)
      .send({ status: "resolved", message: "Error rates returned to normal." })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("resolved");
        expect(body.updates[0]).toMatchObject({
          status: "resolved",
          message: "Error rates returned to normal.",
        });
      });

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
      .get(`/api/public/status-pages/${statusPage.body.id}/${statusPage.body.slug}`)
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
      .expect(({ body }) => {
        expect(body).toMatchObject({ totalResults: 1, availabilityPercent: 100 });
        expect(body.daily).toHaveLength(1);
        expect(body.daily[0]).toMatchObject({
          up: 1,
          degraded: 0,
          down: 0,
          availabilityPercent: 100,
        });
      });

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
      .send({ name: "Dashboard API", kind: "service" })
      .expect(201);
    const check = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/checks`)
      .set("authorization", authorization)
      .send({
        resourceId: resource.body.id,
        name: "Dashboard health",
        type: "http",
        config: {
          target: { url: fixtureUrl, method: "GET" },
          expectedStatuses: [200],
          followRedirects: true,
          validateTls: true,
        },
        execution: { kind: "direct" },
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
      .get(`/api/dashboards/${publicDashboard.body.dashboard.id}/${publicSlug}`)
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
    const privateDashboard = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/dashboards`)
      .set("authorization", authorization)
      .send({
        name: "Private dashboard",
        slug: privateSlug,
        accessMode: "private",
        items: createItems(),
      })
      .expect(201);
    const privateId = privateDashboard.body.dashboard.id as string;
    await request(app.getHttpServer())
      .get(`/api/dashboards/${privateId}/${privateSlug}`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/dashboards/${privateId}/${privateSlug}`)
      .set("authorization", authorization)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/dashboards/${privateId}/${privateSlug}`)
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
      .get(`/api/dashboards/${protectedId}/${protectedSlug}`)
      .expect(404);
    const invalidKey = await request(app.getHttpServer())
      .get(`/api/dashboards/${protectedId}/${protectedSlug}`)
      .set("x-dashboard-key", "mim_dash_invalid")
      .expect(404);
    expect(invalidKey.body).toEqual(missingKey.body);
    await request(app.getHttpServer())
      .get(`/api/dashboards/${protectedId}/${protectedSlug}`)
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
      .get(`/api/dashboards/${protectedId}/${protectedSlug}`)
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
      .get(`/api/dashboards/${protectedId}/${protectedSlug}`)
      .set("x-dashboard-key", originalKey)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/dashboards/${protectedId}/${protectedSlug}`)
      .set("x-dashboard-key", rotatedKey)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/teams/${teamId}/dashboards/${protectedId}/access-key`)
      .set("authorization", authorization)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/dashboards/${protectedId}/${protectedSlug}`)
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
    await request(app.getHttpServer())
      .get(`/api/dashboards/${publicDashboard.body.dashboard.id}/${publicSlug}`)
      .expect(404);
  });

  it("allows duplicate names and slugs while stable identifiers resolve each resource", async () => {
    const testId = randomUUID();
    const [firstAccount, secondAccount] = await Promise.all([
      register(`identifiers-a-${testId}@example.com`, "Default"),
      register(`identifiers-b-${testId}@example.com`, "Default"),
    ]);
    const firstTeam = firstAccount.teams[0]!;
    const secondTeam = secondAccount.teams[0]!;
    expect(firstTeam.name).toBe(secondTeam.name);
    expect(firstTeam.id).not.toBe(secondTeam.id);
    expect(firstTeam).not.toHaveProperty("slug");
    expect(secondTeam).not.toHaveProperty("slug");

    const firstAuthorization = `Bearer ${firstAccount.accessToken}`;
    const secondAuthorization = `Bearer ${secondAccount.accessToken}`;
    const [firstResource, secondResource] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/teams/${firstTeam.id}/resources`)
        .set("authorization", firstAuthorization)
        .send({ name: "First API", kind: "service" }),
      request(app.getHttpServer())
        .post(`/api/teams/${secondTeam.id}/resources`)
        .set("authorization", secondAuthorization)
        .send({ name: "Second API", kind: "service" }),
    ]);
    expect([firstResource.status, secondResource.status]).toEqual([201, 201]);

    const sharedSlug = "service-health";
    const [firstDashboard, secondDashboard] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/teams/${firstTeam.id}/dashboards`)
        .set("authorization", firstAuthorization)
        .send({ name: "First dashboard", slug: sharedSlug, accessMode: "public", items: [] }),
      request(app.getHttpServer())
        .post(`/api/teams/${secondTeam.id}/dashboards`)
        .set("authorization", secondAuthorization)
        .send({ name: "Second dashboard", slug: sharedSlug, accessMode: "public", items: [] }),
    ]);
    expect([firstDashboard.status, secondDashboard.status]).toEqual([201, 201]);
    const firstDashboardId = firstDashboard.body.dashboard.id as string;
    const secondDashboardId = secondDashboard.body.dashboard.id as string;
    expect(firstDashboardId).not.toBe(secondDashboardId);

    await request(app.getHttpServer())
      .get(`/api/dashboards/${firstDashboardId}/${sharedSlug}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({ id: firstDashboardId, name: "First dashboard" })
      );
    await request(app.getHttpServer())
      .get(`/api/dashboards/${secondDashboardId}/${sharedSlug}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({ id: secondDashboardId, name: "Second dashboard" })
      );

    const [firstStatusPage, secondStatusPage] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/teams/${firstTeam.id}/status-pages`)
        .set("authorization", firstAuthorization)
        .send({
          name: "First status",
          slug: sharedSlug,
          resourceIds: [firstResource.body.id],
          published: true,
        }),
      request(app.getHttpServer())
        .post(`/api/teams/${secondTeam.id}/status-pages`)
        .set("authorization", secondAuthorization)
        .send({
          name: "Second status",
          slug: sharedSlug,
          resourceIds: [secondResource.body.id],
          published: true,
        }),
    ]);
    expect([firstStatusPage.status, secondStatusPage.status]).toEqual([201, 201]);
    expect(firstStatusPage.body.id).not.toBe(secondStatusPage.body.id);

    await request(app.getHttpServer())
      .get(`/api/public/status-pages/${firstStatusPage.body.id}/${sharedSlug}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({ id: firstStatusPage.body.id, name: "First status" })
      );
    await request(app.getHttpServer())
      .get(`/api/public/status-pages/${secondStatusPage.body.id}/${sharedSlug}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({ id: secondStatusPage.body.id, name: "Second status" })
      );

    await request(app.getHttpServer())
      .patch(`/api/teams/${firstTeam.id}/dashboards/${firstDashboardId}`)
      .set("authorization", firstAuthorization)
      .send({ slug: "renamed-dashboard" })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/dashboards/${firstDashboardId}/${sharedSlug}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({ id: firstDashboardId, slug: "renamed-dashboard" })
      );

    await request(app.getHttpServer())
      .patch(`/api/teams/${firstTeam.id}/status-pages/${firstStatusPage.body.id}`)
      .set("authorization", firstAuthorization)
      .send({ slug: "renamed-status" })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/public/status-pages/${firstStatusPage.body.id}/${sharedSlug}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({ id: firstStatusPage.body.id, slug: "renamed-status" })
      );
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
      .send({ name: "Production worker", kind: "service", tags: ["production"] })
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
      .send({ name: "Nightly import", kind: "service" })
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
      .get(`/api/public/status-pages/${statusPage.body.id}/${statusPage.body.slug}`)
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
      .get(`/api/public/status-pages/${statusPage.body.id}/${statusPage.body.slug}`)
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
      .expect(({ body }) => expect(body).toMatchObject({ heartbeats: 1, passing: 1, down: 0 }));

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
    const toolsListRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": { name: "e2e-client", version: "1.0.0" },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    };
    await request(app.getHttpServer())
      .post("/api/mcp")
      .set("host", "localhost:4310")
      .set("authorization", authorization)
      .set("accept", "application/json, text/event-stream")
      .set("mcp-protocol-version", "2026-07-28")
      .set("mcp-method", "tools/list")
      .send(toolsListRequest)
      .expect(401)
      .expect(({ headers }) =>
        expect(headers["www-authenticate"]).toContain(
          'resource_metadata="http://localhost:4310/.well-known/oauth-protected-resource/api/mcp"'
        )
      );
    await request(app.getHttpServer())
      .post("/api/mcp")
      .set("host", "localhost:4310")
      .set("authorization", apiAuthorization)
      .set("accept", "application/json, text/event-stream")
      .set("mcp-protocol-version", "2026-07-28")
      .set("mcp-method", "tools/list")
      .send(toolsListRequest)
      .expect(401);
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

  it("authorizes remote MCP clients with resource-bound OAuth tokens", async () => {
    const account = await register("mcp-oauth@example.com", "MCP operator");
    const authorization = `Bearer ${account.accessToken}`;
    const teamId = account.teams[0]!.id;
    const createdResource = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/resources`)
      .set("authorization", authorization)
      .send({ name: "OAuth target", kind: "service" })
      .expect(201);
    const clientId = "https://client.example/oauth/mimorii.json";
    const redirectUri = "http://127.0.0.1:9211/callback";
    const resource = "http://localhost:4310/api/mcp";
    const verifier = "e".repeat(64);
    const codeChallenge = createHash("sha256").update(verifier).digest("base64url");
    const clients = app.get(OAuthClientMetadataService);
    const metadata = vi.spyOn(clients, "resolve").mockResolvedValue({
      clientId,
      clientName: "MCP test client",
      redirectUris: [redirectUri],
      allowRefresh: true,
    });
    const callMcp = (accessToken: string, requestBody: ReturnType<typeof mcpRequest>) => {
      const pending = request(app.getHttpServer())
        .post("/api/mcp")
        .set("host", "localhost:4310")
        .set("authorization", `Bearer ${accessToken}`)
        .set("accept", "application/json, text/event-stream")
        .set("mcp-protocol-version", "2026-07-28")
        .set("mcp-method", requestBody.body.method);
      if (requestBody.name) pending.set("mcp-name", requestBody.name);
      return pending.send(requestBody.body);
    };
    const authorize = async (scope: string, state: string) => {
      const parameters = {
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        scope,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        resource,
      };
      await request(app.getHttpServer())
        .get("/api/oauth/authorize")
        .query({ ...parameters, ui_locales: "en-US" })
        .expect(303)
        .expect(({ headers }) => {
          const location = headers.location;
          if (!location) throw new Error("OAuth authorization redirect is missing");
          expect(location).toMatch(/^http:\/\/localhost:4310\/oauth\/authorize\?/);
          expect(new URL(location).searchParams.has("ui_locales")).toBe(false);
        });
      await request(app.getHttpServer())
        .get("/api/oauth/authorization-request")
        .set("authorization", authorization)
        .query(parameters)
        .expect(200)
        .expect(({ body }) =>
          expect(body).toMatchObject({
            clientName: "MCP test client",
            clientHost: "client.example",
            redirectHost: "127.0.0.1:9211",
            redirectIsLoopback: true,
            refreshAccess: true,
          })
        );
      const decision = await request(app.getHttpServer())
        .post("/api/oauth/authorization")
        .set("authorization", authorization)
        .send({ ...parameters, decision: "approve" })
        .expect(200);
      const redirect = new URL(decision.body.redirectUri);
      expect(redirect.searchParams.get("state")).toBe(state);
      expect(redirect.searchParams.get("iss")).toBe("http://localhost:4310");
      return request(app.getHttpServer())
        .post("/api/oauth/token")
        .type("form")
        .send({
          grant_type: "authorization_code",
          client_id: clientId,
          redirect_uri: redirectUri,
          code: redirect.searchParams.get("code"),
          code_verifier: verifier,
          resource,
        })
        .expect(200);
    };

    try {
      await request(app.getHttpServer())
        .get("/.well-known/oauth-protected-resource/api/mcp")
        .expect(200)
        .expect(({ body }) =>
          expect(body).toEqual({
            resource,
            authorization_servers: ["http://localhost:4310"],
            bearer_methods_supported: ["header"],
            scopes_supported: ["mcp:read", "mcp:write"],
            resource_documentation: "http://localhost:4310/mcp",
          })
        );
      await request(app.getHttpServer())
        .get("/.well-known/oauth-authorization-server")
        .expect(200)
        .expect(({ body }) =>
          expect(body).toMatchObject({
            issuer: "http://localhost:4310",
            client_id_metadata_document_supported: true,
            code_challenge_methods_supported: ["S256"],
          })
        );

      const readTokens = await authorize("mcp:read", "read-state");
      expect(readTokens.body).toMatchObject({
        access_token: expect.stringMatching(/^mim_oat_/),
        refresh_token: expect.stringMatching(/^mim_ort_/),
        scope: "mcp:read",
      });
      await callMcp(readTokens.body.access_token, mcpRequest("tools/list", {}))
        .expect(200)
        .expect("cache-control", "no-store")
        .expect(({ body }) => {
          expect(body.result).toMatchObject({ ttlMs: 300_000, cacheScope: "public" });
          expect(body.result.tools.map((tool: { name: string }) => tool.name)).toContain(
            "get_team_overview"
          );
        });
      await callMcp(
        readTokens.body.access_token,
        mcpRequest(
          "tools/call",
          { name: "get_team_overview", arguments: { teamId } },
          "get_team_overview"
        )
      )
        .expect(200)
        .expect(({ body }) =>
          expect(JSON.parse(body.result.content[0].text)).toMatchObject({ resources: 1 })
        );
      await request(app.getHttpServer())
        .get("/api/auth/me")
        .set("authorization", `Bearer ${readTokens.body.access_token}`)
        .expect(401);
      await callMcp(
        readTokens.body.access_token,
        mcpRequest(
          "tools/call",
          {
            name: "update_resource",
            arguments: { teamId, resourceId: createdResource.body.id, name: "Denied" },
          },
          "update_resource"
        )
      )
        .expect(403)
        .expect(({ headers }) =>
          expect(headers["www-authenticate"]).toContain('scope="mcp:read mcp:write"')
        );

      const writeTokens = await authorize("mcp:read mcp:write", "write-state");
      await callMcp(
        writeTokens.body.access_token,
        mcpRequest(
          "tools/call",
          {
            name: "update_resource",
            arguments: {
              teamId,
              resourceId: createdResource.body.id,
              name: "Updated through MCP",
            },
          },
          "update_resource"
        )
      )
        .expect(200)
        .expect(({ body }) =>
          expect(JSON.parse(body.result.content[0].text)).toMatchObject({
            id: createdResource.body.id,
            name: "Updated through MCP",
          })
        );

      const rotated = await request(app.getHttpServer())
        .post("/api/oauth/token")
        .type("form")
        .send({
          grant_type: "refresh_token",
          client_id: clientId,
          refresh_token: readTokens.body.refresh_token,
          resource,
        })
        .expect(200);
      expect(rotated.body.refresh_token).not.toBe(readTokens.body.refresh_token);
      await request(app.getHttpServer())
        .post("/api/oauth/token")
        .type("form")
        .send({
          grant_type: "refresh_token",
          client_id: clientId,
          refresh_token: readTokens.body.refresh_token,
          resource,
        })
        .expect(400)
        .expect(({ body }) => expect(body.error).toBe("invalid_grant"));
      await callMcp(rotated.body.access_token, mcpRequest("tools/list", {})).expect(401);
    } finally {
      metadata.mockRestore();
    }
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

  it("handles concurrent account creation with duplicate team names", async () => {
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
    expect(sameNameResponses[0]!.body.teams[0].name).toBe(sameNameResponses[1]!.body.teams[0].name);
    expect(sameNameResponses[0]!.body.teams[0].id).not.toBe(sameNameResponses[1]!.body.teams[0].id);
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
      .expect(({ body }) => expect(body.message).toBe("Choose a valid image"));

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
