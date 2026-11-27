import type { TrafficLive, TrafficReport, TrafficSiteSummary } from "@mimorii/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../components/page-state";
import { TrafficHeatmaps } from "../components/traffic/traffic-heatmaps";
import { TrafficOverview } from "../components/traffic/traffic-overview";
import { TrafficPerformance } from "../components/traffic/traffic-performance";
import { TrafficSetup } from "../components/traffic/traffic-setup";
import { Button } from "../components/ui/button";
import { api } from "../lib/api";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/cn";
import { trafficRangeParameters, trafficRanges, type TrafficRangeId } from "../lib/traffic";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "heatmaps", label: "Heatmaps" },
  { id: "performance", label: "Performance" },
  { id: "setup", label: "Setup" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function TrafficSitePage() {
  const { id = "" } = useParams();
  const { activeTeam } = useAuth();
  const teamId = activeTeam!.id;
  const canManage = activeTeam!.role === "owner" || activeTeam!.role === "admin";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: TabId =
    tabs.find((candidate) => candidate.id === searchParams.get("tab"))?.id ?? "overview";
  const [rangeId, setRangeId] = useState<TrafficRangeId>("7d");
  const [range, setRange] = useState(() => trafficRangeParameters("7d"));
  const site = useQuery({
    queryKey: ["traffic-site", teamId, id],
    queryFn: () => api<TrafficSiteSummary>(`/teams/${teamId}/traffic/sites/${id}`),
    refetchInterval: (query) => (query.state.data?.lastEventAt ? 60_000 : 5_000),
  });
  const report = useQuery({
    queryKey: ["traffic-report", teamId, id, range.toString()],
    queryFn: () => api<TrafficReport>(`/teams/${teamId}/traffic/sites/${id}/report?${range}`),
    enabled: tab !== "setup",
  });
  const live = useQuery({
    queryKey: ["traffic-live", teamId, id],
    queryFn: () => api<TrafficLive>(`/teams/${teamId}/traffic/sites/${id}/live`),
    refetchInterval: 15_000,
  });

  if (site.isLoading) return <LoadingState />;
  if (site.isError || !site.data) return <ErrorState retry={() => void site.refetch()} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2">
            <Link to={appRoutes.traffic}>
              <ArrowLeft /> Traffic
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-3xl font-black tracking-tight">
              <Link to={appRoutes.resource(site.data.resourceId)} className="hover:underline">
                {site.data.resourceName}
              </Link>
            </h2>
            <span className="flex items-center gap-1.5 rounded-full bg-success/12 px-2.5 py-1 text-xs font-semibold text-success-strong">
              <span
                className={cn(
                  "size-2 rounded-full",
                  live.data?.visitors ? "animate-pulse bg-success" : "bg-ink/20"
                )}
              />
              {(live.data?.visitors ?? 0).toLocaleString()} online
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">{site.data.domains.join(", ")}</p>
        </div>
        {tab !== "setup" ? (
          <div role="group" aria-label="Range" className="flex flex-wrap gap-1.5">
            {trafficRanges.map((candidate) => (
              <Button
                key={candidate.id}
                type="button"
                size="sm"
                variant={rangeId === candidate.id ? "outline" : "ghost"}
                aria-pressed={rangeId === candidate.id}
                className={cn(rangeId === candidate.id && "border-lavender text-violet-strong")}
                onClick={() => {
                  setRangeId(candidate.id);
                  setRange(trafficRangeParameters(candidate.id));
                }}
              >
                {candidate.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <div
        role="tablist"
        aria-label="Traffic views"
        className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1.5"
      >
        {tabs.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            role="tab"
            aria-selected={tab === candidate.id}
            className={cn(
              "flex h-9 shrink-0 items-center rounded-xl px-3.5 text-sm font-semibold text-muted transition hover:bg-ink/5 hover:text-ink",
              tab === candidate.id && "bg-lavender-soft text-violet-strong"
            )}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              if (candidate.id === "overview") next.delete("tab");
              else next.set("tab", candidate.id);
              setSearchParams(next, { replace: true });
            }}
          >
            {candidate.label}
          </button>
        ))}
      </div>

      {tab === "setup" ? (
        <TrafficSetup
          teamId={teamId}
          site={site.data}
          canManage={canManage}
          onChanged={async () => {
            await queryClient.invalidateQueries({ queryKey: ["traffic-site", teamId, id] });
            await queryClient.invalidateQueries({ queryKey: ["traffic-sites", teamId] });
          }}
          onDeleted={() => {
            void queryClient.invalidateQueries({ queryKey: ["traffic-sites", teamId] });
            void navigate(appRoutes.traffic);
          }}
        />
      ) : report.isLoading ? (
        <LoadingState />
      ) : report.isError || !report.data ? (
        <ErrorState retry={() => void report.refetch()} />
      ) : tab === "heatmaps" ? (
        <TrafficHeatmaps teamId={teamId} site={site.data} report={report.data} range={range} />
      ) : tab === "performance" ? (
        <TrafficPerformance report={report.data} />
      ) : (
        <TrafficOverview report={report.data} />
      )}
    </div>
  );
}
