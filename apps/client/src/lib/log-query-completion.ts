import { logLevels, type LogFieldSummary, type LogLabelSummary } from "@mimorii/contracts";

export interface LogCompletion {
  label: string;
  detail?: string;
  text: string;
  from: number;
  to: number;
  caret: number;
}

export interface LogCompletionSource {
  labels: LogLabelSummary[];
  fields: LogFieldSummary[];
}

interface ScanState {
  inSelector: boolean;
  quoteStart: number | null;
  segmentStart: number;
  stageStart: number;
}

interface Candidate {
  label: string;
  detail?: string;
}

const completionLimit = 40;
const labelValuePattern = /^\s*([A-Za-z_]\w*)\s*(=~|!~|!=|=)\s*"([^"]*)$/;
const labelOperatorPattern = /^\s*([A-Za-z_]\w*)\s*(=~|!~|!=|=)\s*$/;
const labelNamePattern = /^\s*([A-Za-z_]\w*)?$/;
const fieldValuePattern = /^\|\s*([A-Za-z_][\w./-]*)\s*(=~|!~|!=|>=|<=|=|>|<)\s*"([^"]*)$/;
const fieldOperatorPattern = /^\|\s*([A-Za-z_][\w./-]*)\s*(=~|!~|!=|>=|<=|=|>|<)\s*$/;
const fieldNamePattern = /^\|\s*([A-Za-z_][\w./-]*)?$/;
const lineFilterStarters: Array<{ label: string; text: string }> = [
  { label: '|= "…"', text: '|= ""' },
  { label: '!= "…"', text: '!= ""' },
  { label: '|~ "…"', text: '|~ ""' },
  { label: '!~ "…"', text: '!~ ""' },
];

export function logQueryCompletions(
  text: string,
  caret: number,
  source: LogCompletionSource
): LogCompletion[] {
  const state = scan(text, caret);
  if (state.inSelector) return selectorCompletions(text, caret, state, source);
  return pipelineCompletions(text, caret, state, source);
}

function selectorCompletions(
  text: string,
  caret: number,
  state: ScanState,
  source: LogCompletionSource
): LogCompletion[] {
  const segment = text.slice(state.segmentStart, caret);
  if (state.quoteStart !== null) {
    const match = labelValuePattern.exec(segment);
    if (!match) return [];
    const valueFrom = state.quoteStart + 1;
    const valueTo = closingQuote(text, caret);
    return rank(labelValues(source, match[1]!), match[3]!).map((candidate) =>
      withClosedSelector(quotedCompletion(candidate, valueFrom, valueTo, text), text)
    );
  }
  const operator = labelOperatorPattern.exec(segment);
  if (operator) {
    return rank(labelValues(source, operator[1]!), "").map((candidate) =>
      withClosedSelector(
        {
          ...candidate,
          text: `"${escapeValue(candidate.label)}"`,
          from: caret,
          to: caret,
          caret: caret + escapeValue(candidate.label).length + 2,
        },
        text
      )
    );
  }
  const name = labelNamePattern.exec(segment);
  if (!name) return [];
  const partial = name[1] ?? "";
  const from = caret - partial.length;
  const to = identifierEnd(text, caret);
  const followedByOperator = /^\s*(=|!=|=~|!~)/.test(text.slice(to));
  return rank(labelNames(source), partial).map((candidate) =>
    followedByOperator
      ? { ...candidate, text: candidate.label, from, to, caret: from + candidate.label.length }
      : {
          ...candidate,
          text: `${candidate.label}=""`,
          from,
          to,
          caret: from + candidate.label.length + 2,
        }
  );
}

function pipelineCompletions(
  text: string,
  caret: number,
  state: ScanState,
  source: LogCompletionSource
): LogCompletion[] {
  const stage = text.slice(state.stageStart, caret);
  if (state.quoteStart !== null) {
    const match = fieldValuePattern.exec(stage);
    if (!match) return [];
    return rank(fieldValues(source, match[1]!), match[3]!).map((candidate) =>
      quotedCompletion(candidate, state.quoteStart! + 1, closingQuote(text, caret), text)
    );
  }
  const operator = fieldOperatorPattern.exec(stage);
  if (operator) {
    const field = source.fields.find((candidate) => candidate.name === operator[1]);
    return rank(fieldValues(source, operator[1]!), "").map((candidate) => {
      const value =
        field?.numeric && /^-?\d+(?:\.\d+)?$/.test(candidate.label)
          ? candidate.label
          : `"${escapeValue(candidate.label)}"`;
      return { ...candidate, text: value, from: caret, to: caret, caret: caret + value.length };
    });
  }
  const field = fieldNamePattern.exec(stage);
  if (field && state.stageStart < caret && text[state.stageStart] === "|") {
    const partial = field[1] ?? "";
    const from = caret - partial.length;
    const to = fieldNameEnd(text, caret);
    return rank(
      source.fields.map((candidate) => ({
        label: candidate.name,
        detail: candidate.count.toLocaleString(),
      })),
      partial
    ).map((candidate) => ({
      ...candidate,
      text: `${candidate.label} = `,
      from,
      to,
      caret: from + candidate.label.length + 3,
    }));
  }
  const before = text.slice(0, caret);
  if (!before.trim()) {
    return rank(labelNames(source), "").map((candidate) => ({
      ...candidate,
      label: `{${candidate.label}}`,
      text: `{${candidate.label}=""}`,
      from: caret,
      to: caret,
      caret: caret + candidate.label.length + 3,
    }));
  }
  if (/\}\s*$/.test(before) || /["`]\s+$/.test(before) || /\d\s+$/.test(before)) {
    const spacer = /\s$/.test(before) ? "" : " ";
    return lineFilterStarters.map((starter) => ({
      label: starter.label,
      text: `${spacer}${starter.text}`,
      from: caret,
      to: caret,
      caret: caret + spacer.length + starter.text.length - 1,
    }));
  }
  return [];
}

