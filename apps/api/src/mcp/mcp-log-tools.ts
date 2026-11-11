import {
  appRoutes,
  incidentImpacts,
  logAlertComparisons,
  logAlertPendingSeconds,
  logAlertWindowSeconds,
  logQueryLimits,
  type LogEntry,
} from "@mimorii/contracts";
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { LogAlertsService } from "../logs/log-alerts.service.js";
import type { LogInsightsService } from "../logs/log-insights.service.js";
import type { LogsQueryService } from "../logs/logs-query.service.js";
import {
  executeMutation,
  executeTool,
  notifyingMutationAnnotations,
  readOnlyAnnotations,
} from "./mcp-tool-helpers.js";

export interface McpLogToolServices {
  logs: Pick<LogsQueryService, "entries" | "volume" | "labels" | "context">;
  logInsights: Pick<LogInsightsService, "patterns" | "fields">;
  logAlerts: Pick<LogAlertsService, "list" | "preview" | "create">;
}

export const logWriteToolNames = ["create_log_alert_rule"] as const;

const querySyntax =
  'Query syntax: an optional stream selector {label="value", label!="value", label=~"regex", label!~"regex"} ' +
  '(the pseudo-label level filters by log level, e.g. {level=~"error|fatal"}), then line filters ' +
  '|= "text", != "text", |~ "regex", !~ "regex" (prefix a regex with (?i) for case-insensitive matching), ' +
  'then field filters on structured attributes such as | status >= 500 or | route = "/checkout". ' +
  'Example: {service="web", level="error"} |~ "(?i)timeout" | status >= 500. An empty query matches every line.';
const teamOnlyNote = "Only teams where a global administrator enabled logs can be queried.";
const messageLimit = 2_000;
const identifier = z.uuid();
const timestamp = z.iso.datetime({ offset: true });
const query = z.string().max(logQueryLimits.queryLength).default("").describe(querySyntax);
const range = {
  from: timestamp.optional().describe("Start of the time range; defaults to one hour before to"),
  to: timestamp.optional().describe("End of the time range; defaults to now"),
};

