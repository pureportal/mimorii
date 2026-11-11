import type { INestApplication } from "@nestjs/common";
import type { AuthSession, SignInChallenge, TwoFactorEnrollment } from "@mimorii/contracts";
import request from "supertest";
import { expect } from "vitest";
import { totpCode, totpStep } from "../../src/auth/totp.js";
import { DatabaseService } from "../../src/database/database.service.js";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const authenticatorSecrets = new Map<string, Buffer>();

export function decodeBase32(value: string): Buffer {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of value) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Secret is not Base32");
    buffer = ((buffer << 5) | index) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function authenticatorCode(secret: Buffer, offsetSteps = 0): string {
  return totpCode(secret, totpStep(Date.now()) + offsetSteps);
}

export function authenticatorSecret(email: string): Buffer {
  const secret = authenticatorSecrets.get(email.toLowerCase());
  if (!secret) throw new Error(`No authenticator is enrolled for ${email}`);
  return secret;
}

export async function enrollAuthenticator(
  app: INestApplication,
  challenge: SignInChallenge,
  email: string
): Promise<TwoFactorEnrollment> {
  if (challenge.purpose !== "enrollment") throw new Error("Challenge does not enroll");
  const secret = decodeBase32(challenge.setup.secret);
  const response = await request(app.getHttpServer())
    .post("/api/auth/two-factor/enroll")
    .send({ challengeToken: challenge.challengeToken, code: authenticatorCode(secret) });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  authenticatorSecrets.set(email.toLowerCase(), secret);
  return response.body as TwoFactorEnrollment;
}

export async function verifyAuthenticator(
  app: INestApplication,
  challenge: SignInChallenge,
  email: string
): Promise<AuthSession> {
  if (challenge.purpose !== "sign-in") throw new Error("Challenge does not verify");
  await allowAuthenticatorCodeReuse(app, email);
  const response = await request(app.getHttpServer())
    .post("/api/auth/two-factor/verify")
    .send({
      challengeToken: challenge.challengeToken,
      code: authenticatorCode(authenticatorSecret(email)),
    });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body as AuthSession;
}

export async function signIn(
  app: INestApplication,
  email: string,
  password: string
): Promise<AuthSession> {
  const response = await request(app.getHttpServer())
    .post("/api/auth/login")
    .send({ email, password });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  const challenge = response.body as SignInChallenge;
  return challenge.purpose === "enrollment"
    ? (await enrollAuthenticator(app, challenge, email)).session
    : verifyAuthenticator(app, challenge, email);
}

export async function registerAccount(
  app: INestApplication,
  input: { name: string; email: string; password: string }
): Promise<AuthSession> {
  const response = await request(app.getHttpServer())
    .post("/api/auth/register")
    .send({ ...input, acceptedTerms: true });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return (await enrollAuthenticator(app, response.body as SignInChallenge, input.email)).session;
}

async function allowAuthenticatorCodeReuse(app: INestApplication, email: string): Promise<void> {
  await app.get(DatabaseService).run(
    `UPDATE user_two_factor SET last_used_step = NULL
       WHERE user_id = (SELECT id FROM users WHERE email = ?)`,
    email.toLowerCase()
  );
}
