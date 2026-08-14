import {
  notificationConditionOperators,
  notificationEvents,
  type NotificationChannelSummary,
  type NotificationCondition,
  type NotificationConditionGroup,
  type NotificationConditionNode,
  type NotificationConditionOperator,
  type NotificationConditionValue,
  type NotificationEvent,
  type NotificationPolicySummary,
} from "@mimorii/contracts";
import { Plus, Route, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, jsonBody } from "../lib/api";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";
import { Field, FieldLabel } from "./ui/field";
import { Input, Select } from "./ui/input";

const defaultEvents: NotificationEvent[] = [
  "incident.opened",
  "incident.resolved",
  "check.degraded",
  "check.recovered",
];

const fields = [
  "severity",
  "impact",
  "status",
  "previousStatus",
  "source",
  "checkType",
  "resourceTags",
  "latencyMs",
  "statusCode",
  "metrics.usedPercent",
  "metrics.cpuPercent",
  "metrics.memoryPercent",
  "metrics.loadAverage",
  "metrics.swapPercent",
  "metrics.certificateDaysRemaining",
];

const eventLabels: Record<NotificationEvent, string> = {
  "incident.opened": "Incident opened",
  "incident.updated": "Incident updated",
  "incident.resolved": "Incident resolved",
  "check.degraded": "Check degraded",
  "check.recovered": "Check recovered",
  "maintenance.started": "Maintenance started",
  "maintenance.completed": "Maintenance completed",
  "slo.breached": "SLO breached",
};

