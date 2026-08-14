import type { NotificationConditionGroup } from "@mimorii/contracts";
import { describe, expect, it } from "vitest";
import {
  evaluateNotificationConditionGroup,
  validateNotificationConditionGroup,
} from "./notification-rules.js";

describe("notification rules", () => {
  const nestedRule: NotificationConditionGroup = {
    kind: "group",
    operator: "and",
    conditions: [
      { kind: "condition", field: "severity", operator: "equals", value: "warning" },
      {
        kind: "group",
        operator: "or",
        conditions: [
          { kind: "condition", field: "checkType", operator: "equals", value: "disk" },
          {
            kind: "condition",
            field: "metrics.usedPercent",
            operator: "greaterThanOrEqual",
            value: 80,
          },
        ],
      },
    ],
  };

  it("evaluates nested AND and OR groups", () => {
    expect(
      evaluateNotificationConditionGroup(nestedRule, {
        severity: "warning",
        checkType: "host",
        metrics: { usedPercent: 84 },
      })
    ).toBe(true);
    expect(
      evaluateNotificationConditionGroup(nestedRule, {
        severity: "info",
        checkType: "disk",
        metrics: { usedPercent: 90 },
      })
    ).toBe(false);
  });

  it("supports case-insensitive membership and existence checks", () => {
    const rule: NotificationConditionGroup = {
      kind: "group",
      operator: "and",
      conditions: [
        { kind: "condition", field: "resourceTags", operator: "contains", value: "PRODUCTION" },
        { kind: "condition", field: "statusCode", operator: "exists" },
      ],
    };
    expect(
      evaluateNotificationConditionGroup(rule, {
        resourceTags: ["production", "api"],
        statusCode: null,
      })
    ).toBe(true);
  });

  it("does not read inherited object properties", () => {
    expect(
      evaluateNotificationConditionGroup(
        {
          kind: "group",
          operator: "and",
          conditions: [{ kind: "condition", field: "toString", operator: "exists" }],
        },
        {}
      )
    ).toBe(false);
  });

  it("matches an empty group", () => {
    expect(
      evaluateNotificationConditionGroup({ kind: "group", operator: "and", conditions: [] }, {})
    ).toBe(true);
    expect(
      evaluateNotificationConditionGroup({ kind: "group", operator: "or", conditions: [] }, {})
    ).toBe(false);
  });

  it("rejects unsafe fields and invalid comparison values", () => {
    expect(() =>
      validateNotificationConditionGroup({
        kind: "group",
        operator: "and",
        conditions: [
          { kind: "condition", field: "__proto__.value", operator: "equals", value: "x" },
        ],
      })
    ).toThrow("field is invalid");
    expect(() =>
      validateNotificationConditionGroup({
        kind: "group",
        operator: "and",
        conditions: [
          { kind: "condition", field: "metrics.usedPercent", operator: "greaterThan", value: "80" },
        ],
      })
    ).toThrow("requires a number");
    expect(() =>
      validateNotificationConditionGroup({
        kind: "group",
        operator: "and",
        conditions: [{ kind: "condition", field: "status", operator: "equals", value: ["down"] }],
      })
    ).toThrow("requires a single value");
  });
});
