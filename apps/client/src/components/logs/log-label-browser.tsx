import type { LogLabelMatcher, LogLabelSummary } from "@mimorii/contracts";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/cn";

export function LogLabelBrowser({
  labels,
  search,
  activeMatchers,
  onSelect,
}: {
  labels: LogLabelSummary[];
  search: string;
  activeMatchers: LogLabelMatcher[];
  onSelect: (label: string, value: string) => void;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const term = search.trim().toLowerCase();
  const visible = labels
    .map((label) => ({
      ...label,
      values: term
        ? label.values.filter(
            (value) =>
              label.name.toLowerCase().includes(term) || value.value.toLowerCase().includes(term)
          )
        : label.values,
    }))
    .filter((label) => label.values.length > 0);

  function toggle(name: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div>
      {visible.length ? (
        <ul className="grid gap-0.5">
          {visible.map((label) => {
            const expanded = open.has(label.name) || Boolean(term);
            return (
              <li key={label.name}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => toggle(label.name)}
                  className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm font-medium text-ink transition hover:bg-ink/5"
                >
                  <ChevronRight
                    className={cn(
                      "size-3.5 shrink-0 text-muted transition-transform",
                      expanded && "rotate-90"
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
                    {label.name}
                  </span>
                  <span className="text-xs text-muted">{label.valueCount.toLocaleString()}</span>
                </button>
                {expanded ? (
                  <ul className="mb-1 ml-[1.15rem] grid gap-0.5 border-l border-line pl-2">
                    {label.values.map((value) => {
                      const active = activeMatchers.some(
                        (matcher) =>
                          matcher.label === label.name &&
                          matcher.operator === "=" &&
                          matcher.value === value.value
                      );
                      return (
                        <li key={value.value}>
                          <button
                            type="button"
                            aria-pressed={active}
                            onClick={() => onSelect(label.name, value.value)}
                            className={cn(
                              "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-muted transition hover:bg-ink/5 hover:text-ink",
                              active && "bg-lavender-soft font-semibold text-violet-strong"
                            )}
                          >
                            <span className="min-w-0 flex-1 truncate font-mono">{value.value}</span>
                            <span className="shrink-0">{value.streams.toLocaleString()}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-2 text-sm text-muted">No labels</p>
      )}
    </div>
  );
}
