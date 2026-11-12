import { describe, expect, it } from "vitest";
import { statusBadgeSvg } from "./status-badge.js";

describe("status badge", () => {
  it("renders the page state with its color and accessible label", () => {
    const operational = statusBadgeSvg("operational");
    expect(operational).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(operational).toContain('aria-label="status: operational"');
    expect(operational).toContain("#2f9e6e");
    const outage = statusBadgeSvg("outage");
    expect(outage).toContain("<title>status: outage</title>");
    expect(outage).toContain("#d64045");
    expect(Number(/width="(\d+)"/.exec(outage)![1])).toBeLessThan(
      Number(/width="(\d+)"/.exec(operational)![1])
    );
  });
});
