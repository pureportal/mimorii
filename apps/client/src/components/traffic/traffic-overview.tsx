import type { TrafficReport, TrafficTotals } from "@mimorii/contracts";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "../../lib/cn";
import { formatMilliseconds, formatPercent } from "../../lib/format";
import { countryFlag, countryName, languageName, percentChange } from "../../lib/traffic";
import { Card, CardContent, CardHeader } from "../ui/card";
import { BreakdownList } from "./breakdown-list";
import { TrafficChart } from "./traffic-chart";

const totalMetrics: Array<{
  key: keyof TrafficTotals;
  label: string;
  format: (value: number | null) => string;
  lowerIsBetter?: boolean;
}> = [
  { key: "visitors", label: "Visitors", format: (value) => (value ?? 0).toLocaleString() },
  { key: "pageviews", label: "Pageviews", format: (value) => (value ?? 0).toLocaleString() },
  { key: "sessions", label: "Visits", format: (value) => (value ?? 0).toLocaleString() },
  { key: "bounceRate", label: "Bounce rate", format: formatPercent, lowerIsBetter: true },
  { key: "averageEngagementMs", label: "Time on page", format: formatMilliseconds },
];

export function TrafficOverview({ report }: { report: TrafficReport }) {
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {totalMetrics.map((metric) => (
          <TotalCard
            key={metric.key}
            label={metric.label}
            value={metric.format(report.totals[metric.key])}
            change={percentChange(report.totals[metric.key], report.previousTotals[metric.key])}
            lowerIsBetter={metric.lowerIsBetter}
          />
        ))}
      </section>

      <Card>
        <CardHeader>
          <h3 className="font-display font-bold">Visitors</h3>
        </CardHeader>
        <CardContent className="h-72 pl-1 sm:pl-3">
          <TrafficChart report={report} />
        </CardContent>
      </Card>

      <section className="grid gap-6 xl:grid-cols-2">
        <BreakdownList
          title="Pages"
          valueLabel="Pageviews"
          items={report.pages.map((page) => ({
            key: page.path,
            label: page.path,
            value: page.pageviews,
            detail:
              page.averageScrollDepth === null ? undefined : `${page.averageScrollDepth}% scrolled`,
          }))}
        />
        <BreakdownList
          title="Sources"
          items={report.referrers.map((row) => ({
            key: row.value,
            label: row.value,
            value: row.visitors,
          }))}
        />
        <BreakdownList
          title="Entry pages"
          valueLabel="Visits"
          items={report.entryPages.map((row) => ({
            key: row.value,
            label: row.value,
            value: row.pageviews,
          }))}
        />
        <BreakdownList
          title="Countries"
          items={report.countries.map((row) => ({
            key: row.value,
            label: `${countryFlag(row.value)} ${countryName(row.value)}`.trim(),
            value: row.visitors,
          }))}
        />
        <BreakdownList
          title="Devices"
          items={report.devices.map((row) => ({
            key: row.value,
            label: <span className="capitalize">{row.value}</span>,
            value: row.visitors,
          }))}
        />
        <BreakdownList
          title="Browsers"
          items={report.browsers.map((row) => ({
            key: row.value,
            label: row.value,
            value: row.visitors,
          }))}
        />
        <BreakdownList
          title="Operating systems"
          items={report.operatingSystems.map((row) => ({
            key: row.value,
            label: row.value,
            value: row.visitors,
          }))}
        />
        <BreakdownList
          title="Languages"
          items={report.languages.map((row) => ({
            key: row.value,
            label: languageName(row.value),
            value: row.visitors,
          }))}
        />
        {report.campaigns.length ? (
          <BreakdownList
            title="Campaigns"
            items={report.campaigns.map((row) => ({
              key: row.value,
              label: row.value,
              value: row.visitors,
            }))}
          />
        ) : null}
        <BreakdownList
          title="Events"
          valueLabel="Count"
          items={report.events.map((row) => ({
            key: row.name,
            label: row.name,
            value: row.count,
            detail: `${row.visitors.toLocaleString()} visitors`,
          }))}
        />
      </section>
    </div>
  );
}

function TotalCard({
  label,
  value,
  change,
  lowerIsBetter = false,
}: {
  label: string;
  value: string;
  change: number | null;
  lowerIsBetter?: boolean;
}) {
  const improving = change !== null && (lowerIsBetter ? change < 0 : change > 0);
  const Icon = change !== null && change < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <Card className="p-5">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-2 font-display text-2xl font-black">{value}</p>
      {change !== null && Math.abs(change) >= 0.5 ? (
        <p
          className={cn(
            "mt-1 flex items-center gap-0.5 text-xs font-semibold",
            improving ? "text-success-strong" : "text-danger"
          )}
          aria-label={`${change > 0 ? "Up" : "Down"} ${Math.abs(change).toFixed(0)}% from previous period`}
        >
          <Icon className="size-3.5" />
          {Math.abs(change).toFixed(0)}%
        </p>
      ) : null}
    </Card>
  );
}
