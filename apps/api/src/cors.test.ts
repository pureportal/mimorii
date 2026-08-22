import { describe, expect, it } from "vitest";
import { allowedCorsMethods, defaultCorsOrigins } from "./cors.js";

describe("CORS configuration", () => {
  it("allows Android clients to persist tour progress", () => {
    expect(allowedCorsMethods).toContain("PUT");
    expect(defaultCorsOrigins).toEqual(
      expect.arrayContaining(["tauri://localhost", "http://tauri.localhost"])
    );
  });
});
