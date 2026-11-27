import type { INestApplication } from "@nestjs/common";
import type { PersonalDataExport } from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseService } from "../src/database/database.service.js";
import { registerAccount } from "./fixtures/two-factor.js";

const databaseConfigured = [
  "MIMORII_DB_HOST",
  "MIMORII_DB_PORT",
  "MIMORII_DB_NAME",
  "MIMORII_DB_USER",
  "MIMORII_DB_PASSWORD",
].every((name) => Boolean(process.env[name]));

describe.skipIf(!databaseConfigured)("Personal data", () => {
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

  it("exports personal data and deletes the account with its solo teams", async () => {
    const server = app.getHttpServer();
    const database = app.get(DatabaseService);
    const suffix = randomUUID().slice(0, 8);
    const ownerEmail = `account-owner-${suffix}@example.com`;
    const owner = await registerAccount(app, {
      name: "Account Owner",
      email: ownerEmail,
      password: "SecurePassword123",
    });
    const colleague = await registerAccount(app, {
      name: "Colleague",
      email: `account-colleague-${suffix}@example.com`,
      password: "SecurePassword123",
    });
    const ownerAuthorization = `Bearer ${owner.accessToken}`;
    const sharedTeamId = owner.teams[0]!.id;
    const soloTeam = await request(server)
      .post("/api/teams")
      .set("authorization", ownerAuthorization)
      .send({ name: "Solo" })
      .expect(201);

    const exported = await request(server)
      .get("/api/auth/account/export")
      .set("authorization", ownerAuthorization)
      .expect(200);
    expect(exported.headers["content-disposition"]).toContain("mimorii-personal-data.json");
    const data = exported.body as PersonalDataExport;
    expect(data.profile).toMatchObject({ name: "Account Owner", email: ownerEmail });
    expect(data.teams.map((team) => team.role)).toEqual(["owner", "owner"]);
    expect(JSON.stringify(data)).not.toContain("password");

    await request(server)
      .delete("/api/auth/account")
      .set("authorization", ownerAuthorization)
      .send({ password: "WrongPassword123" })
      .expect(401);

    await database.run(
      "INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)",
      sharedTeamId,
      colleague.user.id,
      new Date().toISOString()
    );
    const refused = await request(server)
      .delete("/api/auth/account")
      .set("authorization", ownerAuthorization)
      .send({ password: "SecurePassword123" })
      .expect(409);
    expect(refused.body.message).toContain("Make another member an owner");

    await database.run(
      "UPDATE team_members SET role = 'owner' WHERE team_id = ? AND user_id = ?",
      sharedTeamId,
      colleague.user.id
    );
    await request(server)
      .delete("/api/auth/account")
      .set("authorization", ownerAuthorization)
      .send({ password: "SecurePassword123" })
      .expect(204);

    expect(await database.get("SELECT id FROM users WHERE id = ?", owner.user.id)).toBeUndefined();
    expect(
      await database.get("SELECT id FROM teams WHERE id = ?", soloTeam.body.id)
    ).toBeUndefined();
    expect(
      await database.get<{ created_by: string | null }>(
        "SELECT created_by FROM teams WHERE id = ?",
        sharedTeamId
      )
    ).toEqual({ created_by: null });
    await request(server)
      .post("/api/auth/login")
      .send({ email: ownerEmail, password: "SecurePassword123" })
      .expect(401);
  });
});
