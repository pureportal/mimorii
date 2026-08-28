import type { ResourceSummary } from "@mimorii/contracts";
import { Check } from "lucide-react";
import { cn } from "../lib/cn";
import { resourceOptionLabels } from "../lib/resource-option-labels";

export function ResourcePicker({
  resources,
  value,
  onChange,
}: {
  resources: ResourceSummary[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const labels = resourceOptionLabels(resources);

  return (
    <div className="grid max-h-52 gap-1 overflow-y-auto rounded-xl border border-line p-1.5">
      {resources.map((resource) => {
        const selected = value.includes(resource.id);
        return (
          <button
            key={resource.id}
            type="button"
            aria-pressed={selected}
            onClick={() =>
              onChange(
                selected ? value.filter((id) => id !== resource.id) : [...value, resource.id]
              )
            }
            className={cn(
              "flex min-h-10 items-center gap-3 rounded-lg px-2.5 text-left text-sm transition hover:bg-ink/5",
              selected && "bg-lavender-soft"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "grid size-5 place-items-center rounded-md border border-line bg-surface",
                selected && "border-lavender bg-lavender text-night"
              )}
            >
              {selected ? <Check className="size-3.5" /> : null}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{labels.get(resource.id)}</span>
          </button>
        );
      })}
    </div>
  );
}
