import { describe, expect, it } from "vitest";
import {
  assertSafeSeedCredentials,
  globalAdminSeedEnabled,
} from "../src/database/seed/global-admin.js";

describe("Global Administrator seeding", () => {
  it("enables the development seed and keeps production opt-in", () => {
    expect(globalAdminSeedEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(globalAdminSeedEnabled({ NODE_ENV: "production" })).toBe(false);
  });

  it("requires explicit production credentials before granting access", () => {
    expect(() =>
      globalAdminSeedEnabled({
        NODE_ENV: "production",
        MIMORII_SEED_GLOBAL_ADMIN: "true",
      })
    ).toThrow(/requires MIMORII_SEED_EMAIL and MIMORII_SEED_PASSWORD/);
    expect(
      globalAdminSeedEnabled({
        NODE_ENV: "production",
        MIMORII_SEED_GLOBAL_ADMIN: "true",
        MIMORII_SEED_EMAIL: "administrator@example.com",
        MIMORII_SEED_PASSWORD: "ConfiguredAtDeployment123",
      })
    ).toBe(true);
  });

  it("prevents known default credentials in every production seed", () => {
    expect(() => assertSafeSeedCredentials({ NODE_ENV: "production" })).toThrow(
      /requires MIMORII_SEED_EMAIL and MIMORII_SEED_PASSWORD/
    );
    expect(() =>
      assertSafeSeedCredentials({
        NODE_ENV: "production",
        MIMORII_SEED_EMAIL: "administrator@example.com",
        MIMORII_SEED_PASSWORD: "ConfiguredAtDeployment123",
      })
    ).not.toThrow();
    expect(() =>
      assertSafeSeedCredentials({
        NODE_ENV: "production",
        MIMORII_SEED_EMAIL: "administrator@example.com",
        MIMORII_SEED_PASSWORD: "weak-password",
      })
    ).toThrow(/password policy/);
  });

  it("rejects invalid configuration", () => {
    expect(() => globalAdminSeedEnabled({ MIMORII_SEED_GLOBAL_ADMIN: "sometimes" })).toThrow(
      /must be true or false/
    );
  });
});
