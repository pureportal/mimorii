import { describe, expect, it } from "vitest";
import { encodeBase32, matchTotpStep, totpCode, totpSetup, totpStep } from "./totp.js";

const rfcSecret = Buffer.from("12345678901234567890", "ascii");

describe("TOTP", () => {
  it.each([
    [59, "287082"],
    [1_111_111_109, "081804"],
    [1_111_111_111, "050471"],
    [1_234_567_890, "005924"],
    [2_000_000_000, "279037"],
    [20_000_000_000, "353130"],
  ])("matches the RFC 6238 SHA-1 vector at %i seconds", (seconds, code) => {
    expect(totpCode(rfcSecret, totpStep(seconds * 1_000))).toBe(code);
  });

  it("accepts one step of clock drift and rejects codes outside it", () => {
    const now = 1_234_567_890_000;
    const step = totpStep(now);

    expect(matchTotpStep(rfcSecret, totpCode(rfcSecret, step - 1), now, null)).toBe(step - 1);
    expect(matchTotpStep(rfcSecret, totpCode(rfcSecret, step + 1), now, null)).toBe(step + 1);
    expect(matchTotpStep(rfcSecret, totpCode(rfcSecret, step - 2), now, null)).toBeNull();
    expect(matchTotpStep(rfcSecret, totpCode(rfcSecret, step + 2), now, null)).toBeNull();
  });

  it("rejects codes from steps that were already used", () => {
    const now = 1_234_567_890_000;
    const step = totpStep(now);
    const code = totpCode(rfcSecret, step);

    expect(matchTotpStep(rfcSecret, code, now, step)).toBeNull();
    expect(matchTotpStep(rfcSecret, code, now, step - 1)).toBe(step);
  });

  it("encodes the secret for authenticator apps", () => {
    expect(encodeBase32(rfcSecret)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");

    const setup = totpSetup(rfcSecret, "aiko@example.com");
    const uri = new URL(setup.uri);
    expect(setup.secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(uri.protocol).toBe("otpauth:");
    expect(uri.host).toBe("totp");
    expect(decodeURIComponent(uri.pathname)).toBe("/Mimorii:aiko@example.com");
    expect(Object.fromEntries(uri.searchParams)).toEqual({
      secret: setup.secret,
      issuer: "Mimorii",
      algorithm: "SHA1",
      digits: "6",
      period: "30",
    });
  });
});
