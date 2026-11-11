export const logLabelOperators = ["=", "!=", "=~", "!~"] as const;
export type LogLabelOperator = (typeof logLabelOperators)[number];

export const logLineFilterOperators = ["|=", "!=", "|~", "!~"] as const;
export type LogLineFilterOperator = (typeof logLineFilterOperators)[number];

export interface LogLabelMatcher {
  label: string;
  operator: LogLabelOperator;
  value: string;
}

export interface LogLineFilter {
  operator: LogLineFilterOperator;
  value: string;
}

export const logFieldOperators = ["=", "!=", "=~", "!~", ">", ">=", "<", "<="] as const;
export type LogFieldOperator = (typeof logFieldOperators)[number];

export interface LogFieldFilter {
  field: string;
  operator: LogFieldOperator;
  value: string | number;
}

export interface LogQuery {
  matchers: LogLabelMatcher[];
  filters: LogLineFilter[];
  fields: LogFieldFilter[];
}

export const logQueryLimits = {
  queryLength: 4_000,
  matchers: 20,
  filters: 10,
  fields: 10,
  valueLength: 500,
} as const;

export const logLabelNamePattern = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
export const logFieldNamePattern = /^[A-Za-z_][A-Za-z0-9_./-]{0,127}$/;

const fieldNamePrefix = /^[A-Za-z_][A-Za-z0-9_./-]*/;
const numericComparisons = new Set<LogFieldOperator>([">", ">=", "<", "<="]);
const regexComparisons = new Set<LogFieldOperator>(["=~", "!~"]);
const numberLiteral = /^-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/;

export class LogQueryError extends Error {
  constructor(
    message: string,
    readonly position: number
  ) {
    super(message);
    this.name = "LogQueryError";
  }
}

export function parseLogQuery(input: string): LogQuery {
  if (input.length > logQueryLimits.queryLength) {
    throw new LogQueryError("Query is too long", logQueryLimits.queryLength);
  }
  return new LogQueryParser(input).parse();
}

export function formatLogQuery(query: LogQuery): string {
  const parts = [
    ...query.filters.map((filter) => `${filter.operator} ${quoteLogValue(filter.value)}`),
    ...query.fields.map(
      (filter) =>
        `| ${filter.field} ${filter.operator} ${
          typeof filter.value === "number" ? String(filter.value) : quoteLogValue(filter.value)
        }`
    ),
  ];
  if (query.matchers.length) {
    const matchers = query.matchers.map(
      (matcher) => `${matcher.label}${matcher.operator}${quoteLogValue(matcher.value)}`
    );
    parts.unshift(`{${matchers.join(", ")}}`);
  }
  return parts.join(" ");
}

export function quoteLogValue(value: string): string {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\t", "\\t");
  return `"${escaped}"`;
}

export function escapeLogRegex(value: string): string {
  return value.replace(/[\\^$.|?*+()[\]{}]/g, "\\$&");
}

export const logPatternPlaceholder = "<_>";

export function logPatternRegex(pattern: string): string {
  const tokens = pattern.split(" ").filter(Boolean);
  const parts: string[] = [];
  let length = 0;
  for (const token of tokens) {
    const part = token.split(logPatternPlaceholder).map(escapeLogRegex).join(".*?");
    if (length + part.length > logQueryLimits.valueLength - 16) break;
    parts.push(part);
    length += part.length + 3;
  }
  const complete = parts.length === tokens.length;
  return `^\\s*${parts.join("\\s+")}${complete ? "\\s*$" : ""}`;
}

class LogQueryParser {
  private position = 0;
  private readonly query: LogQuery = { matchers: [], filters: [], fields: [] };

  constructor(private readonly input: string) {}

  parse(): LogQuery {
    this.skipWhitespace();
    if (this.input[this.position] === "{") this.parseSelector();
    this.skipWhitespace();
    while (this.position < this.input.length) {
      const next = this.input[this.position + 1];
      if (this.input[this.position] === "|" && next !== "=" && next !== "~") {
        this.parseFieldFilter();
      } else {
        this.parseLineFilter();
      }
      this.skipWhitespace();
    }
    return this.query;
  }

