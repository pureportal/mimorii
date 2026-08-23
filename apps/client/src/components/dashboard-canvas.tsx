import type {
  DashboardIncidentsViewItem,
  DashboardMetricViewItem,
  DashboardStatusViewItem,
  DashboardUptimeViewItem,
  DashboardViewItem,
} from "@mimorii/contracts";
import {
  Activity,
  Battery,
  Boxes,
  Clock3,
  Cpu,
  Gauge,
  HardDrive,
  MemoryStick,
  TriangleAlert,
} from "lucide-react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { formatLatency, formatPercent, formatRelative } from "../lib/format";
import { cn } from "../lib/cn";
import { StatusBadge } from "./ui/badge";
import { Card } from "./ui/card";

const widthClasses = {
  1: "lg:col-span-1",
  2: "lg:col-span-2",
  3: "lg:col-span-3",
} as const;

export function DashboardCanvas({ items }: { items: DashboardViewItem[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.id} className={widthClasses[item.width]}>
          <DashboardPanel item={item} />
        </div>
      ))}
    </div>
  );
}

function DashboardPanel({ item }: { item: DashboardViewItem }) {
  switch (item.type) {
    case "metric":
      return <MetricPanel item={item} />;
    case "uptime":
      return <UptimePanel item={item} />;
    case "status":
      return <StatusPanel item={item} />;
    case "incidents":
      return <IncidentsPanel item={item} />;
    default:
      return unreachable(item);
  }
}

function unreachable(_value: never): never {
  throw new Error("Unsupported dashboard item");
}

function MetricPanel({ item }: { item: DashboardMetricViewItem }) {
  const Icon = {
    uptime: Gauge,
    averageLatency: Clock3,
    monitorCount: Activity,
    openIncidents: TriangleAlert,
    cpuPercent: Cpu,
    memoryPercent: MemoryStick,
    storagePercent: HardDrive,
    loadAverage: Activity,
    batteryPercent: Battery,
    containerCount: Boxes,
    unhealthyContainerCount: TriangleAlert,
  }[item.metric];
  const value =
    item.format === "percent"
      ? formatPercent(item.value)
      : item.format === "milliseconds"
        ? formatLatency(item.value)
        : (item.value ?? 0).toLocaleString();
  return (
    <Card className="flex min-h-44 flex-col p-5" aria-labelledby={`panel-${item.id}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={`panel-${item.id}`} className="font-display font-bold">
            {item.title}
          </h2>
          {item.resourceName ? (
            <p className="mt-1 text-xs text-muted">{item.resourceName}</p>
          ) : null}
        </div>
        <span className="grid size-10 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
          <Icon className="size-5" />
        </span>
      </div>
      <p className="mt-auto pt-6 font-display text-4xl font-black tracking-tight">{value}</p>
      {item.series.length > 1 ? (
        <div className="mt-3 h-12">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={item.series}>
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--color-lavender)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </Card>
  );
}

function UptimePanel({ item }: { item: DashboardUptimeViewItem }) {
  return (
    <Card className="min-h-44 p-5" aria-labelledby={`panel-${item.id}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={`panel-${item.id}`} className="font-display font-bold">
            {item.title}
          </h2>
          <p className="mt-1 text-xs text-muted">{item.resourceName}</p>
        </div>
        <span className="text-sm font-bold">{formatPercent(item.uptime)}</span>
      </div>
      <div
        className={cn("mt-8 flex h-10", item.windowDays > 30 ? "gap-px" : "gap-1")}
        role="img"
        aria-label={`${item.windowDays}-day uptime for ${item.resourceName}: ${formatPercent(item.uptime)}`}
      >
        {item.dailyUptime.map((day) => (
          <span
            key={day.date}
            aria-hidden="true"
            title={`${day.date}: ${formatPercent(day.uptime)}`}
            className={cn(
              "min-w-0 flex-1 rounded-sm",
              day.uptime == null
                ? "bg-line"
                : day.uptime >= 99.9
                  ? "bg-success"
                  : day.uptime >= 95
                    ? "bg-warning"
                    : "bg-danger"
            )}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted">
        <span>{item.windowDays} days ago</span>
        <span>Today</span>
      </div>
    </Card>
  );
}

function StatusPanel({ item }: { item: DashboardStatusViewItem }) {
  return (
    <Card className="flex min-h-44 flex-col p-5" aria-labelledby={`panel-${item.id}`}>
      <h2 id={`panel-${item.id}`} className="font-display font-bold">
        {item.title}
      </h2>
      <p className="mt-1 text-xs text-muted">{item.resourceName}</p>
      <div className="mt-auto pt-8">
        <StatusBadge status={item.status} />
      </div>
    </Card>
  );
}

function IncidentsPanel({ item }: { item: DashboardIncidentsViewItem }) {
  return (
    <Card className="min-h-44 p-5" aria-labelledby={`panel-${item.id}`}>
      <div>
        <h2 id={`panel-${item.id}`} className="font-display font-bold">
          {item.title}
        </h2>
        {item.resourceName ? <p className="mt-1 text-xs text-muted">{item.resourceName}</p> : null}
      </div>
      {item.incidents.length ? (
        <div className="mt-5 divide-y divide-line">
          {item.incidents.map((incident) => (
            <div key={incident.id} className="flex flex-wrap items-center gap-2 py-3 first:pt-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{incident.title}</p>
                <p className="mt-1 truncate text-xs text-muted">
                  {incident.resources.join(", ")} · {formatRelative(incident.startedAt)}
                </p>
              </div>
              <StatusBadge status={incident.status} />
              <StatusBadge status={incident.impact} />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-8 text-sm text-muted">No incidents</p>
      )}
    </Card>
  );
}
