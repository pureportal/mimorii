import { describe, expect, it } from "vitest";
import { TargetSafetyService, UnsafeTargetException } from "./target-safety.service.js";

describe("target safety", () => {
  const targets = new TargetSafetyService();

  it("allows a public push endpoint address", async () => {
    await expect(targets.resolveStrictPublicHost("8.8.8.8")).resolves.toEqual([
      { address: "8.8.8.8", family: 4 },
    ]);
  });

  it("rejects private, loopback, and local push endpoint addresses", async () => {
    await expect(targets.resolveStrictPublicHost("127.0.0.1")).rejects.toBeInstanceOf(
      UnsafeTargetException
    );
    await expect(targets.resolveStrictPublicHost("10.0.0.1")).rejects.toBeInstanceOf(
      UnsafeTargetException
    );
    await expect(targets.resolveStrictPublicHost("localhost")).rejects.toBeInstanceOf(
      UnsafeTargetException
    );
  });
});
