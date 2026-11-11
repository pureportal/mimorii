import {
  LogQueryError,
  parseLogQuery,
  type LogFieldFilter,
  type LogLabelMatcher,
  type LogLineFilter,
  type LogQuery,
} from "@mimorii/contracts";
import { BadRequestException } from "@nestjs/common";

export interface SqlConditions {
  clauses: string[];
  parameters: unknown[];
}

const numericPattern = "^\\s*-?[0-9]+(\\.[0-9]+)?([eE][-+]?[0-9]+)?\\s*$";
const invalidRegularExpressionCode = "2201B";
const queryCanceledCode = "57014";
const levelLabel = "level";
const likeSpecialCharacters = /[\\%_]/g;
const labelOperators = { "=": "=", "!=": "<>", "=~": "~", "!~": "!~" } as const;

export function parseLogQueryInput(input: string | undefined): LogQuery {
  try {
    return parseLogQuery(input?.trim() ?? "");
  } catch (error) {
    if (error instanceof LogQueryError) {
      throw new BadRequestException(`${error.message} at position ${error.position + 1}`);
    }
    throw error;
  }
}

export function logStreamMatchers(query: LogQuery): LogLabelMatcher[] {
  return query.matchers.filter((matcher) => matcher.label !== levelLabel);
}

export function logStreamConditions(
  matchers: LogLabelMatcher[],
  labelsColumn: string
): SqlConditions {
  const conditions: SqlConditions = { clauses: [], parameters: [] };
  for (const matcher of matchers) appendLabelMatcher(conditions, matcher, labelsColumn);
  return conditions;
}

export function logLevelConditions(query: LogQuery, levelColumn: string): SqlConditions {
  const conditions: SqlConditions = { clauses: [], parameters: [] };
  for (const matcher of query.matchers) {
    if (matcher.label === levelLabel) appendLevelMatcher(conditions, matcher, levelColumn);
  }
  return conditions;
}

export function logEntryConditions(query: LogQuery): SqlConditions {
  const conditions = logLevelConditions(query, "e.level");
  for (const filter of query.filters) appendLineFilter(conditions, filter);
  for (const filter of query.fields) appendFieldFilter(conditions, filter);
  return conditions;
}

export function hasLogContentFilters(query: LogQuery): boolean {
  return query.filters.length > 0 || query.fields.length > 0;
}

export function sqlAnd(conditions: SqlConditions): string {
  return conditions.clauses.map((clause) => `AND ${clause}`).join(" ");
}

export async function withLogQueryErrors<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === invalidRegularExpressionCode) {
      throw new BadRequestException("A regular expression in the query is invalid");
    }
    if (code === queryCanceledCode) {
      throw new BadRequestException("The query took too long; narrow the time range or filters");
    }
    throw error;
  }
}

export function logQueryRegexPatterns(query: LogQuery): string[] {
  return [
    ...query.matchers
      .filter((matcher) => matcher.operator === "=~" || matcher.operator === "!~")
      .map((matcher) => anchoredRegex(matcher.value)),
    ...query.filters
      .filter((filter) => filter.operator === "|~" || filter.operator === "!~")
      .map((filter) => filter.value),
    ...query.fields
      .filter((filter) => filter.operator === "=~" || filter.operator === "!~")
      .map((filter) => anchoredRegex(String(filter.value))),
  ];
}

function appendLabelMatcher(
  conditions: SqlConditions,
  matcher: LogLabelMatcher,
  labelsColumn: string
): void {
  if (matcher.operator === "=" && matcher.value) {
    conditions.clauses.push(`${labelsColumn} @> ?::jsonb`);
    conditions.parameters.push(JSON.stringify({ [matcher.label]: matcher.value }));
    return;
  }
  conditions.clauses.push(
    `COALESCE(${labelsColumn} ->> ?, '') ${labelOperators[matcher.operator]} ?`
  );
  conditions.parameters.push(matcher.label, matcherValue(matcher));
}

function appendLevelMatcher(
  conditions: SqlConditions,
  matcher: LogLabelMatcher,
  levelColumn: string
): void {
  conditions.clauses.push(`${levelColumn} ${labelOperators[matcher.operator]} ?`);
  conditions.parameters.push(matcherValue(matcher));
}

function matcherValue(matcher: LogLabelMatcher): string {
  return matcher.operator === "=~" || matcher.operator === "!~"
    ? anchoredRegex(matcher.value)
    : matcher.value;
}

function appendLineFilter(conditions: SqlConditions, filter: LogLineFilter): void {
  const clause = {
    "|=": "e.message LIKE ?",
    "!=": "e.message NOT LIKE ?",
    "|~": "e.message ~ ?",
    "!~": "e.message !~ ?",
  }[filter.operator];
  conditions.clauses.push(clause);
  conditions.parameters.push(
    filter.operator === "|=" || filter.operator === "!="
      ? `%${filter.value.replace(likeSpecialCharacters, "\\$&")}%`
      : filter.value
  );
}

function appendFieldFilter(conditions: SqlConditions, filter: LogFieldFilter): void {
  const field = "(e.attributes ->> ?)";
  if (typeof filter.value === "number") {
    const operator = {
      "=": "=",
      "!=": "IS DISTINCT FROM",
      ">": ">",
      ">=": ">=",
      "<": "<",
      "<=": "<=",
      "=~": "=",
      "!~": "IS DISTINCT FROM",
    }[filter.operator];
    conditions.clauses.push(
      `(CASE WHEN ${field} ~ ? THEN ${field}::double precision END) ${operator} ?`
    );
    conditions.parameters.push(filter.field, numericPattern, filter.field, filter.value);
    return;
  }
  const operator = labelOperators[filter.operator as keyof typeof labelOperators];
  const value =
    filter.operator === "=~" || filter.operator === "!~"
      ? anchoredRegex(filter.value)
      : filter.value;
  conditions.clauses.push(`COALESCE(${field}, '') ${operator} ?`);
  conditions.parameters.push(filter.field, value);
}

function anchoredRegex(value: string): string {
  const options = /^\(\?[a-z]+\)/.exec(value)?.[0] ?? "";
  return `${options}^(?:${value.slice(options.length)})$`;
}
