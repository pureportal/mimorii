import {
  logFieldNamePattern,
  logFieldOperators,
  logLabelNamePattern,
  logLabelOperators,
  type LogFieldFilter,
  type LogFieldOperator,
  type LogLabelMatcher,
} from "@mimorii/contracts";
import { X } from "lucide-react";
import { useId, useState } from "react";
import { validateRegexValue } from "../../lib/log-query-builder";
import { Button } from "../ui/button";
import { Input, Select } from "../ui/input";

export interface FilterSuggestion {
  name: string;
  numeric?: boolean;
  values: string[];
}

type FilterEditorProps =
  | {
      kind: "label";
      suggestions: FilterSuggestion[];
      onAdd: (matcher: LogLabelMatcher) => void;
      onCancel: () => void;
    }
  | {
      kind: "field";
      suggestions: FilterSuggestion[];
      onAdd: (filter: LogFieldFilter) => void;
      onCancel: () => void;
    };

const numericOperators = new Set<LogFieldOperator>([">", ">=", "<", "<="]);
const numericText = /^-?\d+(?:\.\d+)?$/;

export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-8 max-w-full items-center gap-1 rounded-lg border border-lavender/40 bg-lavender-soft pl-2.5 font-mono text-xs text-violet-strong">
      <span className="truncate">{label}</span>
      <button
        type="button"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        className="grid size-7 shrink-0 place-items-center rounded-md text-violet-strong/80 hover:bg-ink/5 hover:text-ink"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

export function FilterEditor(props: FilterEditorProps) {
  const id = useId();
  const operators: readonly string[] =
    props.kind === "label" ? logLabelOperators : logFieldOperators;
  const [name, setName] = useState(props.suggestions[0]?.name ?? "");
  const [operator, setOperator] = useState("=");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const suggestion = props.suggestions.find((candidate) => candidate.name === name);

  function add() {
    const pattern = props.kind === "label" ? logLabelNamePattern : logFieldNamePattern;
    if (!pattern.test(name)) {
      setError(props.kind === "label" ? "Enter a label name" : "Enter a field name");
      return;
    }
    if ((operator === "=~" || operator === "!~") && validateRegexValue(value)) {
      setError("Invalid regular expression");
      return;
    }
    if (props.kind === "label") {
      props.onAdd({ label: name, operator: operator as LogLabelMatcher["operator"], value });
      return;
    }
    const fieldOperator = operator as LogFieldOperator;
    const numeric =
      numericOperators.has(fieldOperator) ||
      ((fieldOperator === "=" || fieldOperator === "!=") &&
        suggestion?.numeric === true &&
        numericText.test(value.trim()));
    if (numeric && !numericText.test(value.trim())) {
      setError("Enter a number");
      return;
    }
    props.onAdd({ field: name, operator: fieldOperator, value: numeric ? Number(value) : value });
  }

  return (
    <div className="grid w-full gap-2 rounded-xl border border-line bg-canvas/40 p-2 sm:flex sm:w-auto sm:items-center">
      <Input
        aria-label={props.kind === "label" ? "Label" : "Field"}
        list={`${id}-names`}
        value={name}
        spellCheck={false}
        autoFocus
        onChange={(event) => setName(event.target.value.trim())}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add();
          }
        }}
        className="h-9 font-mono text-[13px] sm:w-44"
      />
      <datalist id={`${id}-names`}>
        {props.suggestions.map((candidate) => (
          <option key={candidate.name} value={candidate.name} />
        ))}
      </datalist>
      <Select
        aria-label="Operator"
        value={operator}
        onChange={(event) => setOperator(event.target.value)}
        className="h-9 font-mono sm:w-20"
      >
        {operators.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
      <Input
        aria-label="Value"
        list={`${id}-values`}
        value={value}
        spellCheck={false}
        inputMode={numericOperators.has(operator as LogFieldOperator) ? "decimal" : undefined}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add();
          }
          if (event.key === "Escape") props.onCancel();
        }}
        className="h-9 font-mono text-[13px] sm:w-48"
      />
      <datalist id={`${id}-values`}>
        {(suggestion?.values ?? []).map((candidate) => (
          <option key={candidate} value={candidate} />
        ))}
      </datalist>
      <div className="flex gap-1">
        <Button type="button" size="sm" onClick={add}>
          Add
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={props.onCancel}>
          Cancel
        </Button>
      </div>
      {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}
    </div>
  );
}
