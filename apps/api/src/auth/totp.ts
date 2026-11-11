import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const PERIOD_SECONDS = 30;
const DIGITS = 6;
const SECRET_BYTES = 20;
const ACCEPTED_STEP_DRIFT = 1;
const ISSUER = "Mimorii";
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const totpCodePattern = /^\d{6}$/;

export function createTotpSecret(): Buffer {
  return randomBytes(SECRET_BYTES);
}

export function totpCode(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", secret).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

export function totpStep(timeMilliseconds: number): number {
  return Math.floor(timeMilliseconds / 1_000 / PERIOD_SECONDS);
}

export function matchTotpStep(
  secret: Buffer,
  code: string,
  timeMilliseconds: number,
  lastUsedStep: number | null
): number | null {
  const submitted = Buffer.from(code);
  const currentStep = totpStep(timeMilliseconds);
  let matchedStep: number | null = null;
  for (let drift = -ACCEPTED_STEP_DRIFT; drift <= ACCEPTED_STEP_DRIFT; drift += 1) {
    const step = currentStep + drift;
    const expected = Buffer.from(totpCode(secret, step));
    const matches = expected.length === submitted.length && timingSafeEqual(expected, submitted);
    if (matches && (lastUsedStep === null || step > lastUsedStep)) matchedStep = step;
  }
  return matchedStep;
}

export function totpSetup(secret: Buffer, accountName: string): { secret: string; uri: string } {
  const encodedSecret = encodeBase32(secret);
  const parameters = new URLSearchParams({
    secret: encodedSecret,
    issuer: ISSUER,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  });
  const label = `${encodeURIComponent(ISSUER)}:${encodeURIComponent(accountName)}`;
  return { secret: encodedSecret, uri: `otpauth://totp/${label}?${parameters}` };
}

export function encodeBase32(bytes: Buffer): string {
  let output = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}