  private parseSelector(): void {
    this.position += 1;
    this.skipWhitespace();
    if (this.input[this.position] === "}") {
      this.position += 1;
      return;
    }
    for (;;) {
      this.skipWhitespace();
      const label = this.readLabelName();
      this.skipWhitespace();
      const operator = this.readOperator(logLabelOperators, "Expected =, !=, =~, or !~");
      this.skipWhitespace();
      const value = this.readString();
      if (this.query.matchers.length >= logQueryLimits.matchers) {
        this.fail(`Use up to ${logQueryLimits.matchers} label matchers`);
      }
      this.query.matchers.push({ label, operator, value });
      this.skipWhitespace();
      const next = this.input[this.position];
      if (next === ",") {
        this.position += 1;
        continue;
      }
      if (next === "}") {
        this.position += 1;
        return;
      }
      this.fail("Expected , or }");
    }
  }

  private parseLineFilter(): void {
    const operator = this.readOperator(logLineFilterOperators, "Expected |=, !=, |~, or !~");
    this.skipWhitespace();
    const value = this.readString();
    if (this.query.filters.length >= logQueryLimits.filters) {
      this.fail(`Use up to ${logQueryLimits.filters} line filters`);
    }
    this.query.filters.push({ operator, value });
  }

  private parseFieldFilter(): void {
    this.position += 1;
    this.skipWhitespace();
    const match = fieldNamePrefix.exec(this.input.slice(this.position));
    if (!match) this.fail("Expected a field name");
    const field = match[0];
    if (!logFieldNamePattern.test(field)) this.fail("Field names can contain up to 128 characters");
    this.position += field.length;
    this.skipWhitespace();
    const operator = this.readOperator(logFieldOperators, "Expected a comparison operator");
    this.skipWhitespace();
    const quoted = this.input[this.position] === '"' || this.input[this.position] === "`";
    let value: string | number;
    if (quoted) {
      value = this.readString();
    } else {
      const number = numberLiteral.exec(this.input.slice(this.position));
      if (!number) this.fail("Expected a quoted string or a number");
      value = Number(number[0]);
      this.position += number[0].length;
    }
    if (numericComparisons.has(operator) && typeof value !== "number") {
      this.fail(`${operator} needs a number`);
    }
    if (regexComparisons.has(operator) && typeof value !== "string") {
      this.fail(`${operator} needs a quoted regular expression`);
    }
    if (this.query.fields.length >= logQueryLimits.fields) {
      this.fail(`Use up to ${logQueryLimits.fields} field filters`);
    }
    this.query.fields.push({ field, operator, value });
  }

  private readLabelName(): string {
    const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.input.slice(this.position));
    if (!match) this.fail("Expected a label name");
    const name = match[0];
    if (!logLabelNamePattern.test(name)) this.fail("Label names can contain up to 64 characters");
    this.position += name.length;
    return name;
  }

  private readOperator<T extends string>(operators: readonly T[], message: string): T {
    const candidates = operators.toSorted((left, right) => right.length - left.length);
    const operator = candidates.find((candidate) =>
      this.input.startsWith(candidate, this.position)
    );
    if (!operator) this.fail(message);
    this.position += operator.length;
    return operator;
  }

  private readString(): string {
    const quote = this.input[this.position];
    if (quote === "`") {
      const end = this.input.indexOf("`", this.position + 1);
      if (end < 0) this.fail("Unterminated string");
      const value = this.input.slice(this.position + 1, end);
      this.position = end + 1;
      return this.checkedValue(value);
    }
    if (quote !== '"') this.fail("Expected a quoted string");
    this.position += 1;
    let value = "";
    while (this.position < this.input.length) {
      const character = this.input[this.position]!;
      if (character === '"') {
        this.position += 1;
        return this.checkedValue(value);
      }
      if (character === "\\" && this.position + 1 < this.input.length) {
        const next = this.input[this.position + 1]!;
        value +=
          next === "n" ? "\n" : next === "t" ? "\t" : '"\\'.includes(next) ? next : `\\${next}`;
        this.position += 2;
        continue;
      }
      value += character;
      this.position += 1;
    }
    this.fail("Unterminated string");
  }

  private checkedValue(value: string): string {
    if (value.length > logQueryLimits.valueLength) {
      this.fail(`Values can contain up to ${logQueryLimits.valueLength} characters`);
    }
    return value;
  }

  private skipWhitespace(): void {
    while (this.position < this.input.length && /\s/.test(this.input[this.position]!)) {
      this.position += 1;
    }
  }

  private fail(message: string): never {
    throw new LogQueryError(message, this.position);
  }
}
