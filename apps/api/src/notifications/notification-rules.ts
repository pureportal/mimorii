import type {
  NotificationCondition,
  NotificationConditionGroup,
  NotificationConditionNode,
  NotificationConditionValue,
} from "@mimorii/contracts";

const blockedFields = new Set(["__proto__", "prototype", "constructor"]);
const fieldPattern = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/;
const operators = new Set([
  "equals",
  "notEquals",
  "in",
  "notIn",
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
  "contains",
  "exists",
]);

export function validateNotificationConditionGroup(
  value: unknown
): asserts value is NotificationConditionGroup {
  const state = { nodes: 0 };
  validateNode(value, 0, state);
  if (!isRecord(value) || value.kind !== "group") {
    throw new Error("The notification condition must be a group");
  }
}

export function evaluateNotificationConditionGroup(
  group: NotificationConditionGroup,
  context: Record<string, unknown>
): boolean {
  return evaluateNode(group, context);
}

function validateNode(value: unknown, depth: number, state: { nodes: number }): void {
  if (!isRecord(value)) throw new Error("A notification condition is invalid");
  state.nodes += 1;
  if (state.nodes > 50) throw new Error("Notification rules can contain up to 50 conditions");
  if (depth > 5) throw new Error("Notification conditions can be nested up to 5 levels");

  if (value.kind === "group") {
    if (value.operator !== "and" && value.operator !== "or") {
      throw new Error("A condition group operator is invalid");
    }
    if (!Array.isArray(value.conditions)) throw new Error("A condition group is invalid");
    for (const condition of value.conditions) validateNode(condition, depth + 1, state);
    return;
  }

  if (value.kind !== "condition") throw new Error("A notification condition is invalid");
  validateCondition(value);
}

function validateCondition(value: Record<string, unknown>): void {
  if (
    typeof value.field !== "string" ||
    value.field.length > 100 ||
    !fieldPattern.test(value.field) ||
    value.field.split(".").some((part) => blockedFields.has(part))
  ) {
    throw new Error("A notification condition field is invalid");
  }
  if (typeof value.operator !== "string" || !operators.has(value.operator)) {
    throw new Error("A notification condition operator is invalid");
  }
  if (value.operator === "exists") return;
  if (!("value" in value) || !isConditionValue(value.value)) {
    throw new Error("A notification condition value is invalid");
  }
  if ((value.operator === "in" || value.operator === "notIn") && !Array.isArray(value.value)) {
    throw new Error("The selected operator requires a list");
  }
  if (value.operator !== "in" && value.operator !== "notIn" && Array.isArray(value.value)) {
    throw new Error("The selected operator requires a single value");
  }
  if (
    new Set(["greaterThan", "greaterThanOrEqual", "lessThan", "lessThanOrEqual"]).has(
      value.operator
    ) &&
    typeof value.value !== "number"
  ) {
    throw new Error("The selected operator requires a number");
  }
}

function evaluateNode(node: NotificationConditionNode, context: Record<string, unknown>): boolean {
  if (node.kind === "condition") return evaluateCondition(node, context);
  if (node.conditions.length === 0) return node.operator === "and";
  return node.operator === "and"
    ? node.conditions.every((condition) => evaluateNode(condition, context))
    : node.conditions.some((condition) => evaluateNode(condition, context));
}

function evaluateCondition(
  condition: NotificationCondition,
  context: Record<string, unknown>
): boolean {
  const actual = readField(context, condition.field);
  if (condition.operator === "exists") return actual !== undefined;
  if (actual === undefined) return false;
  const expected = condition.value;

  switch (condition.operator) {
    case "equals":
      return equal(actual, expected);
    case "notEquals":
      return !equal(actual, expected);
    case "in":
      return Array.isArray(expected) && expected.some((value) => equal(actual, value));
    case "notIn":
      return Array.isArray(expected) && expected.every((value) => !equal(actual, value));
    case "greaterThan":
      return numeric(actual, expected, (left, right) => left > right);
    case "greaterThanOrEqual":
      return numeric(actual, expected, (left, right) => left >= right);
    case "lessThan":
      return numeric(actual, expected, (left, right) => left < right);
    case "lessThanOrEqual":
      return numeric(actual, expected, (left, right) => left <= right);
    case "contains":
      return contains(actual, expected);
  }
  return false;
}

function readField(context: Record<string, unknown>, field: string): unknown {
  let current: unknown = context;
  for (const segment of field.split(".")) {
    if (!isRecord(current) || !Object.hasOwn(current, segment)) return undefined;
    current = current[segment];
  }
  return current;
}

function equal(actual: unknown, expected: unknown): boolean {
  if (typeof actual === "string" && typeof expected === "string") {
    return actual.toLowerCase() === expected.toLowerCase();
  }
  return actual === expected;
}

function numeric(
  actual: unknown,
  expected: NotificationConditionValue | undefined,
  compare: (left: number, right: number) => boolean
): boolean {
  return typeof actual === "number" && typeof expected === "number" && compare(actual, expected);
}

function contains(actual: unknown, expected: NotificationConditionValue | undefined): boolean {
  if (Array.isArray(actual) && !Array.isArray(expected)) {
    return actual.some((value) => equal(value, expected));
  }
  return (
    typeof actual === "string" &&
    typeof expected === "string" &&
    actual.toLowerCase().includes(expected.toLowerCase())
  );
}

function isConditionValue(value: unknown): value is NotificationConditionValue {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= 500;
  return (
    Array.isArray(value) &&
    value.length <= 50 &&
    value.every(
      (item) =>
        (typeof item === "string" && item.length <= 500) ||
        (typeof item === "number" && Number.isFinite(item))
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
