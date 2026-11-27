import type { AppKind, HeartbeatEventSummary } from "@mimorii/contracts";
import { useState } from "react";
import { appMetricGroups } from "../lib/app-metrics";
import { cn } from "../lib/cn";

const toneText = {
  danger: "text-danger",
  warning: "text-warning-strong",
  success: "text-success-strong",
} as const;

export function AppReportDetails({
  app,
  metadata,
  latest,
}: {
  app: AppKind;
  metadata: HeartbeatEventSummary["metadata"];
  latest: boolean;
}) {
  const [expanded, setExpanded] = useState(latest);
  const groups = appMetricGroups(app, metadata);
  if (!groups.length) return null;
  return (
    <details
      className="mt-2"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="mb-3 cursor-pointer text-xs font-semibold">Details</summary>
      {expanded ? (
        <div className="grid gap-4">
          {groups.map((group) => (
            <section key={group.title}>
              <h4 className="mb-2 text-xs font-semibold">{group.title}</h4>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {group.facts.map((fact) => (
                  <div key={fact.key}>
                    <dt className="text-muted">{fact.label}</dt>
                    <dd
                      className={cn("font-semibold tabular-nums", fact.tone && toneText[fact.tone])}
                    >
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      ) : null}
    </details>
  );
}