export function NotificationPolicyDialog({
  open,
  onOpenChange,
  policy,
  channels,
  teamId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy: NotificationPolicySummary | null;
  channels: NotificationChannelSummary[];
  teamId: string;
  onSaved: () => Promise<void>;
}) {
  const [events, setEvents] = useState<NotificationEvent[]>(policy?.events ?? defaultEvents);
  const [condition, setCondition] = useState<NotificationConditionGroup>(
    policy?.condition ?? emptyGroup()
  );
  const [channelIds, setChannelIds] = useState<string[]>(
    policy?.channelIds ?? channels.map((channel) => channel.id)
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEvents(policy?.events ?? defaultEvents);
    setCondition(policy?.condition ?? emptyGroup());
    setChannelIds(policy?.channelIds ?? channels.map((channel) => channel.id));
  }, [channels, open, policy]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!events.length) {
      toast.error("Select at least one event");
      return;
    }
    if (!channelIds.length) {
      toast.error("Select at least one channel");
      return;
    }
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await api(`/teams/${teamId}/notifications/policies${policy ? `/${policy.id}` : ""}`, {
        method: policy ? "PATCH" : "POST",
        ...jsonBody({
          name: form.get("name"),
          events,
          condition,
          channelIds,
          enabled: form.get("enabled") === "on",
        }),
      });
      await onSaved();
      onOpenChange(false);
      toast.success(policy ? "Rule updated" : "Rule added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rule could not be saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader title={policy ? "Edit rule" : "Add rule"} />
        <form className="grid gap-4" onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor="policy-name">Name</FieldLabel>
            <Input
              id="policy-name"
              name="name"
              defaultValue={policy?.name}
              required
              maxLength={100}
            />
          </Field>
          <Field>
            <FieldLabel>Events</FieldLabel>
            <div className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-2">
              {notificationEvents.map((event) => (
                <Checkbox
                  key={event}
                  label={eventLabels[event]}
                  checked={events.includes(event)}
                  onChange={(checked) =>
                    setEvents(
                      checked ? [...events, event] : events.filter((value) => value !== event)
                    )
                  }
                />
              ))}
            </div>
          </Field>
          <details
            className="rounded-xl border border-line p-3"
            open={condition.conditions.length > 0 || undefined}
          >
            <summary className="text-sm font-semibold">Advanced conditions</summary>
            <div className="mt-3">
              <ConditionGroupEditor group={condition} onChange={setCondition} depth={0} />
            </div>
          </details>
          <Field>
            <FieldLabel>Channels</FieldLabel>
            <div className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-2">
              {channels.map((channel) => (
                <Checkbox
                  key={channel.id}
                  label={channel.name}
                  checked={channelIds.includes(channel.id)}
                  onChange={(checked) =>
                    setChannelIds(
                      checked
                        ? [...channelIds, channel.id]
                        : channelIds.filter((value) => value !== channel.id)
                    )
                  }
                />
              ))}
            </div>
          </Field>
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              name="enabled"
              type="checkbox"
              defaultChecked={policy?.enabled ?? true}
              className="size-4 accent-violet-strong"
            />
            Enabled
          </label>
          <datalist id="notification-condition-fields">
            {fields.map((field) => (
              <option key={field} value={field} />
            ))}
          </datalist>
          <Button type="submit" disabled={saving}>
            <Route /> {policy ? "Save rule" : "Add rule"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConditionGroupEditor({
  group,
  onChange,
  depth,
}: {
  group: NotificationConditionGroup;
  onChange: (group: NotificationConditionGroup) => void;
  depth: number;
}) {
  function replace(index: number, node: NotificationConditionNode) {
    onChange({
      ...group,
      conditions: group.conditions.map((condition, position) =>
        position === index ? node : condition
      ),
    });
  }

  return (
    <div className={depth ? "rounded-xl border border-line p-3" : ""}>
      <div className="flex items-center gap-2">
        <Select
          aria-label="Condition group operator"
          value={group.operator}
          onChange={(event) => onChange({ ...group, operator: event.target.value as "and" | "or" })}
          className="w-24"
        >
          <option value="and">AND</option>
          <option value="or">OR</option>
        </Select>
      </div>
      <div className="mt-3 grid gap-3">
        {group.conditions.map((node, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {node.kind === "group" ? (
                <ConditionGroupEditor
                  group={node}
                  onChange={(next) => replace(index, next)}
                  depth={depth + 1}
                />
              ) : (
                <ConditionEditor condition={node} onChange={(next) => replace(index, next)} />
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Remove condition"
              onClick={() =>
                onChange({
                  ...group,
                  conditions: group.conditions.filter((_, position) => position !== index),
                })
              }
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...group, conditions: [...group.conditions, newCondition()] })}
        >
          <Plus /> Condition
        </Button>
        {depth < 4 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange({ ...group, conditions: [...group.conditions, emptyGroup()] })}
          >
            <Plus /> Group
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ConditionEditor({
  condition,
  onChange,
}: {
  condition: NotificationCondition;
  onChange: (condition: NotificationCondition) => void;
}) {
  const numeric = new Set(["greaterThan", "greaterThanOrEqual", "lessThan", "lessThanOrEqual"]).has(
    condition.operator
  );
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_11rem_1fr]">
      <Input
        aria-label="Condition field"
        list="notification-condition-fields"
        value={condition.field}
        maxLength={100}
        onChange={(event) => onChange({ ...condition, field: event.target.value })}
      />
      <Select
        aria-label="Condition operator"
        value={condition.operator}
        onChange={(event) => {
          const operator = event.target.value as NotificationConditionOperator;
          onChange({
            ...condition,
            operator,
            ...(operator === "exists"
              ? { value: undefined }
              : { value: defaultValue(operator, condition.value) }),
          });
        }}
      >
        {notificationConditionOperators.map((operator) => (
          <option key={operator} value={operator}>
            {operatorLabel(operator)}
          </option>
        ))}
      </Select>
      {condition.operator !== "exists" ? (
        <Input
          aria-label="Condition value"
          type={numeric ? "number" : "text"}
          value={formatValue(condition.value)}
          onChange={(event) =>
            onChange({
              ...condition,
              value: parseValue(condition.operator, event.target.value),
            })
          }
        />
      ) : null}
    </div>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-violet-strong"
      />
      {label}
    </label>
  );
}

function emptyGroup(): NotificationConditionGroup {
  return { kind: "group", operator: "and", conditions: [] };
}

function newCondition(): NotificationCondition {
  return { kind: "condition", field: "severity", operator: "equals", value: "warning" };
}

function defaultValue(
  operator: NotificationConditionOperator,
  current: NotificationConditionValue | undefined
): NotificationConditionValue {
  if (operator === "in" || operator === "notIn") {
    return Array.isArray(current) ? current : current === undefined ? [] : [String(current)];
  }
  if (
    operator === "greaterThan" ||
    operator === "greaterThanOrEqual" ||
    operator === "lessThan" ||
    operator === "lessThanOrEqual"
  ) {
    return typeof current === "number" ? current : 0;
  }
  return Array.isArray(current) ? (current[0] ?? "") : (current ?? "");
}

function parseValue(
  operator: NotificationConditionOperator,
  value: string
): NotificationConditionValue {
  if (operator === "in" || operator === "notIn") {
    return value
      .split(",")
      .map((item) => scalar(item.trim()))
      .filter(
        (item): item is string | number => typeof item === "string" || typeof item === "number"
      );
  }
  if (
    operator === "greaterThan" ||
    operator === "greaterThanOrEqual" ||
    operator === "lessThan" ||
    operator === "lessThanOrEqual"
  ) {
    return Number(value);
  }
  return scalar(value);
}

function scalar(value: string): string | number | boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  return value;
}

function formatValue(value: NotificationConditionValue | undefined): string {
  return Array.isArray(value) ? value.join(", ") : value === null ? "null" : String(value ?? "");
}

function operatorLabel(operator: NotificationConditionOperator): string {
  return operator.replace(/[A-Z]/g, (letter) => ` ${letter.toLocaleLowerCase()}`);
}
