import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseService } from "../src/database/database.service.js";
import { seedGlobalAdministrator } from "../src/database/seed/global-admin.js";
import { LogAlertsService } from "../src/logs/log-alerts.service.js";
import { LogRetentionService } from "../src/logs/log-retention.service.js";
import { registerAccount, signIn } from "./fixtures/two-factor.js";

const databaseConfigured = [
  "MIMORII_DB_HOST",
  "MIMORII_DB_PORT",
  "MIMORII_DB_NAME",
  "MIMORII_DB_USER",
  "MIMORII_DB_PASSWORD",
].every((name) => Boolean(process.env[name]));

describe.skipIf(!databaseConfigured)("Mimorii logs", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.MIMORII_JWT_SECRET = "test-only-secret-with-at-least-thirty-two-characters";
    process.env.MIMORII_SCHEDULER_ENABLED = "false";
    process.env.MIMORII_RATE_LIMIT = "10000";
    process.env.MIMORII_PUBLIC_URL = "http://localhost:4310";
    process.env.MIMORII_LOG_TEAM_ENTRIES_PER_MINUTE = "100";
    const { createApplication } = await import("../src/bootstrap.js");
    app = await createApplication();
    await app.init();
  }, 60_000);

  afterAll(async () => {
    delete process.env.MIMORII_LOG_TEAM_ENTRIES_PER_MINUTE;
    if (app) await app.close();
  }, 60_000);

  function register(email: string, name: string) {
    return registerAccount(app, { name, email, password: "SecurePassword123" });
  }

  it("gates, ingests, queries, alerts on, and purges team logs", async () => {
    const server = app.getHttpServer();
    const database = app.get(DatabaseService);
    const suffix = randomUUID().slice(0, 8);
    const owner = await register(`logs-owner-${suffix}@example.com`, "Log owner");
    const administratorEmail = `logs-admin-${suffix}@example.com`;
    const administrator = await register(administratorEmail, "Log administrator");
    await seedGlobalAdministrator(database, administrator.user.id, { NODE_ENV: "development" });
    const adminSession = await signIn(app, administratorEmail, "SecurePassword123");
    const admin = `Bearer ${adminSession.accessToken}`;
    const ownerAuthorization = `Bearer ${owner.accessToken}`;
    const teamId = owner.teams[0]!.id;
    expect(owner.teams[0]!.logsEnabled).toBe(false);

    const disabled = await request(server)
      .get(`/api/teams/${teamId}/logs`)
      .set("authorization", ownerAuthorization)
      .expect(403);
    expect(disabled.body.message).toBe("Logs are not enabled for this team");
    await request(server)
      .post(`/api/teams/${teamId}/logs/sources`)
      .set("authorization", ownerAuthorization)
      .send({ name: "Web" })
      .expect(403);
    await request(server)
      .patch(`/api/admin/teams/${teamId}/logs`)
      .set("authorization", ownerAuthorization)
      .send({ enabled: true })
      .expect(403);

    const listed = await request(server)
      .get(`/api/admin/teams?search=${teamId}`)
      .set("authorization", admin)
      .expect(200);
    expect(listed.body.teams).toEqual([
      expect.objectContaining({ id: teamId, logsEnabled: false, memberCount: 1 }),
    ]);
    const enabled = await request(server)
      .patch(`/api/admin/teams/${teamId}/logs`)
      .set("authorization", admin)
      .send({ enabled: true })
      .expect(200);
    expect(enabled.body).toMatchObject({ logsEnabled: true, logsDeletionScheduledAt: null });
    const identity = await request(server)
      .get("/api/auth/me")
      .set("authorization", ownerAuthorization)
      .expect(200);
    expect(identity.body.teams[0]).toMatchObject({ id: teamId, logsEnabled: true });

    const source = await request(server)
      .post(`/api/teams/${teamId}/logs/sources`)
      .set("authorization", ownerAuthorization)
      .send({ name: "Web", labels: { service: "web" } })
      .expect(201);
    expect(source.body.token).toMatch(/^mim_log_/);
    expect(source.body.endpoints.loki).toBe("http://localhost:4310/api/loki/api/v1/push");
    const ingest = `Bearer ${source.body.token}`;

    await request(server)
      .post("/api/logs/push")
      .set("authorization", "Bearer mim_log_invalid")
      .send({ message: "rejected" })
      .expect(401);
    const pushed = await request(server)
      .post("/api/logs/push")
      .set("authorization", ingest)
      .send({
        labels: { service: "spoofed", route: "checkout" },
        entries: [
          { message: "GET /checkout 200", level: "info" },
          { message: "Error 404 - Failed to load", attributes: { status: 404 } },
        ],
      })
      .expect(202);
    expect(pushed.body).toEqual({
      accepted: 2,
      duplicates: 0,
      rejected: 0,
      truncated: 0,
      errors: [],
    });
    const now = Date.now();
    await request(server)
      .post("/api/loki/api/v1/push")
      .set("authorization", ingest)
      .send({
        streams: [
          {
            stream: { job: "nginx", level: "warn" },
            values: [[`${BigInt(now) * 1_000_000n}`, "upstream response is slow"]],
          },
        ],
      })
      .expect(204);
    await request(server)
      .post("/api/otlp/v1/logs")
      .set("authorization", `Basic ${Buffer.from(`otel:${source.body.token}`).toString("base64")}`)
      .send({
        resourceLogs: [
          {
            resource: { attributes: [{ key: "service.name", value: { stringValue: "api" } }] },
            scopeLogs: [{ logRecords: [{ severityText: "ERROR", body: { stringValue: "boom" } }] }],
          },
        ],
      })
      .expect(200);
    await request(server)
      .post("/api/logs/push")
      .set("authorization", ingest)
      .set("content-type", "text/plain")
      .send("DEBUG cache warmed\nINFO ready")
      .expect(202);
    await request(server)
      .post("/api/loki/api/v1/push")
      .set("authorization", ingest)
      .set("content-type", "application/x-protobuf")
      .send(Buffer.from([1, 2, 3]))
      .expect(400);
    await request(server)
      .post("/api/loki/api/v1/push")
      .set("authorization", "Bearer mim_log_invalid")
      .set("content-type", "application/x-protobuf")
      .send(Buffer.from([1, 2, 3]))
      .expect(401);

    const matching = await request(server)
      .get(`/api/teams/${teamId}/logs`)
      .query({ query: '{service="web", route="checkout"} |= "Error 404"' })
      .set("authorization", ownerAuthorization)
      .expect(200);
    expect(matching.body.entries).toEqual([
      expect.objectContaining({
        level: "error",
        message: "Error 404 - Failed to load",
        labels: { route: "checkout", service: "web" },
        attributes: { status: 404 },
      }),
    ]);
    const all = await request(server)
      .get(`/api/teams/${teamId}/logs`)
      .query({ limit: 3 })
      .set("authorization", ownerAuthorization)
      .expect(200);
    expect(all.body.entries).toHaveLength(3);
    expect(all.body.nextCursor).toEqual(expect.any(String));
    const older = await request(server)
      .get(`/api/teams/${teamId}/logs`)
      .query({ limit: 10, cursor: all.body.nextCursor })
      .set("authorization", ownerAuthorization)
      .expect(200);
    expect(older.body.entries).toHaveLength(3);

    const volume = await request(server)
      .get(`/api/teams/${teamId}/logs/volume`)
      .query({ query: '{level=~"error|warn"}' })
      .set("authorization", ownerAuthorization)
      .expect(200);
    expect(volume.body).toMatchObject({ total: 3, levels: { error: 2, warn: 1 } });
    const labels = await request(server)
      .get(`/api/teams/${teamId}/logs/labels`)
      .set("authorization", ownerAuthorization)
      .expect(200);
    expect(labels.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "service", values: [{ value: "web", streams: 4 }] }),
      ])
    );
    const context = await request(server)
      .get(`/api/teams/${teamId}/logs/entries/${matching.body.entries[0].id}/context`)
      .set("authorization", ownerAuthorization)
      .expect(200);
    expect(context.body.before.map((entry: { message: string }) => entry.message)).toEqual([
      "GET /checkout 200",
    ]);
    await request(server)
      .get(`/api/teams/${teamId}/logs`)
      .query({ query: '|~ "(unclosed"' })
      .set("authorization", ownerAuthorization)
      .expect(400);

    const byField = await request(server)
      .get(`/api/teams/${teamId}/logs`)
      .query({ query: "| status >= 400" })
      .set("authorization", ownerAuthorization)
      .expect(200);
    expect(byField.body.entries.map((entry: { message: string }) => entry.message)).toEqual([
      "Error 404 - Failed to load",
    ]);
    expect(byField.body.entries[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:]{8}\.\d{6}Z$/);
    const patterns = await request(server)
      .get(`/api/teams/${teamId}/logs/patterns`)
      .set("authorization", ownerAuthorization)
      .expect(200);
    expect(patterns.body.patterns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pattern: "Error <_> - Failed to load", count: 1 }),
      ])
    );
    const fields = await request(server)
      .get(`/api/teams/${teamId}/logs/fields`)
      .set("authorization", ownerAuthorization)
      .expect(200);
    expect(fields.body.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "status",
          numeric: true,
          values: [{ value: "404", count: 1 }],
        }),
      ])
    );

    const lokiProtobuf = snappyLiteral(
      protobufMessage(
        1,
        protobufText(1, '{job="promtail"}'),
        protobufMessage(
          2,
          protobufMessage(
            1,
            protobufInteger(1, BigInt(Math.floor(now / 1_000))),
            protobufInteger(2, 5)
          ),
          protobufText(2, "shipped by promtail")
        )
      )
    );
    await request(server)
      .post("/api/loki/api/v1/push")
      .set("authorization", ingest)
      .set("content-type", "application/x-protobuf")
      .send(Buffer.from(lokiProtobuf))
      .expect(204);
    const otlpProtobuf = protobufMessage(
      1,
      protobufMessage(
        1,
        protobufMessage(
          1,
          protobufText(1, "service.name"),
          protobufMessage(2, protobufText(1, "worker"))
        )
      ),
      protobufMessage(
        2,
        protobufMessage(
          2,
          protobufText(3, "WARN"),
          protobufMessage(5, protobufText(1, "queue is backing up"))
        )
      )
    );
    const otlpResponse = await request(server)
      .post("/api/otlp/v1/logs")
      .set("authorization", ingest)
      .set("content-type", "application/x-protobuf")
      .send(Buffer.from(otlpProtobuf))
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(otlpResponse.headers["content-type"]).toContain("application/x-protobuf");
    expect(otlpResponse.body).toHaveLength(0);
    const worker = await request(server)
      .get(`/api/teams/${teamId}/logs`)
      .query({ query: '{service_name="worker", level="warn"}' })
      .set("authorization", ownerAuthorization)
      .expect(200);
    expect(worker.body.entries.map((entry: { message: string }) => entry.message)).toEqual([
      "queue is backing up",
    ]);
    const lokiRetry = {
      streams: [
        {
          stream: { job: "nginx", level: "warn" },
          values: [[`${BigInt(now) * 1_000_000n}`, "upstream response is slow"]],
        },
      ],
    };
    await request(server)
      .post("/api/loki/api/v1/push")
      .set("authorization", ingest)
      .send(lokiRetry)
      .expect(204);
    const partial = await request(server)
      .post("/api/logs/push")
      .set("authorization", ingest)
      .send([{ message: "kept line" }, { message: "bad time", timestamp: "never" }])
      .expect(202);
    expect(partial.body).toMatchObject({
      accepted: 1,
      rejected: 1,
      errors: [{ index: 1, reason: "The timestamp must be ISO 8601 or a Unix epoch number" }],
    });
    const rejectedAll = await request(server)
      .post("/api/logs/push")
      .set("authorization", ingest)
      .send({ message: "too old", timestamp: "2020-01-01T00:00:00Z" })
      .expect(400);
    expect(rejectedAll.body).toMatchObject({ accepted: 0, rejected: 1 });
    await request(server)
      .post("/api/logs/push")
      .set("authorization", ingest)
      .set("content-type", "application/x-ndjson")
      .send('{"message":"ndjson line","level":"warn"}\nraw ndjson fallback\n')
      .expect(202);
    const viaUrl = await request(server)
      .post(`/api/logs/push/${source.body.token}`)
      .send({ message: "token in the address" })
      .expect(202);
    expect(viaUrl.body.accepted).toBe(1);
    const tested = await request(server)
      .post(`/api/teams/${teamId}/logs/sources/${source.body.source.id}/test`)
      .set("authorization", ownerAuthorization)
      .expect(200);
    expect(tested.body).toMatchObject({
      accepted24h: expect.any(Number),
      rejected24h: 3,
      lastError: "1 of 1 entries rejected: The timestamp is older than the 14-day retention",
    });
    const dedupCount = await database.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM log_entries WHERE team_id = ? AND message = ?",
      teamId,
      "upstream response is slow"
    );
    expect(dedupCount?.count).toBe(1);
    const limited = await request(server)
      .post("/api/logs/push")
      .set("authorization", ingest)
      .send(Array.from({ length: 150 }, (_, index) => ({ message: `burst ${index}` })))
      .expect(429);
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);

    await request(server)
      .post(`/api/teams/${teamId}/logs/alerts`)
      .set("authorization", ownerAuthorization)
      .send({
        name: "Broken",
        query: '|~ "[a-"',
        windowSeconds: 300,
        comparison: "atLeast",
        threshold: 1,
        impact: "major",
      })
      .expect(400);
    const preview = await request(server)
      .post(`/api/teams/${teamId}/logs/alerts/preview`)
      .set("authorization", ownerAuthorization)
      .send({
        query: '|= "Error 404 - Failed to load"',
        windowSeconds: 300,
        comparison: "atLeast",
        threshold: 1,
      })
      .expect(200);
    expect(preview.body).toMatchObject({ matchCount: 1, conditionMet: true });
    const rule = await request(server)
      .post(`/api/teams/${teamId}/logs/alerts`)
      .set("authorization", ownerAuthorization)
      .send({
        name: "Failed loads",
        query: '|= "Error 404 - Failed to load"',
        windowSeconds: 300,
        comparison: "atLeast",
        threshold: 1,
        impact: "critical",
      })
      .expect(201);
    await app.get(LogAlertsService).evaluate(teamId);
    const rules = await request(server)
      .get(`/api/teams/${teamId}/logs/alerts`)
      .set("authorization", ownerAuthorization)
      .expect(200);
    expect(rules.body[0]).toMatchObject({
      id: rule.body.id,
      state: "firing",
      lastMatchCount: 1,
      openIncidentId: expect.any(String),
    });
    const incidents = await request(server)
      .get(`/api/teams/${teamId}/incidents?status=active`)
      .set("authorization", ownerAuthorization)
      .expect(200);
    expect(incidents.body).toEqual([
      expect.objectContaining({
        logAlertRuleId: rule.body.id,
        logAlertRuleName: "Failed loads",
        impact: "critical",
        title: "Failed loads",
      }),
    ]);
    expect(incidents.body[0].updates[0].message).toContain("Error 404 - Failed to load");

    const stored = (await database.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM log_entries WHERE team_id = ?",
      teamId
    ))!.count;
    expect(stored).toBe(13);
    await request(server)
      .patch(`/api/admin/teams/${teamId}/logs`)
      .set("authorization", admin)
      .send({ enabled: false })
      .expect(200);
    await request(server)
      .patch(`/api/admin/teams/${teamId}/logs`)
      .set("authorization", admin)
      .send({ enabled: true })
      .expect(200);
    const kept = await request(server)
      .get(`/api/teams/${teamId}/logs`)
      .set("authorization", ownerAuthorization)
      .expect(200);
    expect(kept.body.entries).toHaveLength(stored);

    const turnedOff = await request(server)
      .patch(`/api/admin/teams/${teamId}/logs`)
      .set("authorization", admin)
      .send({ enabled: false })
      .expect(200);
    const deletionAt = new Date(turnedOff.body.logsDeletionScheduledAt).getTime();
    expect(deletionAt - Date.now()).toBeGreaterThan(13.9 * 86_400_000);
    expect(deletionAt - Date.now()).toBeLessThanOrEqual(14 * 86_400_000);
    await request(server)
      .get(`/api/teams/${teamId}/logs/alerts`)
      .set("authorization", ownerAuthorization)
      .expect(403);
    await request(server)
      .post("/api/logs/push")
      .set("authorization", ingest)
      .send({ message: "after disable" })
      .expect(403);
    const resolved = await request(server)
      .get(`/api/teams/${teamId}/incidents?status=active`)
      .set("authorization", ownerAuthorization)
      .expect(200);
    expect(resolved.body).toEqual([]);

    const retention = app.get(LogRetentionService);
    await retention.prune(new Date(Date.now() + 13 * 86_400_000));
    const beforeDeadline = await database.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM log_entries WHERE team_id = ?",
      teamId
    );
    expect(beforeDeadline?.count).toBe(stored);
    await retention.prune(new Date(Date.now() + 15 * 86_400_000));
    const afterDeadline = await database.get<{ entries: number; streams: number }>(
      `SELECT (SELECT COUNT(*) FROM log_entries WHERE team_id = ?) AS entries,
       (SELECT COUNT(*) FROM log_streams WHERE team_id = ?) AS streams`,
      teamId,
      teamId
    );
    expect(afterDeadline).toEqual({ entries: 0, streams: 0 });
    const purged = await request(server)
      .get(`/api/admin/teams?search=${teamId}`)
      .set("authorization", admin)
      .expect(200);
    expect(purged.body.teams[0]).toMatchObject({
      logsEnabled: false,
      logsDeletionScheduledAt: null,
      lastLogAt: null,
    });
  });

  it("searches literal text, serves volume from rollups, and saves team searches", async () => {
    const server = app.getHttpServer();
    const database = app.get(DatabaseService);
    const suffix = randomUUID().slice(0, 8);
    const owner = await register(`search-owner-${suffix}@example.com`, "Search owner");
    const administratorEmail = `search-admin-${suffix}@example.com`;
    const administrator = await register(administratorEmail, "Search administrator");
    await seedGlobalAdministrator(database, administrator.user.id, { NODE_ENV: "development" });
    const adminSession = await signIn(app, administratorEmail, "SecurePassword123");
    const teamId = owner.teams[0]!.id;
    const authorization = `Bearer ${owner.accessToken}`;
    await request(server)
      .patch(`/api/admin/teams/${teamId}/logs`)
      .set("authorization", `Bearer ${adminSession.accessToken}`)
      .send({ enabled: true })
      .expect(200);
    const source = await request(server)
      .post(`/api/teams/${teamId}/logs/sources`)
      .set("authorization", authorization)
      .send({ name: "Search" })
      .expect(201);
    const now = Date.now();
    const literal = [
      "progress 100% done",
      "progress 100x done",
      "file a_b.txt",
      "file axb.txt",
      "C:\\temp\\report",
    ];
    const batch = {
      labels: { service: "search" },
      entries: [
        ...literal.map((message, index) => ({
          message,
          level: "info",
          timestamp: new Date(now - (index + 1) * 60_000).toISOString(),
        })),
        ...Array.from({ length: 40 }, (_, index) => ({
          message: `older line ${index}`,
          level: index % 2 ? "error" : "info",
          timestamp: new Date(now - 3 * 3_600_000 - index * 120_000).toISOString(),
        })),
      ],
    };
    const ingest = `Bearer ${source.body.token}`;
    await request(server)
      .post("/api/logs/push")
      .set("authorization", ingest)
      .send(batch)
      .expect(202);
    const repeated = await request(server)
      .post("/api/logs/push")
      .set("authorization", ingest)
      .send(batch)
      .expect(202);
    expect(repeated.body).toMatchObject({ accepted: 0, duplicates: 45 });

    const range = {
      from: new Date(now - 86_400_000).toISOString(),
      to: new Date(now + 60_000).toISOString(),
    };
    const find = async (query: string) =>
      (
        await request(server)
          .get(`/api/teams/${teamId}/logs`)
          .query({ query, ...range })
          .set("authorization", authorization)
          .expect(200)
      ).body.entries.map((entry: { message: string }) => entry.message);
    expect(await find('|= "100%"')).toEqual(["progress 100% done"]);
    expect(await find('|= "a_b"')).toEqual(["file a_b.txt"]);
    expect(await find('|= "C:\\\\temp"')).toEqual(["C:\\temp\\report"]);
    expect(await find('|~ "(?i)PROGRESS 100. DONE"')).toEqual([
      "progress 100% done",
      "progress 100x done",
    ]);
    expect(await find('{service="missing"}')).toEqual([]);

    const volume = async (query: string) =>
      (
        await request(server)
          .get(`/api/teams/${teamId}/logs/volume`)
          .query({ query, ...range })
          .set("authorization", authorization)
          .expect(200)
      ).body as {
        stepSeconds: number;
        total: number;
        levels: object;
        buckets: Array<{ total: number }>;
      };
    const rolledUp = await volume('{service="search"}');
    const counted = await volume('{service="search"} |= ""');
    expect(rolledUp.stepSeconds).toBe(900);
    expect(rolledUp.total).toBe(45);
    expect(rolledUp.levels).toEqual({ info: 25, error: 20 });
    expect(rolledUp.buckets.map((bucket) => bucket.total)).toEqual(
      counted.buckets.map((bucket) => bucket.total)
    );
    const rollups = await database.get<{ total: number }>(
      "SELECT SUM(entries) AS total FROM log_volume WHERE team_id = ? AND resolution_seconds = 3600",
      teamId
    );
    expect(rollups?.total).toBe(45);

    const searches = `/api/teams/${teamId}/logs/searches`;
    const saved = await request(server)
      .post(searches)
      .set("authorization", authorization)
      .send({ name: "Percent", query: '|= "100%"' })
      .expect(201);
    expect(saved.body).toMatchObject({
      name: "Percent",
      query: '|= "100%"',
      createdByName: "Search owner",
    });
    await request(server)
      .post(searches)
      .set("authorization", authorization)
      .send({ name: "percent", query: "{}" })
      .expect(409);
    await request(server)
      .post(searches)
      .set("authorization", authorization)
      .send({ name: "Broken", query: '|~ "(unclosed"' })
      .expect(400);
    const listed = await request(server)
      .get(searches)
      .set("authorization", authorization)
      .expect(200);
    expect(listed.body.map((search: { name: string }) => search.name)).toEqual(["Percent"]);
    await request(server)
      .delete(`${searches}/${saved.body.id}`)
      .set("authorization", authorization)
      .expect(204);
    await request(server)
      .delete(`${searches}/${saved.body.id}`)
      .set("authorization", authorization)
      .expect(404);
  });
});

function varint(value: bigint | number): number[] {
  let remaining = BigInt(value);
  const bytes: number[] = [];
  do {
    let byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining) byte |= 0x80;
    bytes.push(byte);
  } while (remaining);
  return bytes;
}

function concat(...parts: Array<number[] | Uint8Array>): Uint8Array {
  return Uint8Array.from(parts.flatMap((part) => [...part]));
}

function protobufMessage(field: number, ...content: Array<number[] | Uint8Array>): Uint8Array {
  const body = concat(...content);
  return concat(varint(field * 8 + 2), varint(body.length), body);
}

function protobufText(field: number, value: string): Uint8Array {
  return protobufMessage(field, new TextEncoder().encode(value));
}

function protobufInteger(field: number, value: bigint | number): Uint8Array {
  return concat(varint(field * 8), varint(value));
}

function snappyLiteral(data: Uint8Array): Uint8Array {
  const chunks: number[][] = [];
  for (let offset = 0; offset < data.length; offset += 60) {
    const chunk = data.subarray(offset, offset + 60);
    chunks.push([(chunk.length - 1) << 2, ...chunk]);
  }
  return concat(varint(data.length), ...chunks);
}
