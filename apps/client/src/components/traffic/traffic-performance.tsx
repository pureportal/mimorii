import {
  webVitalNames,
  type TrafficReport,
  type WebVitalName,
  type WebVitalRating,
} from "@mimorii/contracts";
import { formatMilliseconds, formatRelative } from "../../lib/format";
import { StatusBadge } from "../ui/badge";
import { Card, CardContent, CardHeader } from "../ui/card";

const vitalLabels: Record<WebVitalName, string> = {
  LCP: "Largest contentful paint",
  INP: "Interaction to next paint",
  CLS: "Cumulative layout shift",
  FCP: "First contentful paint",
  TTFB: "Time to first byte",
};

const ratingStatus: Record<WebVitalRating, "up" | "degraded" | "down"> = {
  good: "up",
  "needs-improvement": "degraded",
  poor: "down",
};

const ratingLabels: Record<WebVitalRating, string> = {
  good: "Good",
  "needs-improvement": "Needs improvement",
  poor: "Poor",
};

export function TrafficPerformance({ report }: { report: TrafficReport }) {
  const vitals = new Map(report.vitals.map((vital) => [vital.name, vital]));
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {webVitalNames.map((name) => {
          const vital = vitals.get(name);
          return (
            <Card key={name} className="p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold" title={vitalLabels[name]}>
                  {name}
                </p>
                {vital ? (
                  <StatusBadge status={ratingStatus[vital.rating]}>
                    {ratingLabels[vital.rating]}
                  </StatusBadge>
                ) : null}
              </div>
              <p className="mt-3 font-display text-2xl font-black">
                {vital
                  ? name === "CLS"
                    ? vital.p75.toFixed(3)
                    : formatMilliseconds(vital.p75)
                  : "—"}
              </p>
              <p className="mt-1 text-xs text-muted">{vitalLabels[name]}</p>
            </Card>
          );
        })}
      </section>

      <Card>
        <CardHeader>
          <h3 className="font-display font-bold">JavaScript errors</h3>
        </CardHeader>
        <CardContent>
          {report.errors.length ? (
            <ul className="divide-y divide-line">
              {report.errors.map((error) => (
                <li key={error.message} className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-mono text-sm text-danger">{error.message}</p>
                    <p className="mt-1 truncate text-xs text-muted">
                      {[error.path, error.source].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted">
                    <p className="font-semibold text-ink">{error.count.toLocaleString()}×</p>
                    <p>{error.visitors.toLocaleString()} visitors</p>
                    <p>{formatRelative(error.lastSeenAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="grid h-24 place-items-center text-sm text-muted">No errors</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
