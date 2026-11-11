import type { LogFieldSummary, LogLabelSummary } from "@mimorii/contracts";
import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "../../lib/cn";
import { logQueryCompletions, type LogCompletion } from "../../lib/log-query-completion";
import { Textarea } from "../ui/input";

export function LogCodeEditor({
  value,
  labels,
  fields,
  invalid,
  onChange,
  onRun,
}: {
  value: string;
  labels: LogLabelSummary[];
  fields: LogFieldSummary[];
  invalid: boolean;
  onChange: (value: string) => void;
  onRun: () => void;
}) {
  const listId = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const [caret, setCaret] = useState(value.length);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const completions = useMemo(
    () => (open ? logQueryCompletions(value, caret, { labels, fields }) : []),
    [open, value, caret, labels, fields]
  );
  const activeIndex = Math.min(active, Math.max(completions.length - 1, 0));
  const expanded = completions.length > 0;

  useLayoutEffect(() => {
    if (pendingCaret.current === null || !textarea.current) return;
    textarea.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  });

  function trackCaret() {
    setCaret(textarea.current?.selectionStart ?? value.length);
  }

  function accept(completion: LogCompletion) {
    const next = value.slice(0, completion.from) + completion.text + value.slice(completion.to);
    pendingCaret.current = completion.caret;
    setCaret(completion.caret);
    setActive(0);
    onChange(next);
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      setOpen(false);
      onRun();
      return;
    }
    if (event.key === " " && event.ctrlKey) {
      event.preventDefault();
      setOpen(true);
      trackCaret();
      return;
    }
    if (!expanded) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const offset = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + offset + completions.length) % completions.length);
    } else if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
      event.preventDefault();
      accept(completions[activeIndex]!);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <Textarea
        ref={textarea}
        aria-label="Log query"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded ? `${listId}-${activeIndex}` : undefined}
        aria-invalid={invalid || undefined}
        value={value}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => {
          onChange(event.target.value);
          setCaret(event.target.selectionStart);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={keyDown}
        onKeyUp={(event) => {
          if (
            event.key === "ArrowLeft" ||
            event.key === "ArrowRight" ||
            event.key === "Home" ||
            event.key === "End"
          ) {
            trackCaret();
          }
        }}
        onClick={() => {
          trackCaret();
          setOpen(true);
        }}
        onFocus={() => {
          trackCaret();
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        className="min-h-20 font-mono text-[13px] leading-6"
      />
      {expanded ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="absolute left-0 top-full z-30 mt-1 max-h-64 w-full max-w-md overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-card [scrollbar-width:thin]"
        >
          {completions.map((completion, index) => (
            <li
              key={`${completion.label}-${index}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => {
                event.preventDefault();
                accept(completion);
              }}
              onMouseEnter={() => setActive(index)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 font-mono text-[12.5px] text-ink",
                index === activeIndex && "bg-lavender-soft text-violet-strong"
              )}
            >
              <span className="truncate">{completion.label}</span>
              {completion.detail ? (
                <span className="shrink-0 text-[11px] text-muted">{completion.detail}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
