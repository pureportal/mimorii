import type { AnalyticsReport, CheckSummary, ResourceSummary } from "@mimorii/contracts";
import { useQuery } from "@tanstack/react-query";
import { Activity, Clock3, Gauge, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ErrorState, LoadingState, StateArtwork } from "../components/page-state";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Input, Select } from "../components/ui/input";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { chartColors, chartTooltipStyle } from "../lib/chart-theme";
import { formatCount, formatDuration, formatLatency, formatPercent } from "../lib/format";

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
    (check) => !resourceId || check.resourceId === resourceId
  );

  if (resources.isLoading || checks.isLoading || report.isLoading) return <LoadingState />;
  if (resources.isError || checks.isError || report.isError || !report.data) {
    return <ErrorState retry={() => void report.refetch()} />;
  }
  const data = report.data;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">{formatCount(data.totalResults, "result")}</p>

      <Card data-guide-page="reports-filters" className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          <Select
            value={resourceId}
            onChange={(event) => {
              setResourceId(event.target.value);
              setCheckId("");
            }}
          >
            <option value="">All resources</option>
            {resources.data?.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name}
              </option>
            ))}
          </Select>
          <Select value={checkId} onChange={(event) => setCheckId(event.target.value)}>
            <option value="">All checks</option>
            {availableChecks?.map((check) => (
              <option key={check.id} value={check.id}>
                {check.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <section
        data-guide-page="reports-summary"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
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
        </CardHeader>
        <CardContent className="h-80 pl-1 sm:pl-3">
          {data.daily.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.daily} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="availability" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={chartColors.success} stopOpacity={0.4} />
                    <stop offset="1" stopColor={chartColors.success} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={chartColors.grid} strokeDasharray="4 6" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: chartColors.muted, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: chartColors.muted, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  unit="%"
                  width={45}
                />
                <Tooltip
                  formatter={(value) => [
                    formatPercent(typeof value === "number" ? value : Number(value)),
                    "Availability",
                  ]}
                  contentStyle={chartTooltipStyle}
                />
                <Area
                  type="monotone"
                  dataKey="availabilityPercent"
                  stroke={chartColors.success}
                  strokeWidth={2.5}
                  fill="url(#availability)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-sm text-muted">
              <StateArtwork illustration="analysis" />
              <span>No report data</span>
            </div>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

function dateRange(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  return { from: localDate(from), to: localDate(to) };
}

function localDate(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
