import { describe, expect, it } from "vitest";
import { formatCount } from "./format";

describe("formatCount", () => {
  it("uses the singular label for one item", () => {
    expect(formatCount(1, "monitor")).toBe("1 monitor");
  });

  it("uses the plural label for other counts", () => {
    expect(formatCount(0, "monitor")).toBe("0 monitors");
    expect(formatCount(2, "monitor")).toBe("2 monitors");
  });

  it("supports irregular plurals", () => {
    expect(formatCount(2, "policy", "policies")).toBe("2 policies");
  });
});
