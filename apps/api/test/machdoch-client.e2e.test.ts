import type { INestApplication } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseService } from "../src/database/database.service.js";
import { seedGlobalAdministrator } from "../src/database/seed/global-admin.js";
import { registerAccount, signIn } from "./fixtures/two-factor.js";

const databaseConfigured = [
  "MIMORII_DB_HOST",
  "MIMORII_DB_PORT",
  "MIMORII_DB_NAME",
  "MIMORII_DB_USER",
  "MIMORII_DB_PASSWORD",
].every((name) => Boolean(process.env[name]));

const clientId = "machdoch-client";
const redirectUri = "http://127.0.0.1:43110/oauth/callback";
const resource = "http://localhost:4310/api/mcp";

describe.skipIf(!databaseConfigured)("Machdoch MCP client", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.MIMORII_JWT_SECRET = "test-only-secret-with-at-least-thirty-two-characters";
    process.env.MIMORII_SCHEDULER_ENABLED = "false";
    process.env.MIMORII_RATE_LIMIT = "10000";
    process.env.MIMORII_PUBLIC_URL = "http://localhost:4310";
    const { createApplication } = await import("../src/bootstrap.js");
    app = await createApplication();
    await app.init();
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
  }, 60_000);

  it("authorizes Machdoch and serves incident logs over MCP", async () => {
    const server = app.getHttpServer();
    const suffix = randomUUID().slice(0, 8);
    const owner = await registerAccount(app, {
      name: "Owner",
      email: `machdoch-${suffix}@example.com`,
      password: "SecurePassword123",
    });
    const authorization = `Bearer ${owner.accessToken}`;
    const teamId = owner.teams[0]!.id;
    const verifier = randomUUID().replaceAll("-", "").repeat(2);
    const parameters = {
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "mcp:read mcp:write",
      state: `machdoch-${suffix}`,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      resource,
    };

    await request(server)
      .get("/api/oauth/authorization-request")
      .set("authorization", authorization)
      .query({ ...parameters, redirect_uri: "https://attacker.example/callback" })
      .expect(400);
    await request(server)
      .get("/api/oauth/authorization-request")
      .set("authorization", authorization)
      .query(parameters)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toEqual({
          clientName: "Machdoch",
          clientHost: null,
          redirectHost: "127.0.0.1:43110",
          redirectIsLoopback: true,
          refreshAccess: true,
          scopes: ["mcp:read", "mcp:write"],
        })
      );
    const decision = await request(server)
      .post("/api/oauth/authorization")
      .set("authorization", authorization)
      .send({ ...parameters, decision: "approve" })
      .expect(200);
    const callback = new URL(decision.body.redirectUri);
    expect(`${callback.origin}${callback.pathname}`).toBe(redirectUri);
    const tokens = await request(server)
      .post("/api/oauth/token")
      .type("form")
      .send({
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: redirectUri,
        code: callback.searchParams.get("code"),
        code_verifier: verifier,
        resource,
      })
      .expect(200);
    expect(tokens.body).toMatchObject({
      access_token: expect.stringMatching(/^mim_oat_/),
      refresh_token: expect.stringMatching(/^mim_ort_/),
      scope: "mcp:read mcp:write",
    });
    const refreshed = await request(server)
      .post("/api/oauth/token")
      .type("form")
      .send({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: tokens.body.refresh_token,
        resource,
      })
      .expect(200);

    const database = app.get(DatabaseService);
    const administratorEmail = `machdoch-admin-${suffix}@example.com`;
    const administrator = await registerAccount(app, {
      name: "Administrator",
      email: administratorEmail,
      password: "SecurePassword123",
    });
    await seedGlobalAdministrator(database, administrator.user.id, { NODE_ENV: "development" });
    const adminSession = await signIn(app, administratorEmail, "SecurePassword123");
    await request(server)
      .patch(`/api/admin/teams/${teamId}/logs`)
      .set("authorization", `Bearer ${adminSession.accessToken}`)
      .send({ enabled: true })
      .expect(200);
    const target = await request(server)
      .post(`/api/teams/${teamId}/resources`)
      .set("authorization", authorization)
      .send({ name: "Checkout", kind: "service", logQuery: '{service="checkout"}' })
      .expect(201);
    const source = await request(server)
      .post(`/api/teams/${teamId}/logs/sources`)
      .set("authorization", authorization)
      .send({ name: "Checkout", labels: { service: "checkout" } })
      .expect(201);
    await request(server)
      .post("/api/logs/push")
      .set("authorization", `Bearer ${source.body.token}`)
      .send({
        entries: [
          { message: "Payment provider timeout after 2041 ms", level: "error" },
          { message: "Payment provider timeout after 2310 ms", level: "error" },
          { message: "GET /checkout 200", level: "info" },
        ],
      })
      .expect(202);
    const incident = await request(server)
      .post(`/api/teams/${teamId}/incidents`)
      .set("authorization", authorization)
      .send({
        title: "Checkout failures",
        impact: "major",
        resourceIds: [target.body.id],
        message: "Investigating",
      })
      .expect(201);

    const call = await request(server)
      .post("/api/mcp")
      .set("host", "localhost:4310")
      .set("authorization", `Bearer ${refreshed.body.access_token}`)
      .set("accept", "application/json, text/event-stream")
      .set("mcp-protocol-version", "2026-07-28")
      .set("mcp-method", "tools/call")
      .set("mcp-name", "get_incident_logs")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "get_incident_logs",
          arguments: { teamId, incidentId: incident.body.id },
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientInfo": { name: "machdoch", version: "40.6.0" },
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      })
      .expect(200);
    expect(call.body.result.structuredContent.streams).toEqual([
      expect.objectContaining({
        label: "Checkout",
        query: '{service="checkout"}',
        total: 3,
        levels: { error: 2, info: 1 },
        patterns: expect.arrayContaining([
          expect.objectContaining({ count: 2, levels: { error: 2 } }),
        ]),
      }),
    ]);
    expect(call.body.result.structuredContent.unlinkedResources).toEqual([]);

    const connections = await request(server)
      .get("/api/oauth/connections")
      .set("authorization", authorization)
      .expect(200);
    expect(connections.body).toEqual([
      expect.objectContaining({
        clientName: "Machdoch",
        clientHost: null,
        scopes: ["mcp:read", "mcp:write"],
        lastUsedAt: expect.any(String),
      }),
    ]);
    await request(server)
      .delete(`/api/oauth/connections/${connections.body[0].id}`)
      .set("authorization", authorization)
      .expect(204);
    await request(server)
      .get("/api/oauth/connections")
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) => expect(body).toEqual([]));
    await request(server)
      .post("/api/oauth/token")
      .type("form")
      .send({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: refreshed.body.refresh_token,
        resource,
      })
      .expect(400);
    await request(server)
      .delete(`/api/oauth/connections/${connections.body[0].id}`)
      .set("authorization", authorization)
      .expect(404);
  });
});
