import { describe, expect, it } from "vitest";
import { createRecoveryCodes, normalizeRecoveryCode } from "./recovery-codes.js";

describe("recovery codes", () => {
  it("creates ten distinct grouped codes", () => {
    const codes = createRecoveryCodes();

    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9a-hjkmnp-tv-z]{5}-[0-9a-hjkmnp-tv-z]{5}$/);
      expect(normalizeRecoveryCode(code)).toBe(code.replace("-", ""));
    }
  });

  it("tolerates case, spacing, and commonly confused characters", () => {
    expect(normalizeRecoveryCode(" AB3C0-9XYZ1 ")).toBe("ab3c09xyz1");
    expect(normalizeRecoveryCode("ab3co 9xyzl")).toBe("ab3c09xyz1");
    expect(normalizeRecoveryCode("AB3CO-9XYZI")).toBe("ab3c09xyz1");
  });

  it("rejects values that cannot be recovery codes", () => {
    expect(normalizeRecoveryCode("123456")).toBeNull();
    expect(normalizeRecoveryCode("ab3c0-9xyzu")).toBeNull();
    expect(normalizeRecoveryCode("ab3c0-9xyz12")).toBeNull();
  });
});
