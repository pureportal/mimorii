import {
  trafficDevices,
  type TrafficDevice,
  type TrafficHeatmap,
  type TrafficHeatmapLink,
  type TrafficReport,
  type TrafficSiteSummary,
} from "@mimorii/contracts";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Flame } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, jsonBody } from "../../lib/api";
import { cn } from "../../lib/cn";
import { LoadingState } from "../page-state";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Select } from "../ui/input";

export function TrafficHeatmaps({
  teamId,
  site,
  report,
  range,
}: {
  teamId: string;
  site: TrafficSiteSummary;
  report: TrafficReport;
  range: URLSearchParams;
}) {
  const [path, setPath] = useState(report.pages[0]?.path ?? "/");
  const [device, setDevice] = useState<TrafficDevice>("desktop");
  const [opening, setOpening] = useState(false);
  const heatmap = useQuery({
    queryKey: ["traffic-heatmap", teamId, site.id, path, device, range.toString()],
    queryFn: () =>
      api<TrafficHeatmap>(
        `/teams/${teamId}/traffic/sites/${site.id}/heatmap?${new URLSearchParams({
          ...Object.fromEntries(range),
          path,
          device,
        })}`
      ),
    enabled: site.heatmapsEnabled,
  });

  async function openOverlay() {
    const opened = window.open("", "_blank");
    setOpening(true);
    try {
      const link = await api<TrafficHeatmapLink>(
        `/teams/${teamId}/traffic/sites/${site.id}/heatmap-link`,
        { method: "POST", ...jsonBody({ path, device }) }
      );
      if (opened) opened.location.href = link.url;
      else window.location.assign(link.url);
    } catch (error) {
      opened?.close();
      toast.error(error instanceof Error ? error.message : "Heatmap could not be opened");
    } finally {
      setOpening(false);
    }
  }

  if (!site.heatmapsEnabled) {
    return <p className="grid h-40 place-items-center text-sm text-muted">Heatmaps are off</p>;
  }
  const maximumClicks = Math.max(
    1,
    ...(heatmap.data?.elements.map((element) => element.clicks) ?? [])
  );
  const pageviews = heatmap.data?.pageviews ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          aria-label="Page"
          value={path}
          onChange={(event) => setPath(event.target.value)}
          className="h-9 w-64"
        >
          {(report.pages.length ? report.pages.map((page) => page.path) : ["/"]).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
        <div role="group" aria-label="Device" className="flex gap-1">
          {trafficDevices.map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={device === value ? "outline" : "ghost"}
              aria-pressed={device === value}
              className={cn("capitalize", device === value && "border-lavender text-violet-strong")}
              onClick={() => setDevice(value)}
            >
              {value}
            </Button>
          ))}
        </div>
        {path.includes(":id") ? null : (
          <Button
            variant="coral"
            size="sm"
            className="ml-auto"
            disabled={opening || !heatmap.data?.clicks}
            onClick={() => void openOverlay()}
          >
            <ExternalLink /> Open heatmap
          </Button>
        )}
      </div>

      {heatmap.isLoading ? (
        <LoadingState />
      ) : heatmap.data ? (
        <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardHeader>
              <h3 className="font-display font-bold">Clicks</h3>
              <span className="text-xs text-muted">
                {heatmap.data.clicks.toLocaleString()} clicks
                {heatmap.data.rageClicks
                  ? ` · ${heatmap.data.rageClicks.toLocaleString()} rage clicks`
                  : ""}
              </span>
            </CardHeader>
            <CardContent>
              {heatmap.data.elements.length ? (
                <ul className="space-y-1.5">
                  {heatmap.data.elements.map((element) => (
                    <li
                      key={element.selector}
                      className="relative overflow-hidden rounded-lg px-2.5 py-1.5"
                    >
                      <span
                        aria-hidden
                        className="absolute inset-y-0 left-0 rounded-lg bg-coral/15"
                        style={{ width: `${(element.clicks / maximumClicks) * 100}%` }}
                      />
                      <span className="relative flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {element.label || element.selector}
                          </span>
                          {element.label ? (
                            <span className="block truncate font-mono text-[11px] text-muted">
                              {element.selector}
                            </span>
                          ) : null}
                        </span>
                        <span className="flex shrink-0 items-center gap-2 font-semibold tabular-nums">
                          {element.rageClicks ? (
                            <span
                              className="flex items-center gap-0.5 text-xs text-danger"
                              title="Rage clicks"
                            >
                              <Flame className="size-3.5" />
                              {element.rageClicks}
                            </span>
                          ) : null}
                          {element.clicks.toLocaleString()}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="grid h-24 place-items-center text-sm text-muted">No clicks</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <h3 className="font-display font-bold">Scroll depth</h3>
              <span className="text-xs text-muted">{pageviews.toLocaleString()} pageviews</span>
            </CardHeader>
            <CardContent className="space-y-3">
              {heatmap.data.scroll.map((step) => {
                const share = pageviews ? Math.min(100, (step.pageviews / pageviews) * 100) : 0;
                return (
                  <div key={step.depth}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-medium">{step.depth}%</span>
                      <span className="text-muted">{share.toFixed(0)}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-ink/6">
                      <div
                        className="h-full rounded-full bg-lavender"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
