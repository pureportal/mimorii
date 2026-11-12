import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseService } from "../src/database/database.service.js";
import { seedGlobalAdministrator } from "../src/database/seed/global-admin.js";
import {
  authenticatorCode,
  authenticatorSecret,
  registerAccount,
  signIn,
} from "./fixtures/two-factor.js";

const password = "SecurePassword123";
const newPassword = "NewSecurePassword456";
const databaseConfigured = [
  "MIMORII_DB_HOST",
  "MIMORII_DB_PORT",
  "MIMORII_DB_NAME",
  "MIMORII_DB_USER",
  "MIMORII_DB_PASSWORD",
].every((name) => Boolean(process.env[name]));

function email(label: string): string {
  return `password-reset-${label}-${randomUUID().slice(0, 8)}@example.com`;
}

describe.skipIf(!databaseConfigured)("Password reset", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.MIMORII_JWT_SECRET = "test-only-secret-with-at-least-thirty-two-characters";
    process.env.MIMORII_SCHEDULER_ENABLED = "false";
    process.env.MIMORII_RATE_LIMIT = "10000";
    process.env.MIMORII_PUBLIC_URL = "http://localhost:4310";
    process.env.MIMORII_SMTP_HOST = "";
    const { createApplication } = await import("../src/bootstrap.js");
    app = await createApplication();
    await app.init();
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
  }, 60_000);

  it("resets a password with an administrator link and the second factor", async () => {
    const server = app.getHttpServer();
    const database = app.get(DatabaseService);
    const userEmail = email("owner");
    const account = await registerAccount(app, { name: "Reset owner", email: userEmail, password });
    const administratorEmail = email("admin");
    const administrator = await registerAccount(app, {
      name: "Reset administrator",
      email: administratorEmail,
      password,
    });
    await seedGlobalAdministrator(database, administrator.user.id, { NODE_ENV: "development" });
    const admin = `Bearer ${(await signIn(app, administratorEmail, password)).accessToken}`;

    const unavailable = await request(server)
      .post("/api/auth/password-reset")
      .send({ email: userEmail })
      .expect(503);
    expect(unavailable.body.message).toContain("Ask an administrator");
    await request(server)
      .post(`/api/admin/users/${administrator.user.id}/password-reset`)
      .set("authorization", admin)
      .send({ sendEmail: false })
      .expect(403);
    await request(server)
      .post(`/api/admin/users/${account.user.id}/password-reset`)
      .set("authorization", admin)
      .send({ sendEmail: true })
      .expect(503);

    const issued = await request(server)
      .post(`/api/admin/users/${account.user.id}/password-reset`)
      .set("authorization", admin)
      .send({ sendEmail: false })
      .expect(200);
    expect(issued.body).toMatchObject({
      emailed: false,
      url: expect.stringMatching(/^http:\/\/localhost:4310\/reset-password#token=mim_pwr_/),
    });
    const token = new URL(issued.body.url).hash.slice("#token=".length);

    const inspected = await request(server)
      .post("/api/auth/password-reset/inspect")
      .send({ token })
      .expect(200);
    expect(inspected.body).toMatchObject({ email: userEmail, twoFactorRequired: true });
    await request(server)
      .post("/api/auth/password-reset/inspect")
      .send({ token: "mim_pwr_unknown-token-value-0000" })
      .expect(410);

    await request(server)
      .post("/api/auth/password-reset/complete")
      .send({ token, password: newPassword })
      .expect(400);
    await request(server)
      .post("/api/auth/password-reset/complete")
      .send({ token, password: newPassword, code: "000000" })
      .expect(403);
    await request(server)
      .post("/api/auth/password-reset/complete")
      .send({ token, password: "short" })
      .expect(400);

    await database.run(
      "UPDATE user_two_factor SET last_used_step = NULL WHERE user_id = ?",
      account.user.id
    );
    await request(server)
      .post("/api/auth/password-reset/complete")
      .send({
        token,
        password: newPassword,
        code: authenticatorCode(authenticatorSecret(userEmail)),
      })
      .expect(204);

    await request(server)
      .get("/api/auth/me")
      .set("authorization", `Bearer ${account.accessToken}`)
      .expect(401);
    await request(server)
      .post("/api/auth/password-reset/complete")
      .send({ token, password: newPassword, code: "123456" })
      .expect(410);
    await request(server).post("/api/auth/login").send({ email: userEmail, password }).expect(401);
    const session = await signIn(app, userEmail, newPassword);
    expect(session.user.email).toBe(userEmail);
  });
});
