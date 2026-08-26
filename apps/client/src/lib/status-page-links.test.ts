import { describe, expect, it } from "vitest";
import { statusPagePath } from "./status-page-links";

describe("status page links", () => {
  it("places the stable identifier before the human-readable slug", () => {
    expect(statusPagePath("page-1", "service health")).toBe("/status/page-1/service%20health");
  });
});
