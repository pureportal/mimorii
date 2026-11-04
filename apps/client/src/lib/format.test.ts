import { describe, expect, it } from "vitest";
import { formatCount, formatInitials, formatPercent } from "./format";

describe("formatPercent", () => {
  it("keeps service-level precision below 100 percent", () => {
    expect(formatPercent(99.95)).toBe("99.950%");
    expect(formatPercent(42.31)).toBe("42.3%");
  });

  it("shows full availability without trailing zeros", () => {
    expect(formatPercent(100)).toBe("100%");
  });
});

describe("formatInitials", () => {
  it("uses the first letter of the first two words", () => {
    expect(formatInitials("Leo Martins")).toBe("LM");
    expect(formatInitials("Mimorii Owner's team")).toBe("MO");
  });

  it("uses the first two letters of a single word", () => {
    expect(formatInitials("operations")).toBe("OP");
  });
});

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
