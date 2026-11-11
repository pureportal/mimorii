import { formatLogQuery, parseLogQuery } from "@mimorii/contracts";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  logEntryConditions,
  logLevelConditions,
  logQueryRegexPatterns,
  logStreamConditions,
  logStreamMatchers,
  parseLogQueryInput,
  withLogQueryErrors,
} from "./log-query-sql.js";

describe("log queries", () => {
  it("parses selectors and line filters and formats them back", () => {
    const text = '{service="api", env!="dev", level=~"error|fatal"} |= "Error 404" != `timeout`';
    const query = parseLogQuery(text);

    expect(query).toEqual({
      matchers: [
        { label: "service", operator: "=", value: "api" },
        { label: "env", operator: "!=", value: "dev" },
        { label: "level", operator: "=~", value: "error|fatal" },
      ],
      filters: [
        { operator: "|=", value: "Error 404" },
        { operator: "!=", value: "timeout" },
      ],
      fields: [],
    });
    expect(parseLogQuery(formatLogQuery(query))).toEqual(query);
  });

  it("keeps regular expression escapes and handles empty queries", () => {
    expect(parseLogQuery('|~ "status=\\d{3}" |= "say \\"hi\\""').filters).toEqual([
      { operator: "|~", value: "status=\\d{3}" },
      { operator: "|=", value: 'say "hi"' },
    ]);
    expect(parseLogQuery("")).toEqual({ matchers: [], filters: [], fields: [] });
    expect(parseLogQuery("{}")).toEqual({ matchers: [], filters: [], fields: [] });
  });

  it("reports the position of syntax errors", () => {
    expect(() => parseLogQueryInput('{service="api"')).toThrow(
      new BadRequestException("Expected , or } at position 15")
    );
    expect(() => parseLogQueryInput("Error 404")).toThrow(BadRequestException);
    expect(() => parseLogQueryInput('{1abc="x"}')).toThrow(BadRequestException);
  });

  it("compiles stream matchers, levels, and line filters into parameterized conditions", () => {
    const query = parseLogQuery(
      '{service="api", env="", host=~"(?i)web-\\d+", level!="debug"} !~ "health" |= "100%_done\\\\"'
    );
    const streams = logStreamConditions(logStreamMatchers(query), "s.labels");

    expect(streams.clauses).toEqual([
      "s.labels @> ?::jsonb",
      "COALESCE(s.labels ->> ?, '') = ?",
      "COALESCE(s.labels ->> ?, '') ~ ?",
    ]);
    expect(streams.parameters).toEqual([
      JSON.stringify({ service: "api" }),
      "env",
      "",
      "host",
      "(?i)^(?:web-\\d+)$",
    ]);
    expect(logLevelConditions(query, "v.level")).toEqual({
      clauses: ["v.level <> ?"],
      parameters: ["debug"],
    });
    expect(logEntryConditions(query)).toEqual({
      clauses: ["e.level <> ?", "e.message !~ ?", "e.message LIKE ?"],
      parameters: ["debug", "health", "%100\\%\\_done\\\\%"],
    });
    expect(logQueryRegexPatterns(parseLogQuery('{host=~"a|b"} |~ "x+"'))).toEqual([
      "^(?:a|b)$",
      "x+",
    ]);
  });

  it("parses and compiles field filters on attributes", () => {
    const query = parseLogQuery(
      '{service="api"} |= "GET" | status >= 500 | http.route = "/checkout" | user_id !~ "test-.*"'
    );
    expect(query.fields).toEqual([
      { field: "status", operator: ">=", value: 500 },
      { field: "http.route", operator: "=", value: "/checkout" },
      { field: "user_id", operator: "!~", value: "test-.*" },
    ]);
    expect(parseLogQuery(formatLogQuery(query))).toEqual(query);
    expect(() => parseLogQuery('| status > "high"')).toThrow("> needs a number");

    const conditions = logEntryConditions(query);
    expect(conditions.clauses.slice(1)).toEqual([
      "(CASE WHEN (e.attributes ->> ?) ~ ? THEN (e.attributes ->> ?)::double precision END) >= ?",
      "COALESCE((e.attributes ->> ?), '') = ?",
      "COALESCE((e.attributes ->> ?), '') !~ ?",
    ]);
    expect(conditions.parameters.slice(-8)).toEqual([
      "status",
      "^\\s*-?[0-9]+(\\.[0-9]+)?([eE][-+]?[0-9]+)?\\s*$",
      "status",
      500,
      "http.route",
      "/checkout",
      "user_id",
      "^(?:test-.*)$",
    ]);
    expect(logQueryRegexPatterns(query)).toEqual(["^(?:test-.*)$"]);
  });

  it("turns invalid regular expressions into request errors", async () => {
    await expect(
      withLogQueryErrors(() => Promise.reject(Object.assign(new Error("bad"), { code: "2201B" })))
    ).rejects.toThrow("A regular expression in the query is invalid");
  });
});
