import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { CheckConfigService } from "../src/checks/check-config.service.js";

describe("check configuration", () => {
  const service = new CheckConfigService();

  it("normalizes safe HTTP defaults", () => {
    expect(service.validate("http", { url: "https://example.com/status" })).toEqual({
      url: "https://example.com/status",
      method: "GET",
      expectedStatuses: [200],
      followRedirects: false,
      validateTls: true,
    });
  });

  it("rejects active HTTP methods and embedded credentials", () => {
    expect(() =>
      service.validate("http", {
        url: "https://user:secret@example.com/",
        method: "POST",
      })
    ).toThrow(BadRequestException);
  });

  it("validates resource thresholds", () => {
    expect(() => service.validate("disk", { mount: "/", warningPercent: 101 })).toThrow(
      BadRequestException
    );
  });

  it("normalizes full HTTP assertions", () => {
    expect(
      service.validate("http", {
        url: "https://example.com/health",
        expectedHeaders: { "Content-Type": "application/json" },
        jsonPointer: "/status",
        expectedJsonValue: "ok",
        latencyWarningMs: 750,
        certificateWarningDays: 21,
      })
    ).toMatchObject({
      expectedHeaders: { "content-type": "application/json" },
      jsonPointer: "/status",
      expectedJsonValue: "ok",
      latencyWarningMs: 750,
      certificateWarningDays: 21,
    });
  });

  it("requires ordered warning and critical thresholds", () => {
    expect(() =>
      service.validate("host", {
        cpuWarningPercent: 95,
        cpuCriticalPercent: 90,
      })
    ).toThrow(BadRequestException);
    expect(service.validate("disk", { mount: "/", warningPercent: 90 })).toMatchObject({
      warningPercent: 90,
      criticalPercent: 95,
    });
  });
});
