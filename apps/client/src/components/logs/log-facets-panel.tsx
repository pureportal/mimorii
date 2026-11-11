import type {
  LogFieldFilter,
  LogFieldSummary,
  LogLabelMatcher,
  LogLabelSummary,
} from "@mimorii/contracts";
import { Search } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/cn";
import { Input } from "../ui/input";
import { LogFieldBrowser } from "./log-field-browser";
import { LogLabelBrowser } from "./log-label-browser";

type Facet = "labels" | "fields";

export function LogFacetsPanel({
  labels,
  fields,
  activeMatchers,
  activeFields,
  onSelectLabel,
  onSelectField,
}: {
  labels: LogLabelSummary[];
  fields: LogFieldSummary[];
  activeMatchers: LogLabelMatcher[];
  activeFields: LogFieldFilter[];
  onSelectLabel: (label: string, value: string) => void;
  onSelectField: (field: LogFieldSummary, value: string) => void;
}) {
  const [facet, setFacet] = useState<Facet>("labels");
  const [search, setSearch] = useState("");

  return (
    <div className="grid gap-3">
      <div
        role="tablist"
        aria-label="Facets"
        className="grid grid-cols-2 rounded-xl border border-line p-1"
      >
        {(["labels", "fields"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={facet === option}
            onClick={() => setFacet(option)}
            className={cn(
              "h-8 rounded-lg text-xs font-semibold text-muted transition hover:text-ink",
              facet === option && "bg-lavender-soft text-violet-strong"
            )}
          >
            {option === "labels" ? "Labels" : "Fields"}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input
          aria-label={facet === "labels" ? "Search labels" : "Search fields"}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-9 pl-9 text-sm"
        />
      </div>
      {facet === "labels" ? (
        <LogLabelBrowser
          labels={labels}
          search={search}
          activeMatchers={activeMatchers}
          onSelect={onSelectLabel}
        />
      ) : (
        <LogFieldBrowser
          fields={fields}
          search={search}
          activeFilters={activeFields}
          onSelect={onSelectField}
        />
      )}
    </div>
  );
}
