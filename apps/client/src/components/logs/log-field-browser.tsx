import type { LogFieldFilter, LogFieldSummary } from "@mimorii/contracts";
import { ChevronRight, Hash } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/cn";

export function LogFieldBrowser({
  fields,
  search,
  activeFilters,
  onSelect,
}: {
  fields: LogFieldSummary[];
  search: string;
  activeFilters: LogFieldFilter[];
  onSelect: (field: LogFieldSummary, value: string) => void;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const term = search.trim().toLowerCase();
  const visible = fields.filter(
    (field) =>
      !term ||
      field.name.toLowerCase().includes(term) ||
      field.values.some((value) => value.value.toLowerCase().includes(term))
  );

  if (!visible.length) return <p className="px-2 text-sm text-muted">No fields</p>;

  return (
    <ul className="grid gap-0.5">
      {visible.map((field) => {
        const expanded = open.has(field.name) || Boolean(term);
        return (
          <li key={field.name}>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() =>
                setOpen((current) => {
                  const next = new Set(current);
                  if (next.has(field.name)) next.delete(field.name);
                  else next.add(field.name);
                  return next;
                })
              }
              className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm font-medium text-ink transition hover:bg-ink/5"
            >
              <ChevronRight
                className={cn(
                  "size-3.5 shrink-0 text-muted transition-transform",
                  expanded && "rotate-90"
                )}
              />
              <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{field.name}</span>
              {field.numeric ? (
                <Hash className="size-3 shrink-0 text-muted" aria-label="Numeric" />
              ) : null}
              <span className="text-xs text-muted">{field.count.toLocaleString()}</span>
            </button>
            {expanded ? (
              <ul className="mb-1 ml-[1.15rem] grid gap-0.5 border-l border-line pl-2">
                {field.values.map((value) => {
                  const active = activeFilters.some(
                    (filter) =>
                      filter.field === field.name &&
                      filter.operator === "=" &&
                      String(filter.value) === value.value
                  );
                  return (
                    <li key={value.value}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => onSelect(field, value.value)}
                        className={cn(
                          "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-muted transition hover:bg-ink/5 hover:text-ink",
                          active && "bg-lavender-soft font-semibold text-violet-strong"
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate font-mono">{value.value}</span>
                        <span className="shrink-0">{value.count.toLocaleString()}</span>
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
  );
}