export function registerMcpLogTools(
  server: McpServer,
  userId: string,
  scopes: readonly string[],
  services: McpLogToolServices
): void {
  server.registerTool(
    "search_logs",
    {
      title: "Search logs",
      description: `Search a team's log lines, newest first by default. Use this to read what an application logged. ${teamOnlyNote}`,
      inputSchema: z
        .object({
          teamId: identifier,
          query,
          ...range,
          limit: z.number().int().min(1).max(200).default(50),
          direction: z.enum(["backward", "forward"]).default("backward"),
          cursor: z.string().max(80).optional().describe("nextCursor from a previous call"),
        })
        .strict(),
      annotations: readOnlyAnnotations,
    },
    ({ teamId, query: text, from, to, limit, direction, cursor }) =>
      executeTool(async () => {
        const result = await services.logs.entries(userId, teamId, {
          query: text,
          from,
          to,
          limit,
          direction,
          cursor,
        });
        return {
          lines: result.entries.map(compactEntry),
          nextCursor: result.nextCursor,
          explorePath: explorePath(text, from, to),
        };
      })
  );

  server.registerTool(
    "get_log_volume",
    {
      title: "Get log volume",
      description: `Count matching log lines by level over time. Use this to spot spikes before reading lines. ${teamOnlyNote}`,
      inputSchema: z.object({ teamId: identifier, query, ...range }).strict(),
      annotations: readOnlyAnnotations,
    },
    ({ teamId, query: text, from, to }) =>
      executeTool(async () => {
        const volume = await services.logs.volume(userId, teamId, { query: text, from, to });
        return {
          ...volume,
          buckets: volume.buckets.filter((bucket) => bucket.total > 0),
          busiest: volume.buckets
            .toSorted((left, right) => right.total - left.total)
            .slice(0, 5)
            .filter((bucket) => bucket.total > 0),
        };
      })
  );

  server.registerTool(
    "get_log_patterns",
    {
      title: "Get log patterns",
      description: `Group recent matching lines into templates (variable parts shown as <_>) with counts, levels, and first and last occurrence. Use this to summarize what is happening or which errors dominate. ${teamOnlyNote}`,
      inputSchema: z
        .object({
          teamId: identifier,
          query,
          ...range,
          limit: z.number().int().min(1).max(50).default(20),
        })
        .strict(),
      annotations: readOnlyAnnotations,
    },
    ({ teamId, query: text, from, to, limit }) =>
      executeTool(() =>
        services.logInsights.patterns(userId, teamId, { query: text, from, to, limit })
      )
  );

  server.registerTool(
    "list_log_labels",
    {
      title: "List log labels",
      description: `List stream labels and their values, such as service or env, to build queries. ${teamOnlyNote}`,
      inputSchema: z.object({ teamId: identifier, ...range }).strict(),
      annotations: readOnlyAnnotations,
    },
    ({ teamId, from, to }) =>
      executeTool(async () => ({
        labels: (await services.logs.labels(userId, teamId, { from, to })).map((label) => ({
          ...label,
          values: label.values.slice(0, 30),
        })),
      }))
  );

  server.registerTool(
    "list_log_fields",
    {
      title: "List log fields",
      description: `List structured fields found in recent matching lines with their most common values, for field filters such as | status >= 500. ${teamOnlyNote}`,
      inputSchema: z.object({ teamId: identifier, query, ...range }).strict(),
      annotations: readOnlyAnnotations,
    },
    ({ teamId, query: text, from, to }) =>
      executeTool(() => services.logInsights.fields(userId, teamId, { query: text, from, to }))
  );

  server.registerTool(
    "get_log_context",
    {
      title: "Get log context",
      description: "Get the lines logged before and after one log line from the same stream.",
      inputSchema: z
        .object({
          teamId: identifier,
          entryId: z.string().regex(/^\d{1,18}$/),
          limit: z.number().int().min(1).max(50).default(15),
        })
        .strict(),
      annotations: readOnlyAnnotations,
    },
    ({ teamId, entryId, limit }) =>
      executeTool(async () => {
        const context = await services.logs.context(userId, teamId, entryId, limit);
        return {
          before: context.before.map(compactEntry),
          line: compactEntry(context.entry),
          after: context.after.map(compactEntry),
        };
      })
  );

  server.registerTool(
    "list_log_alert_rules",
    {
      title: "List log alert rules",
      description: `List log alert rules with their state (normal, pending, firing, paused), last match count, and open incident. ${teamOnlyNote}`,
      inputSchema: z.object({ teamId: identifier }).strict(),
      annotations: readOnlyAnnotations,
    },
    ({ teamId }) =>
      executeTool(async () => ({ rules: await services.logAlerts.list(userId, teamId) }))
  );

  const condition = {
    query: z.string().min(1).max(logQueryLimits.queryLength).describe(querySyntax),
    windowSeconds: z.literal(logAlertWindowSeconds).describe("Time window in seconds"),
    comparison: z
      .enum(logAlertComparisons)
      .describe(
        "atLeast fires when matches reach the threshold; below fires when they drop under it"
      ),
    threshold: z.number().int().min(1).max(100_000),
  };

  server.registerTool(
    "test_log_alert_rule",
    {
      title: "Test log alert rule",
      description:
        "Count how many lines match a proposed alert condition right now, with sample lines.",
      inputSchema: z.object({ teamId: identifier, ...condition }).strict(),
      annotations: readOnlyAnnotations,
    },
    ({ teamId, ...input }) =>
      executeTool(async () => {
        const preview = await services.logAlerts.preview(userId, teamId, input);
        return { ...preview, samples: preview.samples.map(compactEntry) };
      })
  );

  server.registerTool(
    "create_log_alert_rule",
    {
      title: "Create log alert rule",
      description:
        "Create a rule that opens an incident and notifies the team when the condition is met. Test it with test_log_alert_rule first.",
      inputSchema: z
        .object({
          teamId: identifier,
          name: z.string().trim().min(1).max(100),
          ...condition,
          impact: z.enum(incidentImpacts).default("major"),
          pendingSeconds: z
            .literal(logAlertPendingSeconds)
            .default(0)
            .describe("How long the condition must hold before an incident opens"),
          resourceId: identifier.optional(),
          autoResolve: z.boolean().default(true),
        })
        .strict(),
      annotations: notifyingMutationAnnotations,
    },
    ({ teamId, ...input }) =>
      executeMutation(scopes, () => services.logAlerts.create(userId, teamId, input))
  );
}

function compactEntry(entry: LogEntry) {
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    level: entry.level,
    labels: entry.labels,
    message:
      entry.message.length > messageLimit
        ? `${entry.message.slice(0, messageLimit)}…`
        : entry.message,
    attributes: entry.attributes,
  };
}

function explorePath(query: string, from: string | undefined, to: string | undefined): string {
  const parameters = new URLSearchParams({
    from: from ?? "now-1h",
    to: to ?? "now",
  });
  if (query) parameters.set("query", query);
  return `${appRoutes.logs}?${parameters}`;
}
