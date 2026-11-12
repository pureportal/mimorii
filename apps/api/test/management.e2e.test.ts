import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
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

describe.skipIf(!databaseConfigured)("Mimorii management", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.MIMORII_JWT_SECRET = "test-only-secret-with-at-least-thirty-two-characters";
    process.env.MIMORII_SCHEDULER_ENABLED = "false";
    process.env.MIMORII_ALLOW_PRIVATE_DIRECT_TARGETS = "true";
    process.env.MIMORII_RATE_LIMIT = "10000";
    process.env.MIMORII_PUBLIC_URL = "http://localhost:4310";
    const { createApplication } = await import("../src/bootstrap.js");
    app = await createApplication();
    await app.init();
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
  }, 60_000);

  it("manages protocol checks in bulk, exports them, and links incident logs", async () => {
    const server = app.getHttpServer();
    const database = app.get(DatabaseService);
    const suffix = randomUUID().slice(0, 8);
    const owner = await registerAccount(app, {
      name: "Owner",
      email: `management-${suffix}@example.com`,
      password: "SecurePassword123",
    });
    const authorization = `Bearer ${owner.accessToken}`;
    const teamId = owner.teams[0]!.id;

    await request(server)
      .post(`/api/teams/${teamId}/resources`)
      .set("authorization", authorization)
      .send({ name: "Everything", kind: "service", logQuery: '|= "error"' })
      .expect(400)
      .expect(({ body }) => expect(body.message).toBe("Log query must select streams by label"));
    const resource = await request(server)
      .post(`/api/teams/${teamId}/resources`)
      .set("authorization", authorization)
      .send({ name: "Mail", kind: "service", logQuery: ' {service="mail"} ' })
      .expect(201);
    expect(resource.body.logQuery).toBe('{service="mail"}');

    const create = (type: string, config: Record<string, unknown>, extra = {}) =>
      request(server)
        .post(`/api/teams/${teamId}/checks`)
        .set("authorization", authorization)
        .send({
          resourceId: resource.body.id,
          name: `${type} check`,
          type,
          config,
          execution: { kind: "direct" },
          ...extra,
        });
    const tls = await create("tls", { target: { host: "127.0.0.1", port: 9 } }).expect(201);
    expect(tls.body.config).toEqual({
      target: { host: "127.0.0.1", port: 9 },
      certificateWarningDays: 21,
      validateTls: true,
    });
    const smtp = await create("smtp", {
      target: { host: "127.0.0.1", security: "tls" },
    }).expect(201);
    expect(smtp.body.config.target).toEqual({ host: "127.0.0.1", port: 465, security: "tls" });
    await create("grpc", { target: { host: "127.0.0.1", service: "bad service" } }).expect(400);
    const ntp = await create("ntp", { target: { host: "127.0.0.1" } }).expect(201);
    expect(ntp.body.config).toEqual({ target: { host: "127.0.0.1", port: 123 }, offsetWarningMs: 500 });
    await create("domain", { target: { domain: "example.com" } }, { intervalSeconds: 600 })
      .expect(400)
      .expect(({ body }) =>
        expect(body.message).toBe("Domain checks can run at most once per hour")
      );
    const domain = await create("domain", { target: { domain: "Example.COM" } }).expect(201);
    expect(domain.body).toMatchObject({
      intervalSeconds: 21_600,
      config: { target: { domain: "example.com" }, expiryWarningDays: 30 },
    });
    const ids = [tls.body.id, smtp.body.id, ntp.body.id, domain.body.id];

    const bulk = (action: string, checkIds: string[]) =>
      request(server)
        .post(`/api/teams/${teamId}/checks/bulk`)
        .set("authorization", authorization)
        .send({ action, ids: checkIds })
        .expect(200);
    expect((await bulk("pause", ids)).body).toEqual({ affected: 4 });
    expect((await bulk("pause", ids)).body).toEqual({ affected: 0 });
    expect((await bulk("run", ids)).body).toEqual({ affected: 0 });
    expect((await bulk("enable", [tls.body.id, ntp.body.id])).body).toEqual({ affected: 2 });
    const statuses = await request(server)
      .get(`/api/teams/${teamId}/checks?resourceId=${resource.body.id}`)
      .set("authorization", authorization)
      .expect(200);
    expect(
      Object.fromEntries(
        (statuses.body as Array<{ id: string; status: string }>).map((check) => [
          check.id,
          check.status,
        ])
      )
    ).toEqual({
      [tls.body.id]: "pending",
      [smtp.body.id]: "paused",
      [ntp.body.id]: "pending",
      [domain.body.id]: "paused",
    });
    expect((await bulk("run", ids)).body).toEqual({ affected: 2 });

    const catalog = await request(server)
      .get(`/api/teams/${teamId}/exports`)
      .set("authorization", authorization)
      .expect(200);
    expect(catalog.body.map((dataset: { id: string }) => dataset.id)).toEqual(
      expect.arrayContaining(["resources", "checks", "check-results", "incidents", "audit-log"])
    );
    const csv = await request(server)
      .get(`/api/teams/${teamId}/exports/checks?format=csv&resourceId=${resource.body.id}`)
      .set("authorization", authorization)
      .expect(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text.trim().split("\r\n")).toHaveLength(5);

    expect((await bulk("delete", [smtp.body.id, domain.body.id])).body).toEqual({ affected: 2 });

    const incident = await request(server)
      .post(`/api/teams/${teamId}/incidents`)
      .set("authorization", authorization)
      .send({
        title: "Mail delays",
        impact: "minor",
        resourceIds: [resource.body.id],
        message: "Investigating",
      })
      .expect(201);
    await request(server)
      .get(`/api/teams/${teamId}/logs/incidents/${incident.body.id}`)
      .set("authorization", authorization)
      .expect(403);

    const administratorEmail = `management-admin-${suffix}@example.com`;
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
    const source = await request(server)
      .post(`/api/teams/${teamId}/logs/sources`)
      .set("authorization", authorization)
      .send({ name: "Mail", labels: { service: "mail" } })
      .expect(201);
    await request(server)
      .post("/api/logs/push")
      .set("authorization", `Bearer ${source.body.token}`)
      .send({
        entries: [
          { message: "queue drained", level: "info" },
          { message: "SMTP relay refused connection 42", level: "error" },
          { message: "SMTP relay refused connection 43", level: "error" },
        ],
      })
      .expect(202);

    const logs = await request(server)
      .get(`/api/teams/${teamId}/logs/incidents/${incident.body.id}`)
      .set("authorization", authorization)
      .expect(200);
    expect(logs.body.streams).toHaveLength(1);
    expect(logs.body.streams[0]).toMatchObject({
      label: "Mail",
      query: '{service="mail"}',
      volume: { total: 3, levels: { error: 2, info: 1 } },
    });
    expect(logs.body.streams[0].patterns[0]).toMatchObject({ count: 2, levels: { error: 2 } });
    await request(server)
      .get(`/api/teams/${teamId}/logs/incidents/${randomUUID()}`)
      .set("authorization", authorization)
      .expect(404);
  });
});
