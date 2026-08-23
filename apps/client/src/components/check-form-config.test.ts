import { describe, expect, it } from "vitest";
import { buildCheckConfig, checkFields } from "./check-form-config";

describe("check form configuration", () => {
  it("round-trips HTTP assertions", () => {
    const fields = checkFields({
      target: { url: "https://example.com/health", method: "PUT" },
      expectedStatuses: [200, 204],
      expectedHeaders: { "content-type": "application/json" },
      jsonAssertions: {
        kind: "group",
        operator: "and",
        conditions: [
          {
            kind: "assertion",
            name: "Status",
            pointer: "/status",
            operator: "equals",
            expectedValue: true,
          },
          {
            kind: "group",
            operator: "or",
            conditions: [
              {
                kind: "assertion",
                name: "Primary",
                pointer: "/primary",
                operator: "exists",
              },
            ],
          },
        ],
      },
      latencyWarningMs: 750,
      certificateWarningDays: 21,
      followRedirects: true,
      validateTls: true,
    });
    expect(buildCheckConfig("http", fields)).toMatchObject({
      target: { url: "https://example.com/health", method: "PUT" },
      expectedStatuses: [200, 204],
      expectedHeaders: { "content-type": "application/json" },
      jsonAssertions: {
        operator: "and",
        conditions: [
          { name: "Status", pointer: "/status", expectedValue: true },
          { operator: "or", conditions: [{ name: "Primary", pointer: "/primary" }] },
        ],
      },
      latencyWarningMs: 750,
      certificateWarningDays: 21,
    });
  });

  it("builds host warning and critical thresholds", () => {
    expect(buildCheckConfig("host", checkFields(undefined))).toEqual({
      cpuWarningPercent: 90,
      cpuCriticalPercent: 98,
      memoryWarningPercent: 90,
      memoryCriticalPercent: 98,
      loadWarning: 4,
      loadCritical: 8,
      swapWarningPercent: 90,
      swapCriticalPercent: 98,
    });
  });
});
