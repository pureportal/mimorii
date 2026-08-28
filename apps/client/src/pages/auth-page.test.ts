import { describe, expect, it } from "vitest";
import { authReturnPath } from "./auth-page";

describe("authentication return paths", () => {
  it("keeps OAuth consent query parameters on local return paths", () => {
    expect(
      authReturnPath({
        from: "/oauth/authorize?client_id=https%3A%2F%2Fclient.example%2Fmetadata.json",
      })
    ).toBe("/oauth/authorize?client_id=https%3A%2F%2Fclient.example%2Fmetadata.json");
  });

  it("rejects network paths, backslash paths, and non-string state", () => {
    expect(authReturnPath({ from: "//attacker.example" })).toBe("/app");
    expect(authReturnPath({ from: "/\\attacker.example" })).toBe("/app");
    expect(authReturnPath({ from: "https://attacker.example" })).toBe("/app");
    expect(authReturnPath(null)).toBe("/app");
  });
});
