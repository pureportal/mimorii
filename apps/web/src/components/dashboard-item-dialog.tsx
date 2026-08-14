import {
  dashboardIncidentLimits,
  dashboardMetrics,
  dashboardWidths,
  type DashboardItem,
  type DashboardItemType,
  type DashboardMetric,
  type DashboardWidth,
  type DashboardWindowDays,
  type ResourceSummary,
} from "@mimorii/contracts";
import { useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";
import { Field, FieldLabel } from "./ui/field";
import { Input, Select } from "./ui/input";

const defaultTitles: Record<DashboardItemType, string> = {
  metric: "Uptime",
  uptime: "Uptime history",
  status: "Current status",
  incidents: "Recent incidents",
};

const metricLabels: Record<DashboardMetric, string> = {
  uptime: "Uptime",
  averageLatency: "Average latency",
  monitorCount: "Monitor count",
  openIncidents: "Open incidents",
};

export function DashboardItemDialog({
  open,
  item,
  resources,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  item: DashboardItem | null;
  resources: ResourceSummary[];
  onOpenChange: (open: boolean) => void;
  onSave: (item: DashboardItem) => void;
}) {
  const [type, setType] = useState<DashboardItemType>(item?.type ?? "metric");
  const [title, setTitle] = useState(item?.title ?? defaultTitles.metric);
  const [width, setWidth] = useState<DashboardWidth>(item?.width ?? 1);
  const [metric, setMetric] = useState<DashboardMetric>(
    item?.type === "metric" ? item.metric : "uptime"
  );
  const [resourceId, setResourceId] = useState(item?.resourceId ?? "");
  const [windowDays, setWindowDays] = useState<DashboardWindowDays>(
    item?.type === "metric" || item?.type === "uptime" ? item.windowDays : 30
  );
  const [limit, setLimit] = useState<3 | 5 | 10>(item?.type === "incidents" ? item.limit : 5);

  function changeType(next: DashboardItemType) {
    setType(next);
    setTitle(defaultTitles[next]);
    if (next === "uptime" && windowDays === 1) setWindowDays(30);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const base = {
      id: item?.id ?? crypto.randomUUID(),
      title: title.trim(),
      width,
    };
    if (type === "metric") {
      onSave({
        ...base,
        type,
        metric,
        resourceId: resourceId || null,
        windowDays: metric === "uptime" || metric === "averageLatency" ? windowDays : 1,
      });
    } else if (type === "uptime") {
      onSave({
        ...base,
        type,
        resourceId,
        windowDays: windowDays === 1 ? 30 : windowDays,
      });
    } else if (type === "status") {
      onSave({ ...base, type, resourceId });
    } else {
      onSave({ ...base, type, resourceId: resourceId || null, limit });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={item ? "Edit panel" : "Add panel"} />
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="dashboard-item-type">Type</FieldLabel>
              <Select
                id="dashboard-item-type"
                value={type}
                onChange={(event) => changeType(parseItemType(event.target.value))}
              >
                <option value="metric">Metric</option>
                <option value="uptime" disabled={!resources.length}>
                  Uptime history
                </option>
                <option value="status" disabled={!resources.length}>
                  Current status
                </option>
                <option value="incidents">Recent incidents</option>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="dashboard-item-width">Width</FieldLabel>
              <Select
                id="dashboard-item-width"
                value={width}
                onChange={(event) => setWidth(parseWidth(event.target.value))}
              >
                {dashboardWidths.map((value) => (
                  <option key={value} value={value}>
                    {value} {value === 1 ? "column" : "columns"}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="dashboard-item-title">Title</FieldLabel>
            <Input
              id="dashboard-item-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={80}
            />
          </Field>

          {type === "metric" ? (
            <Field>
              <FieldLabel htmlFor="dashboard-item-metric">Metric</FieldLabel>
              <Select
                id="dashboard-item-metric"
                value={metric}
                onChange={(event) => setMetric(parseMetric(event.target.value))}
              >
                {dashboardMetrics.map((value) => (
                  <option key={value} value={value}>
                    {metricLabels[value]}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {type !== "metric" || resources.length ? (
            <Field>
              <FieldLabel htmlFor="dashboard-item-resource">Resource</FieldLabel>
              <Select
                id="dashboard-item-resource"
                value={resourceId}
                required={type === "uptime" || type === "status"}
                onChange={(event) => setResourceId(event.target.value)}
              >
                {type === "metric" || type === "incidents" ? (
                  <option value="">All resources</option>
                ) : (
                  <option value="" disabled>
                    Select resource
                  </option>
                )}
                {resources.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {type === "uptime" ||
          (type === "metric" && (metric === "uptime" || metric === "averageLatency")) ? (
            <Field>
              <FieldLabel htmlFor="dashboard-item-window">Window</FieldLabel>
              <Select
                id="dashboard-item-window"
                value={windowDays}
                onChange={(event) => setWindowDays(parseWindowDays(event.target.value))}
              >
                {([1, 7, 30, 90] as const)
                  .filter((value) => type === "metric" || value !== 1)
                  .map((value) => (
                    <option key={value} value={value}>
                      {value === 1 ? "24 hours" : `${value} days`}
                    </option>
                  ))}
              </Select>
            </Field>
          ) : null}

          {type === "incidents" ? (
            <Field>
              <FieldLabel htmlFor="dashboard-item-limit">Incidents</FieldLabel>
              <Select
                id="dashboard-item-limit"
                value={limit}
                onChange={(event) => setLimit(parseIncidentLimit(event.target.value))}
              >
                {dashboardIncidentLimits.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Button type="submit">{item ? "Save panel" : "Add panel"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function parseItemType(value: string): DashboardItemType {
  if (value === "metric" || value === "uptime" || value === "status" || value === "incidents") {
    return value;
  }
  throw new Error("Dashboard item type is invalid");
}

function parseWidth(value: string): DashboardWidth {
  const width = Number(value);
  if (width === 1 || width === 2 || width === 3) return width;
  throw new Error("Dashboard item width is invalid");
}

function parseMetric(value: string): DashboardMetric {
  if (
    value === "uptime" ||
    value === "averageLatency" ||
    value === "monitorCount" ||
    value === "openIncidents"
  ) {
    return value;
  }
  throw new Error("Dashboard metric is invalid");
}

function parseWindowDays(value: string): DashboardWindowDays {
  const days = Number(value);
  if (days === 1 || days === 7 || days === 30 || days === 90) return days;
  throw new Error("Dashboard window is invalid");
}

function parseIncidentLimit(value: string): 3 | 5 | 10 {
  const limit = Number(value);
  if (limit === 3 || limit === 5 || limit === 10) return limit;
  throw new Error("Dashboard incident limit is invalid");
}
