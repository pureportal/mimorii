import { BadRequestException } from "@nestjs/common";
import { httpMethods } from "@mimorii/contracts";
import { describe, expect, it } from "vitest";
import { CheckConfigService } from "../src/checks/check-config.service.js";

describe("check configuration", () => {
  const service = new CheckConfigService();

  it("normalizes safe HTTP defaults", () => {
    expect(service.validate("http", { target: { url: "https://example.com/status" } })).toEqual({
      target: { url: "https://example.com/status", method: "GET" },
      expectedStatuses: [200],
      followRedirects: false,
      validateTls: true,
    });
  });

  it("accepts supported HTTP methods", () => {
    for (const method of httpMethods) {
      expect(
        service.validate("http", { target: { url: "https://example.com/", method } })
      ).toMatchObject({
        target: { method },
      });
    }
  });

  it("rejects unsupported HTTP methods", () => {
    expect(() =>
      service.validate("http", {
        target: { url: "https://example.com/", method: "TRACE" },
      })
    ).toThrow(BadRequestException);
  });

  it("rejects embedded HTTP credentials", () => {
    expect(() =>
      service.validate("http", {
        target: { url: "https://user:secret@example.com/" },
      })
    ).toThrow(BadRequestException);
    expect(() =>
      service.validate("http", {
        target: {
          url: "https://example.com/",
          headers: { authorization: "Bearer plaintext" },
        },
      })
    ).toThrow(BadRequestException);
    expect(
      service.validate("http", {
        target: { url: "https://example.com/", secretHeaderName: "Authorization" },
      })
    ).toMatchObject({ target: { secretHeaderName: "authorization" } });
  });

  it("validates resource thresholds", () => {
    expect(() =>
      service.validate("host", {
        storage: [{ mount: "/", warningPercent: 101 }],
      })
    ).toThrow(BadRequestException);
  });

  it("normalizes full HTTP assertions", () => {
    expect(
      service.validate("http", {
        target: { url: "https://example.com/health" },
        expectedHeaders: { "Content-Type": "application/json" },
        jsonAssertions: {
          kind: "group",
          operator: "and",
          conditions: [
            {
              kind: "assertion",
              name: "Status",
              pointer: "/status",
              operator: "equals",
              expectedValue: "ok",
            },
            {
              kind: "group",
              operator: "or",
              conditions: [
                { kind: "assertion", name: "Primary", pointer: "/primary", operator: "exists" },
                { kind: "assertion", name: "Replica", pointer: "/replica", operator: "exists" },
              ],
            },
          ],
        },
        latencyWarningMs: 750,
        certificateWarningDays: 21,
      })
    ).toMatchObject({
      expectedHeaders: { "content-type": "application/json" },
      jsonAssertions: { operator: "and" },
      latencyWarningMs: 750,
      certificateWarningDays: 21,
    });
  });

  it("requires ordered warning and critical thresholds", () => {
    expect(() =>
      service.validate("host", {
        cpuWarningPercent: 95,
        cpuCriticalPercent: 90,
        storage: [{ mount: "/", warningPercent: 85, criticalPercent: 95 }],
      })
    ).toThrow(BadRequestException);
    expect(
      service.validate("host", { storage: [{ mount: "/", warningPercent: 90 }] })
    ).toMatchObject({
      storage: [{ mount: "/", warningPercent: 90, criticalPercent: 95 }],
    });
  });

  it("supports multiple unique storage mounts and optional load monitoring", () => {
    expect(
      service.validate("host", {
        storage: [
          { mount: "C:", warningPercent: 80, criticalPercent: 95 },
          { mount: "D:", warningPercent: 85, criticalPercent: 97 },
        ],
      })
    ).toMatchObject({
      storage: [
        { mount: "C:", warningPercent: 80, criticalPercent: 95 },
        { mount: "D:", warningPercent: 85, criticalPercent: 97 },
      ],
    });
    expect(() =>
      service.validate("host", {
        storage: [
          { mount: "C:", warningPercent: 80, criticalPercent: 95 },
          { mount: "c:\\", warningPercent: 85, criticalPercent: 97 },
        ],
      })
    ).toThrow("Storage mounts must be unique");
    expect(() =>
      service.validate("host", {
        storage: [
          { mount: "\\\\Server\\Data", warningPercent: 80, criticalPercent: 95 },
          { mount: "//server/data/", warningPercent: 85, criticalPercent: 97 },
        ],
      })
    ).toThrow("Storage mounts must be unique");
  });

  it("normalizes ICMP, WAN, Docker, and database configurations", () => {
    expect(
      service.validate("icmp", { target: { host: "Example.COM" }, packetCount: 4 })
    ).toMatchObject({
      target: { host: "example.com" },
      packetCount: 4,
      minimumSuccessPercent: 100,
    });
    expect(
      service.validate("wan", {
        targets: [
          { name: "Primary", host: "1.1.1.1" },
          { name: "Secondary", host: "8.8.8.8" },
        ],
        requiredSuccessfulTargets: 1,
      })
    ).toMatchObject({ requiredSuccessfulTargets: 1, packetCount: 2 });
    expect(service.validate("docker", {})).toMatchObject({
      requireHealthy: true,
      requireRunning: true,
      maximumRestarts: 3,
    });
    expect(
      service.validate("database", {
        target: {
          engine: "postgresql",
          host: "DB.EXAMPLE.COM",
          database: "app",
          username: "monitor",
          tls: true,
        },
      })
    ).toMatchObject({
      target: { host: "db.example.com", port: 5432, tls: true },
      connectionWarningPercent: 85,
    });
  });

  it("accepts unresolved internal domains while rejecting malformed hosts", () => {
    expect(
      service.validate("http", {
        target: { url: "http://private-service.internal/health" },
      })
    ).toMatchObject({ target: { url: "http://private-service.internal/health" } });
    expect(
      service.validate("dns", {
        target: { hostname: "_postgresql._tcp.database.internal." },
        recordType: "SRV",
      })
    ).toMatchObject({ target: { hostname: "_postgresql._tcp.database.internal" } });

    for (const [type, config] of [
      ["tcp", { target: { host: "not a host", port: 443 } }],
      ["icmp", { target: { host: "-invalid.internal" } }],
      ["database", { target: { engine: "redis", host: "invalid..internal" } }],
    ] as const) {
      expect(() => service.validate(type, config)).toThrow(BadRequestException);
    }
  });

  it("rejects impossible WAN requirements and mutating database statements", () => {
    expect(() =>
      service.validate("wan", {
        targets: [{ name: "Primary", host: "1.1.1.1" }],
        requiredSuccessfulTargets: 2,
      })
    ).toThrow(BadRequestException);
    expect(() =>
      service.validate("database", {
        target: {
          engine: "postgresql",
          host: "db.example.com",
          database: "app",
          username: "monitor",
          tls: true,
        },
        query: { statement: "DELETE FROM users" },
      })
    ).toThrow(BadRequestException);
    expect(() =>
      service.validate("database", {
        target: {
          engine: "redis",
          host: "cache.example.com",
          database: "sessions",
          tls: true,
        },
      })
    ).toThrow(BadRequestException);
  });
});
