import type { AnalyticsReport, CheckSummary, ResourceSummary } from "@mimorii/contracts";
import { useQuery } from "@tanstack/react-query";
import { Activity, Clock3, Gauge, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { ErrorState, LoadingState, StateArtwork } from "../components/page-state";
import { AvailabilityBars, LatencyArea, type TimelinePoint } from "../components/timeline-charts";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Field, FieldLabel } from "../components/ui/field";
import { Input, Select } from "../components/ui/input";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/cn";
import { isHealthCheckType } from "../lib/check-health";
import { formatCount, formatDuration, formatLatency, formatPercent } from "../lib/format";
import { resourceOptionLabels } from "../lib/resource-option-labels";
import { ExportMenu } from "../components/export-menu";

export function AnalyticsPage() {
  const { activeTeam } = useAuth();
  const teamId = activeTeam!.id;
  const defaults = useMemo(() => dateRange(30), []);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [resourceId, setResourceId] = useState("");
  const [checkId, setCheckId] = useState("");
  const resources = useQuery({
    queryKey: ["resources", teamId],
    queryFn: () => api<ResourceSummary[]>(`/teams/${teamId}/resources`),
  });
  const checks = useQuery({
    queryKey: ["checks", teamId],
    queryFn: () => api<CheckSummary[]>(`/teams/${teamId}/checks`),
  });
  const report = useQuery({
    queryKey: ["analytics-report", teamId, from, to, resourceId, checkId],
    queryFn: () => {
      const parameters = new URLSearchParams({
        from: new Date(`${from}T00:00:00`).toISOString(),
        to: new Date(`${to}T23:59:59.999`).toISOString(),
      });
      if (resourceId) parameters.set("resourceId", resourceId);
      if (checkId) parameters.set("checkId", checkId);
      return api<AnalyticsReport>(`/teams/${teamId}/analytics/report?${parameters}`);
    },
  });
  const availableChecks = checks.data?.filter(
    (check) => !isHealthCheckType(check.type) && (!resourceId || check.resourceId === resourceId)
  );
  const resourceNames = resourceOptionLabels(resources.data ?? []);

  if (resources.isLoading || checks.isLoading || report.isLoading) return <LoadingState />;
  if (resources.isError || checks.isError || report.isError || !report.data) {
    return <ErrorState retry={() => void report.refetch()} />;
  }
  const data = report.data;
  const timeline = dailyTimeline(data);
  const hasLatency = timeline.some((day) => day.latencyMs !== null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Report range" className="flex flex-wrap gap-1.5">
          {rangePresets.map((days) => {
            const range = dateRange(days);
            const selected = range.from === from && range.to === to;
            return (
              <Button
                key={days}
                type="button"
                size="sm"
                variant={selected ? "outline" : "ghost"}
                aria-pressed={selected}
                className={cn(selected && "border-lavender text-violet-strong")}
                onClick={() => {
                  setFrom(range.from);
                  setTo(range.to);
                }}
              >
                {days} days
              </Button>
            );
          })}
        </div>
        <ExportMenu
          choices={[
            { dataset: "availability", label: "Daily availability" },
            { dataset: "check-results", label: "Check results" },
            { dataset: "incidents", label: "Incidents" },
          ]}
          parameters={{
            from: new Date(`${from}T00:00:00`).toISOString(),
            to: new Date(`${to}T23:59:59.999`).toISOString(),
            resourceId,
            checkId,
          }}
        />
      </div>

      <Card data-guide-page="reports-filters" className="p-4">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="report-from">From</FieldLabel>
            <Input
              id="report-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="report-to">To</FieldLabel>
            <Input
              id="report-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </Field>
          <Field className="col-span-2 xl:col-span-1">
            <FieldLabel htmlFor="report-resource">Resource</FieldLabel>
            <Select
              id="report-resource"
              value={resourceId}
              onChange={(event) => {
                setResourceId(event.target.value);
                setCheckId("");
              }}
            >
              <option value="">All resources</option>
              {resources.data?.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resourceNames.get(resource.id)}
                </option>
              ))}
            </Select>
          </Field>
          <Field className="col-span-2 xl:col-span-1">
            <FieldLabel htmlFor="report-check">Check</FieldLabel>
            <Select
              id="report-check"
              value={checkId}
              onChange={(event) => {
                const selectedCheckId = event.target.value;
                setCheckId(selectedCheckId);
                if (!selectedCheckId) return;
                const selectedCheck = availableChecks?.find(
                  (check) => check.id === selectedCheckId
                );
                if (!selectedCheck) throw new Error("Check is unavailable");
                setResourceId(selectedCheck.resourceId);
              }}
            >
              <option value="">All checks</option>
              {availableChecks?.map((check) => (
                <option key={check.id} value={check.id}>
                  {checkOptionLabel(check, resourceNames, Boolean(resourceId))}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <section data-guide-page="reports-summary" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric icon={Gauge} label="Availability" value={formatPercent(data.availabilityPercent)} />
        <Metric icon={Clock3} label="P95 latency" value={formatLatency(data.latencyP95Ms)} />
        <Metric icon={TriangleAlert} label="Incidents" value={String(data.incidentCount)} />
        <Metric
          icon={Activity}
          label="Average recovery"
          value={
            data.meanTimeToRecoverySeconds === null
              ? "—"
              : formatDuration(Math.round(data.meanTimeToRecoverySeconds))
          }
        />
      </section>

      <Card data-guide-page="reports-chart">
        <CardHeader>
          <h3 className="font-display font-bold">Availability</h3>
          <span className="text-xs text-muted">{formatCount(data.totalResults, "result")}</span>
        </CardHeader>
        <CardContent className="h-72 pl-1 sm:pl-3">
          {data.daily.length ? (
            <AvailabilityBars points={timeline} showAxes />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-sm text-muted">
              <StateArtwork illustration="analysis" />
              <span>No report data</span>
            </div>
          )}
        </CardContent>
      </Card>

      {hasLatency ? (
        <Card>
          <CardHeader>
            <h3 className="font-display font-bold">Response time</h3>
          </CardHeader>
          <CardContent className="h-56 pl-1 sm:pl-3">
            <LatencyArea points={timeline} />
          </CardContent>
        </Card>
      ) : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Detail label="P50 latency" value={formatLatency(data.latencyP50Ms)} />
        <Detail label="P99 latency" value={formatLatency(data.latencyP99Ms)} />
        <Detail label="Degraded" value={formatPercent(data.degradedPercent)} />
        <Detail
          label="Mean between failures"
          value={
            data.meanTimeBetweenFailuresSeconds === null
              ? "—"
              : formatDuration(Math.round(data.meanTimeBetweenFailuresSeconds))
          }
        />
      </section>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3 text-sm font-medium text-muted">
        <span className="grid size-9 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
          <Icon className="size-4" />
        </span>
        {label}
      </div>
      <p className="mt-4 font-display text-2xl font-black">{value}</p>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-2 font-display text-xl font-bold">{value}</p>
    </Card>
  );
}

function checkOptionLabel(
  check: Pick<CheckSummary, "name" | "resourceId">,
  resourceNames: ReadonlyMap<string, string>,
  resourceSelected: boolean
): string {
  if (resourceSelected) return check.name;
  const resourceName = resourceNames.get(check.resourceId);
  if (!resourceName) throw new Error("Check resource is unavailable");
  return `${check.name} · ${resourceName}`;
}

const DAY_MS = 86_400_000;
const rangePresets = [7, 30, 90] as const;

function dailyTimeline(report: AnalyticsReport): TimelinePoint[] {
  const days = new Map(report.daily.map((day) => [day.date, day]));
  const first = Date.parse(`${report.from.slice(0, 10)}T00:00:00.000Z`);
  const last = Date.parse(`${report.to.slice(0, 10)}T00:00:00.000Z`);
  const points: TimelinePoint[] = [];
  for (let time = first; time <= last; time += DAY_MS) {
    const date = new Date(time);
    const key = date.toISOString().slice(0, 10);
    const day = days.get(key);
    points.push({
      key,
      label: date.toLocaleDateString([], { month: "short", day: "numeric", timeZone: "UTC" }),
      detail: date.toLocaleDateString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }),
      up: day?.up ?? 0,
      degraded: day?.degraded ?? 0,
      down: day?.down ?? 0,
      latencyMs: day?.averageLatencyMs ?? null,
    });
  }
  return points;
}

function dateRange(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  return { from: localDate(from), to: localDate(to) };
}

function localDate(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
