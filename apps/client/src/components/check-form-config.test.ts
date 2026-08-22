import { describe, expect, it } from "vitest";
import { buildCheckConfig, checkFields } from "./check-form-config";

describe("check form configuration", () => {
  it("round-trips HTTP assertions", () => {
    const fields = checkFields({
      url: "https://example.com/health",
      method: "PUT",
      expectedStatuses: [200, 204],
      expectedHeaders: { "content-type": "application/json" },
      jsonPointer: "/status",
      expectedJsonValue: true,
      latencyWarningMs: 750,
      certificateWarningDays: 21,
      followRedirects: true,
      validateTls: true,
    });
    expect(buildCheckConfig("http", fields)).toMatchObject({
      method: "PUT",
      expectedStatuses: [200, 204],
      expectedHeaders: { "content-type": "application/json" },
      jsonPointer: "/status",
      expectedJsonValue: true,
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