function scan(text: string, caret: number): ScanState {
  const state: ScanState = { inSelector: false, quoteStart: null, segmentStart: 0, stageStart: 0 };
  let quote: string | null = null;
  for (let index = 0; index < caret; index += 1) {
    const character = text[index]!;
    if (quote) {
      if (quote === '"' && character === "\\") {
        index += 1;
        continue;
      }
      if (character === quote) {
        quote = null;
        state.quoteStart = null;
      }
      continue;
    }
    if (character === '"' || character === "`") {
      quote = character;
      state.quoteStart = index;
    } else if (!state.inSelector && character === "{") {
      state.inSelector = true;
      state.segmentStart = index + 1;
    } else if (state.inSelector && character === ",") {
      state.segmentStart = index + 1;
    } else if (state.inSelector && character === "}") {
      state.inSelector = false;
      state.stageStart = index + 1;
    } else if (
      !state.inSelector &&
      (character === "|" || (character === "!" && /[=~]/.test(text[index + 1] ?? "")))
    ) {
      state.stageStart = index;
    }
  }
  return state;
}

function labelNames(source: LogCompletionSource): Candidate[] {
  const names = source.labels.map((label) => ({
    label: label.name,
    detail: label.valueCount.toLocaleString(),
  }));
  return names.some((name) => name.label === "level") ? names : [...names, { label: "level" }];
}

function labelValues(source: LogCompletionSource, name: string): Candidate[] {
  if (name === "level") return logLevels.map((level) => ({ label: level }));
  const label = source.labels.find((candidate) => candidate.name === name);
  return (label?.values ?? []).map((value) => ({
    label: value.value,
    detail: value.streams.toLocaleString(),
  }));
}

function fieldValues(source: LogCompletionSource, name: string): Candidate[] {
  const field = source.fields.find((candidate) => candidate.name === name);
  return (field?.values ?? []).map((value) => ({
    label: value.value,
    detail: value.count.toLocaleString(),
  }));
}

function rank(candidates: Candidate[], partial: string): Candidate[] {
  const needle = partial.toLowerCase();
  const prefixed: Candidate[] = [];
  const containing: Candidate[] = [];
  for (const candidate of candidates) {
    const label = candidate.label.toLowerCase();
    if (label.startsWith(needle)) prefixed.push(candidate);
    else if (needle && label.includes(needle)) containing.push(candidate);
  }
  return [...prefixed, ...containing].slice(0, completionLimit);
}

function quotedCompletion(
  candidate: Candidate,
  from: number,
  to: number,
  text: string
): LogCompletion {
  const value = escapeValue(candidate.label);
  const closed = text[to] === '"';
  return {
    ...candidate,
    text: closed ? value : `${value}"`,
    from,
    to,
    caret: from + value.length + 1,
  };
}

function withClosedSelector(completion: LogCompletion, text: string): LogCompletion {
  const rest = text.slice(completion.to);
  if (/^"?\s*[,}]/.test(rest) || hasSelectorEnd(rest)) return completion;
  const quote = rest.startsWith('"') ? 1 : 0;
  return {
    ...completion,
    text: `${completion.text}${quote ? '"' : ""}}`,
    to: completion.to + quote,
    caret: completion.caret + 1,
  };
}

function hasSelectorEnd(rest: string): boolean {
  let quote: string | null = null;
  for (let index = 0; index < rest.length; index += 1) {
    const character = rest[index]!;
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "`") quote = character;
    else if (character === "}") return true;
  }
  return false;
}

function closingQuote(text: string, caret: number): number {
  for (let index = caret; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === '"') return index;
    if (character === "," || character === "}" || character === "|" || character === "\n") {
      return caret;
    }
  }
  return caret;
}

function identifierEnd(text: string, caret: number): number {
  let index = caret;
  while (index < text.length && /\w/.test(text[index]!)) index += 1;
  return index;
}

function fieldNameEnd(text: string, caret: number): number {
  let index = caret;
  while (index < text.length && /[\w./-]/.test(text[index]!)) index += 1;
  return index;
}

function escapeValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
