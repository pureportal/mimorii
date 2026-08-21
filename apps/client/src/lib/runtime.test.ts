import { describe, expect, it } from "vitest";
import { runtimeFromAndroidProduct, startupPath } from "./runtime";

describe("application runtime", () => {
  it("starts the Android client at authentication", () => {
    expect(startupPath(runtimeFromAndroidProduct("client"))).toBe("/login");
  });

  it("keeps the Android agent in its dedicated experience", () => {
    expect(runtimeFromAndroidProduct("agent")).toBe("android-agent");
  });

  it("keeps the website landing route", () => {
    expect(startupPath(runtimeFromAndroidProduct(undefined))).toBe("/");
  });
});
