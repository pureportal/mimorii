import type { CheckResult } from "@mimorii/contracts";
import { describe, expect, it } from "vitest";
import { createCheckMetricSeries } from "./resource-detail-page";

describe("resource check metric history", () => {
  it("keeps every observed metric in chronological result order", () => {
    const results: CheckResult[] = [
      result("2026-08-23T10:00:00.000Z", {
        connectionUtilizationPercent: 20,
        version: "17.6",
      }),
      result("2026-08-23T10:01:00.000Z", {
        connectionUtilizationPercent: 25,
        slowQueries: 1,
      }),
    ];

    expect(createCheckMetricSeries(results)).toEqual([
      {
        metric: "connectionUtilizationPercent",
        points: [
          { observedAt: "2026-08-23T10:00:00.000Z", value: 20 },
          { observedAt: "2026-08-23T10:01:00.000Z", value: 25 },
        ],
      },
      {
        metric: "slowQueries",
        points: [{ observedAt: "2026-08-23T10:01:00.000Z", value: 1 }],
      },
      {
        metric: "version",
        points: [{ observedAt: "2026-08-23T10:00:00.000Z", value: "17.6" }],
      },
    ]);
  });
});

function result(
  checkedAt: string,
  metrics: Record<string, number | string | boolean | null>
): CheckResult {
  return {
    id: checkedAt,
    checkId: "check-1",
    status: "up",
    latencyMs: 10,
    statusCode: null,
    message: null,
    metrics,
    checkedAt,
  };
}
