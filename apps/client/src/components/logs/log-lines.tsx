import type { LogAttributeValue, LogEntry, LogLabelOperator } from "@mimorii/contracts";
import { ChevronRight, CircleMinus, CirclePlus, Copy, Rows3, type LucideIcon } from "lucide-react";
import { memo, startTransition, useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "../../lib/cn";
import {
  formatLogTimestamp,
  logLevelPresentation,
  prettyJson,
  type DisplayedLogEntry,
  type LogDisplayOptions,
} from "../../lib/log-display";
import { Button } from "../ui/button";

const displayLimit = 4_000;
const firstRenderedLines = 100;
const renderedLinesChunk = 250;

export interface LogLineActions {
  onFilterLabel: (label: string, value: string, operator: LogLabelOperator) => void;
  onFilterField: (field: string, value: string | number, operator: "=" | "!=") => void;
  onShowContext: (entry: LogEntry) => void;
}

export function LogLines({
  entries,
  resultKey,
  options,
  labelNames,
  highlights,
  actions,
}: {
  entries: DisplayedLogEntry[];
  resultKey: string;
  options: LogDisplayOptions;
  labelNames: string[];
  highlights: RegExp[];
  actions: LogLineActions;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [renderedKey, setRenderedKey] = useState(resultKey);
  const [rendered, setRendered] = useState(firstRenderedLines);
  if (renderedKey !== resultKey) {
    setRenderedKey(resultKey);
    setRendered(firstRenderedLines);
  }
  const visible = Math.min(rendered, entries.length);
  useEffect(() => {
    if (visible >= entries.length) return;
    const timer = window.setTimeout(() => {
      startTransition(() => setRendered(visible + renderedLinesChunk));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [visible, entries.length]);
  const toggle = useCallback((id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div role="list" aria-label="Log lines" className="font-mono text-[12.5px] leading-5">
      {entries.slice(0, visible).map(({ entry, duplicates }) => (
        <LogLine
          key={entry.id}
          entry={entry}
          duplicates={duplicates}
          options={options}
          labelNames={labelNames}
          highlights={highlights}
          expanded={expanded.has(entry.id)}
          onToggle={toggle}
          actions={actions}
        />
      ))}
    </div>
  );
}

const LogLine = memo(function LogLine({
  entry,
  duplicates,
  options,
  labelNames,
  highlights,
  expanded,
  onToggle,
  actions,
}: {
  entry: LogEntry;
  duplicates: number;
  options: LogDisplayOptions;
  labelNames: string[];
  highlights: RegExp[];
  expanded: boolean;
  onToggle: (id: string) => void;
  actions: LogLineActions;
}) {
  const [fullLine, setFullLine] = useState(false);
  const presentation = logLevelPresentation[entry.level];
  const pretty = options.prettifyJson ? prettyJson(entry.message) : null;
  const text = pretty ?? entry.message;
  const shortened = !fullLine && text.length > displayLimit;
  const visibleLabels = options.showLabels
    ? labelNames.filter((name) => entry.labels[name] !== undefined)
    : [];

  return (
    <div
      role="listitem"
      className={cn(
        "group relative border-b border-line/60 [content-visibility:auto] [contain-intrinsic-size:auto_28px]",
        expanded && "bg-ink/[.035]"
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ backgroundColor: presentation.color }}
      />
      <div
        className="flex cursor-pointer flex-wrap gap-x-2 gap-y-0.5 py-1 pl-2 pr-3 hover:bg-ink/[.04] sm:flex-nowrap"
        onClick={() => {
          if (!window.getSelection()?.toString()) onToggle(entry.id);
        }}
      >
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? "Hide details" : "Show details"}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(entry.id);
          }}
          className="mt-0.5 grid size-4 shrink-0 place-items-center rounded text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-coral-strong"
        >
          <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
        </button>
        {options.showTime ? (
          <time dateTime={entry.timestamp} className="shrink-0 text-muted">
            {formatLogTimestamp(entry.timestamp)}
          </time>
        ) : null}
        <span className="sr-only">{presentation.label}</span>
        {visibleLabels.length ? (
          <span className="flex shrink-0 gap-1">
            {visibleLabels.map((name) => (
              <span
                key={name}
                title={`${name}=${entry.labels[name]}`}
                className="max-w-40 truncate rounded bg-ink/6 px-1.5 text-[11px] text-muted"
              >
                {entry.labels[name]}
              </span>
            ))}
          </span>
        ) : null}
        <span
          className={cn(
            "min-w-0 flex-1 text-ink max-sm:basis-full max-sm:pl-6",
            pretty || options.wrapLines
              ? "whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
              : "truncate whitespace-pre"
          )}
        >
          {highlighted(shortened ? text.slice(0, displayLimit) : text, highlights)}
          {shortened ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setFullLine(true);
              }}
              className="ml-2 rounded bg-ink/8 px-1.5 font-sans text-[11px] font-semibold text-muted hover:text-ink"
            >
              Show all {text.length.toLocaleString()} characters
            </button>
          ) : null}
        </span>
        {duplicates ? (
          <span
            title={`${duplicates + 1} identical lines`}
            className="h-5 shrink-0 rounded bg-lavender-soft px-1.5 text-[11px] font-semibold text-violet-strong"
          >
            ×{duplicates + 1}
          </span>
        ) : null}
      </div>
      {expanded ? <LogLineDetails entry={entry} actions={actions} /> : null}
    </div>
  );
});

