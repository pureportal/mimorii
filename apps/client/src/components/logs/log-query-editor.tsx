import { LogQueryError, type LogFieldSummary, type LogLabelSummary } from "@mimorii/contracts";
import { CaseSensitive, Code2, LoaderCircle, Play, Plus, Rows3, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { logLevelPresentation } from "../../lib/log-display";
import {
  builderFromText,
  lineFilterModes,
  textFromBuilder,
  validateRegexValue,
  type BuilderLineFilter,
  type LineFilterMode,
  type LogQueryBuilderState,
} from "../../lib/log-query-builder";
import { LogCodeEditor } from "./log-code-editor";
import { FilterChip, FilterEditor } from "./log-filter-editor";
import { Button } from "../ui/button";
import { FieldError } from "../ui/field";
import { Input, Select } from "../ui/input";

type EditorMode = "builder" | "code";

const modeKey = "mimorii.logs.editor";
const lineFilterLabels: Record<LineFilterMode, string> = {
  contains: "Contains",
  notContains: "Does not contain",
  regex: "Matches regex",
  notRegex: "Does not match regex",
};
const emptyFilter: BuilderLineFilter = { mode: "contains", value: "", matchCase: false };
const typingDelay = 200;
const validationDelay = 400;

export function LogQueryEditor({
  query,
  labels,
  fields,
  running,
  onRun,
  tools,
  actions,
}: {
  query: string;
  labels: LogLabelSummary[];
  fields: LogFieldSummary[];
  running: boolean;
  onRun: (query: string) => void;
  tools?: ReactNode;
  actions?: ReactNode;
}) {
  const [mode, setMode] = useState<EditorMode>(() =>
    localStorage.getItem(modeKey) === "code" ? "code" : "builder"
  );
  const [builder, setBuilder] = useState<LogQueryBuilderState>(() => initialBuilder(query));
  const [code, setCode] = useState(query);
  const [syncedQuery, setSyncedQuery] = useState(query);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState<"label" | "field" | null>(null);
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const typingTimer = useRef<number | undefined>(undefined);
  const externalChange = query !== submittedQuery;
  useEffect(() => () => window.clearTimeout(typingTimer.current), []);
  useEffect(() => {
    if (mode !== "code") return;
    const timer = window.setTimeout(() => {
      try {
        builderFromText(code);
        setError("");
      } catch (cause) {
        setError(queryErrorMessage(cause));
      }
    }, validationDelay);
    return () => window.clearTimeout(timer);
  }, [code, mode]);
  useEffect(() => {
    if (externalChange) window.clearTimeout(typingTimer.current);
  }, [query, externalChange]);
  if (query !== syncedQuery) {
    setSyncedQuery(query);
    if (externalChange) {
      setBuilder(initialBuilder(query));
      setCode(query);
      setError("");
    }
  }

  function submitQuery(text: string) {
    setSubmittedQuery(text);
    onRun(text);
  }

  function changeMode(next: EditorMode) {
    if (next === mode) return;
    if (next === "code") {
      setCode(textFromBuilder(builder));
    } else {
      try {
        setBuilder(withEditableFilter(builderFromText(code)));
      } catch (cause) {
        setError(queryErrorMessage(cause));
        return;
      }
    }
    setError("");
    setMode(next);
    localStorage.setItem(modeKey, next);
  }

  function run(state = builder) {
    window.clearTimeout(typingTimer.current);
    if (mode === "code") {
      try {
        builderFromText(code);
      } catch (cause) {
        setError(queryErrorMessage(cause));
        return;
      }
      setError("");
      submitQuery(code.trim());
      return;
    }
    const invalid = state.filters.find(
      (filter) =>
        (filter.mode === "regex" || filter.mode === "notRegex") && validateRegexValue(filter.value)
    );
    if (invalid) {
      setError(`Invalid regular expression: ${invalid.value}`);
      return;
    }
    setError("");
    submitQuery(textFromBuilder(state));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    run();
  }

  function updateBuilder(next: LogQueryBuilderState, runNow = false) {
    setBuilder(next);
    if (runNow) run(next);
  }

  function updateFilter(index: number, change: Partial<BuilderLineFilter>) {
    const next = {
      ...builder,
      filters: builder.filters.map((filter, position) =>
        position === index ? { ...filter, ...change } : filter
      ),
    };
    setBuilder(next);
    window.clearTimeout(typingTimer.current);
    if (next.filters[index]!.value.length === 1) return;
    typingTimer.current = window.setTimeout(() => {
      if (textFromBuilder(next) !== query) run(next);
    }, typingDelay);
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            role="radiogroup"
            aria-label="Query editor"
            className="flex rounded-xl border border-line bg-canvas/50 p-1"
          >
            {(["builder", "code"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={mode === option}
                onClick={() => changeMode(option)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-muted transition hover:text-ink",
                  mode === option && "bg-lavender-soft text-violet-strong"
                )}
              >
                {option === "builder" ? (
                  <Rows3 className="size-3.5" />
                ) : (
                  <Code2 className="size-3.5" />
                )}
                {option === "builder" ? "Builder" : "Code"}
              </button>
            ))}
          </div>
          {tools}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {actions}
          <Button type="submit" variant="coral" disabled={running} className="w-full sm:w-auto">
            {running ? <LoaderCircle className="animate-spin" /> : <Play />}
            Run query
          </Button>
        </div>
      </div>

      {mode === "code" ? (
        <LogCodeEditor
          value={code}
          labels={labels}
          fields={fields}
          invalid={Boolean(error)}
          onChange={setCode}
          onRun={() => run()}
        />
      ) : (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {builder.levels.length ? (
              <FilterChip
                label={`level ${builder.levels.length > 1 ? "=~" : "="} ${builder.levels
                  .map((level) => logLevelPresentation[level].label)
                  .join(", ")}`}
                onRemove={() => updateBuilder({ ...builder, levels: [] }, true)}
              />
            ) : null}
            {builder.matchers.map((matcher, index) => (
              <FilterChip
                key={`${matcher.label}-${matcher.operator}-${matcher.value}`}
                label={`${matcher.label} ${matcher.operator} ${matcher.value || '""'}`}
                onRemove={() =>
                  updateBuilder(
                    {
                      ...builder,
                      matchers: builder.matchers.filter((_, position) => position !== index),
                    },
                    true
                  )
                }
              />
            ))}
            {builder.fields.map((filter, index) => (
              <FilterChip
                key={`${filter.field}-${filter.operator}-${filter.value}`}
                label={`${filter.field} ${filter.operator} ${typeof filter.value === "number" ? filter.value : `"${filter.value}"`}`}
                onRemove={() =>
                  updateBuilder(
                    {
                      ...builder,
                      fields: builder.fields.filter((_, position) => position !== index),
                    },
                    true
                  )
                }
              />
            ))}
            {adding === "label" ? (
              <FilterEditor
                kind="label"
                suggestions={labels.map((label) => ({
                  name: label.name,
                  values: label.values.map((value) => value.value),
                }))}
                onCancel={() => setAdding(null)}
                onAdd={(matcher) => {
                  setAdding(null);
                  updateBuilder({ ...builder, matchers: [...builder.matchers, matcher] }, true);
                }}
              />
            ) : adding === "field" ? (
              <FilterEditor
                kind="field"
                suggestions={fields.map((field) => ({
                  name: field.name,
                  numeric: field.numeric,
                  values: field.values.map((value) => value.value),
                }))}
                onCancel={() => setAdding(null)}
                onAdd={(filter) => {
                  setAdding(null);
                  updateBuilder({ ...builder, fields: [...builder.fields, filter] }, true);
                }}
              />
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAdding("label")}
                >
                  <Plus /> Label filter
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAdding("field")}
                >
                  <Plus /> Field filter
                </Button>
              </>
            )}
          </div>
          {builder.filters.map((filter, index) => (
            <div
              key={index}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[12rem_minmax(0,1fr)_auto]"
            >
              <Select
                aria-label="Line filter"
                value={filter.mode}
                onChange={(event) =>
                  updateFilter(index, { mode: event.target.value as LineFilterMode })
                }
                className="col-span-2 h-10 sm:col-span-1"
              >
                {lineFilterModes.map((option) => (
                  <option key={option} value={option}>
                    {lineFilterLabels[option]}
                  </option>
                ))}
              </Select>
              <Input
                aria-label="Line filter text"
                value={filter.value}
                spellCheck={false}
                onChange={(event) => updateFilter(index, { value: event.target.value })}
                className="h-10 font-mono text-[13px]"
              />
              <div className="flex gap-1">
                {filter.mode === "contains" || filter.mode === "notContains" ? (
                  <Button
                    type="button"
                    variant={filter.matchCase ? "outline" : "ghost"}
                    size="icon"
                    aria-label="Match case"
                    aria-pressed={filter.matchCase}
                    title="Match case"
                    onClick={() => updateFilter(index, { matchCase: !filter.matchCase })}
                    className={cn(filter.matchCase && "border-lavender text-violet-strong")}
                  >
                    <CaseSensitive />
                  </Button>
                ) : null}
                {builder.filters.length > 1 || filter.value ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove line filter"
                    onClick={() => {
                      const filters = builder.filters.filter((_, position) => position !== index);
                      updateBuilder(
                        { ...builder, filters: filters.length ? filters : [emptyFilter] },
                        Boolean(filter.value)
                      );
                    }}
                  >
                    <X />
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          {builder.filters.length < 10 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={() =>
                updateBuilder({ ...builder, filters: [...builder.filters, emptyFilter] })
              }
            >
              <Plus /> Line filter
            </Button>
          ) : null}
        </div>
      )}
      <FieldError>{error}</FieldError>
    </form>
  );
}

function initialBuilder(query: string): LogQueryBuilderState {
  try {
    return withEditableFilter(builderFromText(query));
  } catch {
    return withEditableFilter({ matchers: [], levels: [], filters: [], fields: [] });
  }
}

function withEditableFilter(state: LogQueryBuilderState): LogQueryBuilderState {
  return state.filters.length ? state : { ...state, filters: [emptyFilter] };
}

function queryErrorMessage(cause: unknown): string {
  if (cause instanceof LogQueryError) return `${cause.message} at position ${cause.position + 1}`;
  return cause instanceof Error ? cause.message : "The query is invalid";
}
