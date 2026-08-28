import { describe, expect, it } from "vitest";
import { readBearerToken } from "./bearer-token.js";

describe("bearer token parsing", () => {
  it("accepts a single case-insensitive Bearer credential", () => {
    expect(readBearerToken(request("bearer\tcredential"))).toBe("credential");
  });

  it("rejects empty, comma-joined, and multi-part credentials", () => {
    expect(readBearerToken(request(undefined))).toBeUndefined();
    expect(readBearerToken(request("Bearer"))).toBeUndefined();
    expect(readBearerToken(request("Bearer first, Bearer second"))).toBeUndefined();
    expect(readBearerToken(request("Bearer first second"))).toBeUndefined();
  });
});

function request(authorization: string | undefined) {
  return { headers: { authorization } };
}
