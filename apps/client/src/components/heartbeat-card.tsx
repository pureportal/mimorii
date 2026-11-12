import type { HeartbeatMonitorSummary } from "@mimorii/contracts";
import { Radio } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { appRoutes } from "../lib/app-navigation";
import {
  FoxytailHighlights,
  HeartbeatFacts,
  HeartbeatProblems,
  HeartbeatStateLine,
  HeartbeatStatusBadge,
  HeartbeatTimeline,
} from "./heartbeat-insights";
import { Card } from "./ui/card";

export function HeartbeatCard({
  heartbeat,
  resourceName,
  foxytail,
  actions,
}: {
  heartbeat: HeartbeatMonitorSummary;
  resourceName: string;
  foxytail: boolean;
  actions: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
          <Radio className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="truncate font-display text-base font-bold">{heartbeat.name}</h3>
            <HeartbeatStatusBadge heartbeat={heartbeat} />
          </div>
          <p className="mt-0.5 text-xs text-muted">
            <Link to={appRoutes.resource(heartbeat.resourceId)} className="hover:text-ink">
              {resourceName}
            </Link>
            {" · "}every {formatInterval(heartbeat.intervalSeconds)}
          </p>
        </div>
        <div className="shrink-0">{actions}</div>
      </div>
      <div className="mt-4 space-y-4 border-t border-line pt-4">
        <HeartbeatStateLine heartbeat={heartbeat} />
        <HeartbeatProblems heartbeat={heartbeat} />
        <HeartbeatTimeline timeline={heartbeat.timeline} />
        <HeartbeatFacts heartbeat={heartbeat} />
        {foxytail ? <FoxytailHighlights heartbeat={heartbeat} /> : null}
      </div>
    </Card>
  );
}

export function formatInterval(seconds: number): string {
  if (seconds < 3_600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86_400) return `${Number((seconds / 3_600).toFixed(1))} hr`;
  const days = Number((seconds / 86_400).toFixed(1));
  return `${days} ${days === 1 ? "day" : "days"}`;
}