function LogLineDetails({ entry, actions }: { entry: LogEntry; actions: LogLineActions }) {
  const labels = Object.entries(entry.labels).toSorted(([left], [right]) =>
    left.localeCompare(right)
  );
  const attributes = Object.entries(entry.attributes);

  return (
    <div className="cursor-auto border-t border-line/60 px-3 pb-4 pl-8 pt-3 font-sans text-sm">
      <div className="flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" onClick={() => actions.onShowContext(entry)}>
          <Rows3 /> Show context
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void copy(entry.message, "Line")}>
          <Copy /> Copy line
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void copy(JSON.stringify(entry, null, 2), "Entry")}
        >
          <Copy /> Copy as JSON
        </Button>
      </div>
      <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[9rem_minmax(0,1fr)]">
        <DetailRow name="Timestamp" value={entry.timestamp} />
        <DetailRow name="Received" value={entry.receivedAt} />
        <DetailRow name="Level" value={logLevelPresentation[entry.level].label} />
      </dl>
      {labels.length ? (
        <DetailSection title="Labels">
          {labels.map(([name, value]) => (
            <DetailRow
              key={name}
              name={name}
              value={value}
              actions={
                <>
                  <IconAction
                    icon={CirclePlus}
                    label={`Filter for ${name}=${value}`}
                    onClick={() => actions.onFilterLabel(name, value, "=")}
                  />
                  <IconAction
                    icon={CircleMinus}
                    label={`Filter out ${name}=${value}`}
                    onClick={() => actions.onFilterLabel(name, value, "!=")}
                  />
                </>
              }
            />
          ))}
        </DetailSection>
      ) : null}
      {attributes.length ? (
        <DetailSection title="Attributes">
          {attributes.map(([name, value]) => (
            <DetailRow
              key={name}
              name={name}
              value={typeof value === "string" ? value : JSON.stringify(value)}
              actions={
                filterableValue(value) === null ? undefined : (
                  <>
                    <IconAction
                      icon={CirclePlus}
                      label={`Filter for ${name}=${String(value)}`}
                      onClick={() => actions.onFilterField(name, filterableValue(value)!, "=")}
                    />
                    <IconAction
                      icon={CircleMinus}
                      label={`Filter out ${name}=${String(value)}`}
                      onClick={() => actions.onFilterField(name, filterableValue(value)!, "!=")}
                    />
                  </>
                )
              }
            />
          ))}
        </DetailSection>
      ) : null}
    </div>
  );
}

function filterableValue(value: LogAttributeValue): string | number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.length <= 500) return value;
  if (typeof value === "boolean") return String(value);
  return null;
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Copying is unavailable");
  }
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
        {title}
      </h4>
      <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[9rem_minmax(0,1fr)]">{children}</dl>
    </section>
  );
}

function DetailRow({ name, value, actions }: { name: string; value: string; actions?: ReactNode }) {
  return (
    <>
      <dt className="truncate font-mono text-muted" title={name}>
        {name}
      </dt>
      <dd className="flex min-w-0 items-start gap-2">
        <span className="min-w-0 flex-1 break-words font-mono text-ink [overflow-wrap:anywhere]">
          {value}
        </span>
        {actions ? <span className="flex shrink-0 gap-0.5">{actions}</span> : null}
      </dd>
    </>
  );
}

function IconAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-6 place-items-center rounded-md text-muted outline-none hover:bg-ink/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-coral-strong"
    >
      <Icon className="size-3.5" />
    </button>
  );
}

function highlighted(text: string, expressions: RegExp[]): ReactNode {
  if (!expressions.length || !text) return text;
  const ranges: Array<[number, number]> = [];
  for (const expression of expressions) {
    expression.lastIndex = 0;
    for (const match of text.matchAll(expression)) {
      if (!match[0] || match.index === undefined) continue;
      ranges.push([match.index, match.index + match[0].length]);
      if (ranges.length > 200) break;
    }
  }
  if (!ranges.length) return text;
  ranges.sort((left, right) => left[0] - right[0]);
  const parts: ReactNode[] = [];
  let position = 0;
  for (const [start, end] of ranges) {
    if (end <= position) continue;
    const from = Math.max(start, position);
    if (from > position) parts.push(text.slice(position, from));
    parts.push(
      <mark key={from} className="rounded-[3px] bg-warning/35 text-ink">
        {text.slice(from, end)}
      </mark>
    );
    position = end;
  }
  if (position < text.length) parts.push(text.slice(position));
  return parts;
}
