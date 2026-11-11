import {
  escapeLogRegex,
  formatLogQuery,
  logLevels,
  parseLogQuery,
  type LogFieldFilter,
  type LogLabelMatcher,
  type LogLabelOperator,
  type LogLevel,
  type LogLineFilter,
  type LogQuery,
} from "@mimorii/contracts";

export const lineFilterModes = ["contains", "notContains", "regex", "notRegex"] as const;
export type LineFilterMode = (typeof lineFilterModes)[number];

export interface BuilderLineFilter {
  mode: LineFilterMode;
  value: string;
  matchCase: boolean;
}

export interface LogQueryBuilderState {
  matchers: LogLabelMatcher[];
  levels: LogLevel[];
  filters: BuilderLineFilter[];
  fields: LogFieldFilter[];
}

const caseInsensitivePrefix = "(?i)";
const regexSpecialCharacter = /(?<!\\)[\^$.|?*+()[\]{}]/;

export function builderFromQuery(query: LogQuery): LogQueryBuilderState {
  const state: LogQueryBuilderState = {
    matchers: [],
    levels: [],
    filters: [],
    fields: [...query.fields],
  };
  for (const matcher of query.matchers) {
    const levels = matcherLevels(matcher);
    if (levels && state.levels.length === 0) state.levels = levels;
    else state.matchers.push(matcher);
  }
  state.filters = query.filters.map(builderFilter);
  return state;
}

export function queryFromBuilder(state: LogQueryBuilderState): LogQuery {
  const matchers = state.matchers.filter((matcher) => matcher.label.trim());
  const levels = logLevels.filter((level) => state.levels.includes(level));
  if (levels.length === 1) matchers.push({ label: "level", operator: "=", value: levels[0]! });
  if (levels.length > 1) matchers.push({ label: "level", operator: "=~", value: levels.join("|") });
  return {
    matchers,
    filters: state.filters.filter((filter) => filter.value).map(lineFilter),
    fields: state.fields,
  };
}

export function builderFromText(text: string): LogQueryBuilderState {
  return builderFromQuery(parseLogQuery(text));
}

export function textFromBuilder(state: LogQueryBuilderState): string {
  return formatLogQuery(queryFromBuilder(state));
}

export function withLabelMatcher(text: string, matcher: LogLabelMatcher): string {
  const query = safeParse(text);
  const matchers = query.matchers.filter(
    (candidate) =>
      !(candidate.label === matcher.label && sameDirection(candidate.operator, matcher.operator))
  );
  return formatLogQuery({ ...query, matchers: [...matchers, matcher] });
}

export function withFieldFilter(text: string, filter: LogFieldFilter): string {
  const query = safeParse(text);
  const fields = query.fields.filter(
    (candidate) =>
      !(candidate.field === filter.field && sameFieldDirection(candidate.operator, filter.operator))
  );
  return formatLogQuery({ ...query, fields: [...fields, filter] });
}

export function withLineFilter(text: string, filter: LogLineFilter): string {
  const query = safeParse(text);
  if (
    query.filters.some(
      (candidate) => candidate.operator === filter.operator && candidate.value === filter.value
    )
  ) {
    return formatLogQuery(query);
  }
  return formatLogQuery({ ...query, filters: [...query.filters, filter] });
}

export function withoutLabel(text: string, label: string): string {
  const query = safeParse(text);
  return formatLogQuery({
    ...query,
    matchers: query.matchers.filter((matcher) => matcher.label !== label),
  });
}

export function withToggledLevel(text: string, level: LogLevel): string {
  const state = builderFromQuery(safeParse(text));
  const levels = state.levels.includes(level)
    ? state.levels.filter((candidate) => candidate !== level)
    : [...state.levels, level];
  return textFromBuilder({ ...state, levels });
}

export function selectedLevels(text: string): LogLevel[] {
  return builderFromQuery(safeParse(text)).levels;
}

export function highlightExpressions(text: string): RegExp[] {
  const expressions: RegExp[] = [];
  for (const filter of safeParse(text).filters) {
    if (filter.operator === "|=" && filter.value) {
      expressions.push(new RegExp(escapeLogRegex(filter.value), "g"));
    }
    if (filter.operator === "|~") {
      const insensitive = filter.value.startsWith(caseInsensitivePrefix);
      const source = insensitive ? filter.value.slice(caseInsensitivePrefix.length) : filter.value;
      try {
        if (source) expressions.push(new RegExp(source, insensitive ? "gi" : "g"));
      } catch {
        continue;
      }
    }
  }
  return expressions;
}

export function validateRegexValue(value: string): string | null {
  const source = value.startsWith(caseInsensitivePrefix)
    ? value.slice(caseInsensitivePrefix.length)
    : value;
  try {
    RegExp(source);
  } catch {
    return "Invalid regular expression";
  }
  return null;
}

function safeParse(text: string): LogQuery {
  try {
    return parseLogQuery(text);
  } catch {
    return { matchers: [], filters: [], fields: [] };
  }
}

function sameFieldDirection(
  left: LogFieldFilter["operator"],
  right: LogFieldFilter["operator"]
): boolean {
  const positive = (operator: LogFieldFilter["operator"]) => operator !== "!=" && operator !== "!~";
  return positive(left) === positive(right);
}

function sameDirection(left: LogLabelOperator, right: LogLabelOperator): boolean {
  return positiveOperator(left) === positiveOperator(right);
}

function positiveOperator(operator: LogLabelOperator): boolean {
  return operator === "=" || operator === "=~";
}

function matcherLevels(matcher: LogLabelMatcher): LogLevel[] | null {
  if (matcher.label !== "level") return null;
  const values =
    matcher.operator === "="
      ? [matcher.value]
      : matcher.operator === "=~"
        ? matcher.value.split("|")
        : [];
  if (!values.length || !values.every((value) => logLevels.includes(value as LogLevel))) {
    return null;
  }
  return values as LogLevel[];
}

function builderFilter(filter: LogLineFilter): BuilderLineFilter {
  const positive = filter.operator === "|=" || filter.operator === "|~";
  if (filter.operator === "|=" || filter.operator === "!=") {
    return { mode: positive ? "contains" : "notContains", value: filter.value, matchCase: true };
  }
  const literal = filter.value.startsWith(caseInsensitivePrefix)
    ? unescapedLiteral(filter.value.slice(caseInsensitivePrefix.length))
    : null;
  if (literal !== null) {
    return { mode: positive ? "contains" : "notContains", value: literal, matchCase: false };
  }
  return { mode: positive ? "regex" : "notRegex", value: filter.value, matchCase: true };
}

function lineFilter(filter: BuilderLineFilter): LogLineFilter {
  if (filter.mode === "regex") return { operator: "|~", value: filter.value };
  if (filter.mode === "notRegex") return { operator: "!~", value: filter.value };
  const positive = filter.mode === "contains";
  if (filter.matchCase) return { operator: positive ? "|=" : "!=", value: filter.value };
  return {
    operator: positive ? "|~" : "!~",
    value: `${caseInsensitivePrefix}${escapeLogRegex(filter.value)}`,
  };
}

function unescapedLiteral(pattern: string): string | null {
  if (regexSpecialCharacter.test(pattern)) return null;
  const literal = pattern.replace(/\\([\\^$.|?*+()[\]{}])/g, "$1");
  return escapeLogRegex(literal) === pattern ? literal : null;
}
