import type { IncidentSummary } from "@mimorii/contracts";
import { Activity, ArrowUpRight, Pencil, Send } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { appRoutes } from "../lib/app-navigation";
import { formatCount, formatDuration, formatRelative } from "../lib/format";
import { EmptyState } from "./page-state";
import { StatusBadge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";

export function IncidentList({
  incidents,
  resourceNames,
  canManage,
  onEdit,
  onUpdate,
}: {
  incidents: IncidentSummary[];
  resourceNames: ReadonlyMap<string, string>;
  canManage: boolean;
  onEdit: (incident: IncidentSummary) => void;
  onUpdate: (incident: IncidentSummary) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(20);

  if (!incidents.length) return <EmptyState title="No incidents" illustration="empty" />;

  const visibleIncidents = incidents
    .toSorted(
      (left, right) =>
        Number(left.status === "resolved") - Number(right.status === "resolved") ||
        right.startedAt.localeCompare(left.startedAt)
    )
    .slice(0, visibleCount);

  return (
    <div className="grid gap-4">
      {visibleIncidents.map((incident) => (
        <IncidentCard
          key={incident.id}
          incident={incident}
          resourceNames={resourceNames}
          canManage={canManage}
          onEdit={onEdit}
          onUpdate={onUpdate}
        />
      ))}
      {visibleIncidents.length < incidents.length ? (
        <Button
          variant="outline"
          className="justify-self-center"
          onClick={() => setVisibleCount((count) => count + 20)}
        >
          Load more
        </Button>
      ) : null}
    </div>
  );
}

function IncidentCard({
  incident,
  resourceNames,
  canManage,
  onEdit,
  onUpdate,
}: {
  incident: IncidentSummary;
  resourceNames: ReadonlyMap<string, string>;
  canManage: boolean;
  onEdit: (incident: IncidentSummary) => void;
  onUpdate: (incident: IncidentSummary) => void;
}) {
  const latest = incident.updates[0];

  return (
    <article>
      <Card className="overflow-hidden">
        <CardHeader className="gap-5 pb-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="min-w-0 font-display text-lg font-bold">{incident.title}</h3>
              <StatusBadge status={incident.status} />
              <StatusBadge status={incident.impact} />
            </div>
            <p className="mt-2 text-xs text-muted">
              {incident.resources
                .map((resource) => resourceNames.get(resource.id) ?? resource.name)
                .join(", ")}{" "}
              · {formatRelative(incident.startedAt)} · {formatDuration(incident.durationSeconds)}
            </p>
          </div>

          <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
            {incident.checkId && incident.checkName ? (
              <Button asChild variant="outline" size="sm" className="max-w-full justify-start">
                <Link
                  to={appRoutes.check(incident.checkId)}
                  aria-label={`Open check ${incident.checkName}`}
                >
                  <Activity />
                  <span className="text-muted">Check</span>
                  <span className="max-w-48 truncate">{incident.checkName}</span>
                  <ArrowUpRight className="shrink-0" />
                </Link>
              </Button>
            ) : null}
            {canManage ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => onEdit(incident)}>
                  <Pencil /> Edit
                </Button>
                {incident.status !== "resolved" ? (
                  <Button variant="outline" size="sm" onClick={() => onUpdate(incident)}>
                    <Send /> Update
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </CardHeader>

        {latest ? (
          <CardContent className="border-t border-line bg-ink/[.015] p-4 sm:px-5">
            <div className="grid gap-1.5">
              {latest.message ? <p className="text-sm leading-6">{latest.message}</p> : null}
              <p className="text-xs text-muted">{formatRelative(latest.createdAt)}</p>
            </div>
            {incident.updates.length > 1 ? (
              <details className="mt-3 border-t border-line pt-3">
                <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-ink">
                  {formatCount(incident.updates.length - 1, "earlier update")}
                </summary>
                <div className="mt-3 grid gap-3 border-l border-line pl-4">
                  {incident.updates.slice(1).map((update) => (
                    <div key={update.id}>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={update.status} />
                        <span className="text-xs text-muted">
                          {formatRelative(update.createdAt)}
                        </span>
                      </div>
                      {update.message ? <p className="mt-1 text-sm">{update.message}</p> : null}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </CardContent>
        ) : null}
      </Card>
    </article>
  );
}
