import type { INestApplication } from "@nestjs/common";
import type {
  AuthSession,
  RecoveryCodes,
  SignInChallenge,
  TwoFactorReplacement,
} from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/common/crypto.js";
import { DatabaseService } from "../src/database/database.service.js";
import { seedGlobalAdministrator } from "../src/database/seed/global-admin.js";
import {
  authenticatorCode,
  authenticatorSecret,
  decodeBase32,
  enrollAuthenticator,
  registerAccount,
  signIn,
} from "./fixtures/two-factor.js";

const password = "SecurePassword123";
const databaseConfigured = [
  "MIMORII_DB_HOST",
  "MIMORII_DB_PORT",
  "MIMORII_DB_NAME",
  "MIMORII_DB_USER",
  "MIMORII_DB_PASSWORD",
].every((name) => Boolean(process.env[name]));

function email(label: string): string {
  return `two-factor-${label}-${randomUUID().slice(0, 8)}@example.com`;
}

describe.skipIf(!databaseConfigured)("Two-factor authentication", () => {
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

  async function login(address: string): Promise<SignInChallenge> {
    const response = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: address, password })
      .expect(200);
    return response.body as SignInChallenge;
  }

  function verify(challengeToken: string, code: string) {
    return request(app.getHttpServer())
      .post("/api/auth/two-factor/verify")
      .send({ challengeToken, code });
  }

  it("requires authenticator enrollment before registration issues a session", async () => {
    const address = email("register");
    const registration = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ name: "Enrolling user", email: address, password, acceptedTerms: true })
      .expect(201);
    const challenge = registration.body as SignInChallenge;
    expect(registration.headers["cache-control"]).toContain("no-store");
    expect(challenge).toMatchObject({
      purpose: "enrollment",
      challengeToken: expect.stringMatching(/^mim_tfc_/),
      setup: { secret: expect.stringMatching(/^[A-Z2-7]{32}$/) },
    });
    expect(registration.body).not.toHaveProperty("accessToken");
    if (challenge.purpose !== "enrollment") throw new Error("Enrollment expected");
    expect(challenge.setup.uri).toContain(`secret=${challenge.setup.secret}`);

    await request(app.getHttpServer())
      .post("/api/auth/two-factor/enroll")
      .send({ challengeToken: challenge.challengeToken, code: "000000" })
      .expect(403);
    const enrollment = await enrollAuthenticator(app, challenge, address);
    expect(enrollment.recoveryCodes).toHaveLength(10);
    expect(enrollment.session.user.email).toBe(address);

    await request(app.getHttpServer())
      .post("/api/auth/two-factor/enroll")
      .send({
        challengeToken: challenge.challengeToken,
        code: authenticatorCode(decodeBase32(challenge.setup.secret)),
      })
      .expect(410);

    const status = await request(app.getHttpServer())
      .get("/api/auth/two-factor")
      .set("authorization", `Bearer ${enrollment.session.accessToken}`)
      .expect(200);
    expect(status.body).toEqual({ recoveryCodesRemaining: 10 });
  });

  it("sends existing users without two-factor authentication through enrollment", async () => {
    const address = email("legacy");
    const database = app.get(DatabaseService);
    const userId = randomUUID();
    const now = new Date().toISOString();
    await database.run(
      `INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      userId,
      address,
      "Existing user",
      await hashPassword(password),
      now,
      now
    );

    const challenge = await login(address);
    expect(challenge.purpose).toBe("enrollment");
    const enrollment = await enrollAuthenticator(app, challenge, address);
    expect(enrollment.session.user.id).toBe(userId);
    expect((await login(address)).purpose).toBe("sign-in");
  });

  it("verifies each authenticator code only once", async () => {
    const address = email("verify");
    await registerAccount(app, { name: "Verifying user", email: address, password });
    const secret = authenticatorSecret(address);

    const challenge = await login(address);
    expect(challenge).toMatchObject({ purpose: "sign-in" });
    expect(challenge).not.toHaveProperty("setup");
    await verify(challenge.challengeToken, "not-a-code").expect(403);
    const code = authenticatorCode(secret, 1);
    const session = await verify(challenge.challengeToken, code).expect(200);
    expect((session.body as AuthSession).user.email).toBe(address);
    await verify(challenge.challengeToken, code).expect(410);

    const replay = await login(address);
    await verify(replay.challengeToken, code)
      .expect(403)
      .expect(({ body }) => expect(body.message).toBe("Code is incorrect"));
  });

  it("keeps the scanned enrollment secret valid after incorrect codes", async () => {
    const address = email("retry");
    const registration = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ name: "Retrying user", email: address, password, acceptedTerms: true })
      .expect(201);
    const challenge = registration.body as SignInChallenge;
    const enroll = (code: string) =>
      request(app.getHttpServer())
        .post("/api/auth/two-factor/enroll")
        .send({ challengeToken: challenge.challengeToken, code });

    for (let attempt = 1; attempt <= 6; attempt += 1) await enroll("000000").expect(403);
    if (challenge.purpose !== "enrollment") throw new Error("Enrollment expected");
    await enroll(authenticatorCode(decodeBase32(challenge.setup.secret))).expect(200);
  });

  it("locks verification after repeated failures across challenges", async () => {
    const address = email("lockout");
    await registerAccount(app, { name: "Locked user", email: address, password });

    for (let attempt = 1; attempt < 5; attempt += 1) {
      const challenge = await login(address);
      await verify(challenge.challengeToken, "000000").expect(403);
    }
    const final = await login(address);
    await verify(final.challengeToken, "000000").expect(429);
    await verify(final.challengeToken, authenticatorCode(authenticatorSecret(address)))
      .expect(429)
      .expect(({ body }) => expect(body.message).toContain("Try again in 1 minute"));
  });

  it("signs in once with each recovery code and regenerates codes after step-up", async () => {
    const address = email("recovery");
    const challenge = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ name: "Recovering user", email: address, password, acceptedTerms: true })
      .expect(201);
    const { recoveryCodes, session } = await enrollAuthenticator(app, challenge.body, address);
    const recoveryCode = recoveryCodes[0]!.toUpperCase().replace("-", " ");

    const first = await login(address);
    await verify(first.challengeToken, recoveryCode).expect(200);
    const second = await login(address);
    await verify(second.challengeToken, recoveryCode).expect(403);

    const authorization = `Bearer ${session.accessToken}`;
    await request(app.getHttpServer())
      .get("/api/auth/two-factor")
      .set("authorization", authorization)
      .expect(200)
      .expect(({ body }) => expect(body.recoveryCodesRemaining).toBe(9));

    await request(app.getHttpServer())
      .post("/api/auth/two-factor/recovery-codes")
      .set("authorization", authorization)
      .send({ password: "WrongPassword123", code: recoveryCodes[1] })
      .expect(403)
      .expect(({ body }) => expect(body.message).toBe("Password is incorrect"));
    const regenerated = await request(app.getHttpServer())
      .post("/api/auth/two-factor/recovery-codes")
      .set("authorization", authorization)
      .send({ password, code: recoveryCodes[1] })
      .expect(200);
    const fresh = (regenerated.body as RecoveryCodes).recoveryCodes;
    expect(fresh).toHaveLength(10);
    expect(fresh).not.toContain(recoveryCodes[2]);

    const stale = await login(address);
    await verify(stale.challengeToken, recoveryCodes[2]!).expect(403);
    await verify(stale.challengeToken, fresh[0]!).expect(200);
  });

  it("replaces the authenticator after step-up verification", async () => {
    const address = email("replace");
    const session = await registerAccount(app, {
      name: "Replacing user",
      email: address,
      password,
    });
    const authorization = `Bearer ${session.accessToken}`;
    const oldSecret = authenticatorSecret(address);
    const otherDevice = await signIn(app, address, password);

    const started = await request(app.getHttpServer())
      .post("/api/auth/two-factor/replacement")
      .set("authorization", authorization)
      .send({ password, code: authenticatorCode(oldSecret, 1) })
      .expect(200);
    const replacement = started.body as TwoFactorReplacement;
    const newSecret = decodeBase32(replacement.setup.secret);
    expect(newSecret.equals(oldSecret)).toBe(false);

    await request(app.getHttpServer())
      .post("/api/auth/two-factor/replacement/confirm")
      .set("authorization", authorization)
      .send({ challengeToken: replacement.challengeToken, code: "000000" })
      .expect(403);
    await request(app.getHttpServer())
      .post("/api/auth/two-factor/replacement/confirm")
      .set("authorization", authorization)
      .send({ challengeToken: replacement.challengeToken, code: authenticatorCode(newSecret) })
      .expect(204);
    await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("authorization", authorization)
      .expect(200);
    await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("authorization", `Bearer ${otherDevice.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .send({ refreshToken: otherDevice.refreshToken })
      .expect(401);

    const oldCode = await login(address);
    await verify(oldCode.challengeToken, authenticatorCode(oldSecret, -1)).expect(403);
    const newCode = await login(address);
    await verify(newCode.challengeToken, authenticatorCode(newSecret, 1)).expect(200);
  });

  it("lets Global Administrators reset another user's two-factor authentication", async () => {
    const administratorEmail = email("admin");
    const targetEmail = email("target");
    const administrator = await registerAccount(app, {
      name: "Administrator",
      email: administratorEmail,
      password,
    });
    const target = await registerAccount(app, { name: "Target", email: targetEmail, password });
    const database = app.get(DatabaseService);
    await seedGlobalAdministrator(database, administrator.user.id, { NODE_ENV: "development" });
    const adminSession = await signIn(app, administratorEmail, password);
    const adminAuthorization = `Bearer ${adminSession.accessToken}`;
    const targetToken = await request(app.getHttpServer())
      .post("/api/auth/api-tokens")
      .set("authorization", `Bearer ${target.accessToken}`)
      .send({
        name: "Target automation",
        access: "read",
        teams: [{ teamId: target.teams[0]!.id, role: "viewer" }],
        expiresInDays: 30,
      })
      .expect(201);
    const tokenAuthorization = `Bearer ${targetToken.body.token}`;
    await request(app.getHttpServer())
      .get(`/api/teams/${target.teams[0]!.id}/resources`)
      .set("authorization", tokenAuthorization)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/admin/users?search=${encodeURIComponent(targetEmail)}`)
      .set("authorization", adminAuthorization)
      .expect(200)
      .expect(({ body }) => expect(body.users[0].twoFactorEnabledAt).toEqual(expect.any(String)));
    await request(app.getHttpServer())
      .delete(`/api/admin/users/${adminSession.user.id}/two-factor`)
      .set("authorization", adminAuthorization)
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/admin/users/${target.user.id}/two-factor`)
      .set("authorization", `Bearer ${target.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/admin/users/${target.user.id}/two-factor`)
      .set("authorization", adminAuthorization)
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/api/admin/users/${target.user.id}/two-factor`)
      .set("authorization", adminAuthorization)
      .expect(400);

    await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("authorization", `Bearer ${target.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .send({ refreshToken: target.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/teams/${target.teams[0]!.id}/resources`)
      .set("authorization", tokenAuthorization)
      .expect(403)
      .expect(({ body }) => expect(body.message).toContain("two-factor authentication"));
    const audit = await database.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM audit_events
       WHERE action = 'global_admin.user_two_factor_reset' AND subject_id = ?`,
      target.user.id
    );
    expect(audit?.count).toBe(1);

    const challenge = await login(targetEmail);
    expect(challenge.purpose).toBe("enrollment");
    await enrollAuthenticator(app, challenge, targetEmail);
    await request(app.getHttpServer())
      .get(`/api/teams/${target.teams[0]!.id}/resources`)
      .set("authorization", tokenAuthorization)
      .expect(200);
  });
});
