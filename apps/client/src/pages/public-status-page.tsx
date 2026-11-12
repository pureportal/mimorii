import type { PublicStatusPage } from "@mimorii/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Moon,
  Sun,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ErrorState, LoadingState } from "../components/page-state";
import { StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { ApiError, api, apiAssetUrl, jsonBody } from "../lib/api";
import { formatCount, formatDateTimeRange, formatPercent, formatRelative } from "../lib/format";
import { usePublicTheme } from "../lib/public-theme";
import { statusPagePath } from "../lib/status-page-links";

type PublicIncident = PublicStatusPage["incidents"][number];

const stateDetails = {
  operational: {
    title: "All systems operational",
    icon: CheckCircle2,
    className: "bg-success/10 text-success-strong border-success/20",
  },
  degraded: {
    title: "Degraded performance",
    icon: TriangleAlert,
    className: "bg-warning/12 text-warning-strong border-warning/25",
  },
  outage: {
    title: "Service disruption",
    icon: TriangleAlert,
    className: "bg-danger/10 text-danger border-danger/20",
  },
  maintenance: {
    title: "Maintenance in progress",
    icon: CalendarClock,
    className: "bg-lavender-soft text-violet-strong border-lavender/30",
  },
} as const;

const updateStatusLabels: Record<string, string> = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
};

export function PublicStatusPageView() {
  const { id = "", slug = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = usePublicTheme();
  const [subscribing, setSubscribing] = useState(false);
  const [visibleIncidentCount, setVisibleIncidentCount] = useState(10);
  const page = useQuery({
    queryKey: ["public-status-page", id],
    queryFn: () =>
      api<PublicStatusPage>(
        `/public/status-pages/${encodeURIComponent(id)}/${encodeURIComponent(slug)}`
      ),
    refetchInterval: 60_000,
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });

  useEffect(() => {
    const parameters = new URLSearchParams(location.search);
    const verify = parameters.get("verify");
    const unsubscribe = parameters.get("unsubscribe");
    if (!verify && !unsubscribe) return;
    const action = verify
      ? api(`/public/status-pages/subscriptions/${encodeURIComponent(verify)}/verify`, {
          method: "POST",
        })
      : api(`/public/status-pages/subscriptions/${encodeURIComponent(unsubscribe!)}/unsubscribe`, {
          method: "POST",
        });
    void action
      .then(() => toast.success(verify ? "Subscription confirmed" : "Subscription ended"))
      .catch((error: Error) => toast.error(error.message))
      .finally(() => navigate(location.pathname, { replace: true }));
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!page.data) return;
    const parameters = new URLSearchParams(location.search);
    if (parameters.has("verify") || parameters.has("unsubscribe")) return;
    const pathname = statusPagePath(page.data.id, page.data.slug);
    if (location.pathname === pathname) return;
    void navigate({ pathname, search: location.search, hash: location.hash }, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate, page.data]);

  const data = page.data;
  const accentStyle = data?.accentColor
    ? ({ "--status-accent": data.accentColor } as CSSProperties)
    : undefined;

  return (
    <div
      className="flex min-h-dvh flex-col bg-canvas text-ink"
      data-theme={theme}
      style={{ colorScheme: theme, ...accentStyle }}
    >
      <div className="h-1 bg-[var(--status-accent,var(--color-lavender))]" />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 sm:px-6">
        <header className="flex items-center gap-4 py-6">
          {data?.logoUrl ? (
            <img
              src={apiAssetUrl(data.logoUrl)}
              alt=""
              className="size-11 shrink-0 rounded-xl object-cover"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-2xl font-black tracking-tight sm:text-3xl">
              {data?.name ?? "Status"}
            </h1>
            {data?.description ? (
              <p className="mt-0.5 text-sm text-muted">{data.description}</p>
            ) : null}
          </div>
          {data?.websiteUrl ? (
            <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
              <a href={data.websiteUrl} target="_blank" rel="noreferrer">
                {hostname(data.websiteUrl)} <ExternalLink />
              </a>
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            onClick={toggleTheme}
          >
            {theme === "light" ? <Moon /> : <Sun />}
          </Button>
        </header>
        <main className="flex-1 pb-10">
          {page.isLoading ? (
            <LoadingState />
          ) : page.error instanceof ApiError && page.error.status === 404 ? (
            <Card className="p-8 text-center">
              <h2 className="font-display text-lg font-bold">This status page isn't available</h2>
              <p className="mt-1 text-sm text-muted">
                It may be unpublished or the link may be wrong.
              </p>
            </Card>
          ) : page.isError || !data ? (
            <ErrorState retry={() => void page.refetch()} />
          ) : (
            <StatusPageContent
              data={data}
              subscribing={subscribing}
              visibleIncidentCount={visibleIncidentCount}
              onShowMore={() => setVisibleIncidentCount((count) => count + 10)}
              onSubscribe={async (event) => {
                event.preventDefault();
                const target = event.currentTarget;
                const form = new FormData(target);
                setSubscribing(true);
                try {
                  await api(
                    `/public/status-pages/${encodeURIComponent(data.id)}/${encodeURIComponent(data.slug)}/subscribers`,
                    { method: "POST", ...jsonBody({ email: form.get("email") }) }
                  );
                  target.reset();
                  toast.success("Check your email");
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "Subscription could not be created"
                  );
                } finally {
                  setSubscribing(false);
                }
              }}
            />
          )}
        </main>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-5 text-xs text-muted">
          <span>
            Powered by{" "}
            <Link to="/" className="font-semibold text-ink hover:text-violet-strong">
              Mimorii
            </Link>
          </span>
          <Link to="/privacy" className="font-semibold hover:text-ink">
            Privacy
          </Link>
        </footer>
      </div>
    </div>
  );
}

function StatusPageContent({
  data,
  subscribing,
  visibleIncidentCount,
  onShowMore,
  onSubscribe,
}: {
  data: PublicStatusPage;
  subscribing: boolean;
  visibleIncidentCount: number;
  onShowMore: () => void;
  onSubscribe: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const state = stateDetails[data.state];
  const StateIcon = state.icon;
  const componentNames = duplicateComponentNames(data.components);
  const active = data.incidents
    .filter((incident) => incident.status !== "resolved")
    .toSorted((left, right) => right.startedAt.localeCompare(left.startedAt));
  const past = data.incidents
    .filter((incident) => incident.status === "resolved")
    .toSorted((left, right) => right.startedAt.localeCompare(left.startedAt));

  return (
    <div className="space-y-6">
      <section className={`flex items-center gap-3 rounded-2xl border p-5 ${state.className}`}>
        <StateIcon className="size-6 shrink-0" />
        <h2 className="font-display text-lg font-bold">{state.title}</h2>
        <span className="ml-auto text-xs opacity-80">Updated {formatRelative(data.updatedAt)}</span>
      </section>

      <Card className="divide-y divide-line">
        {data.components.map((component) => (
          <div key={component.id} className="p-5">
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-semibold">{componentNames.get(component.id)}</h3>
              <div className="flex items-center gap-3">
                {data.showUptime ? (
                  <span className="text-xs font-semibold text-muted">
                    {formatPercent(component.uptime30d)}
                  </span>
                ) : null}
                <StatusBadge status={component.status} />
              </div>
            </div>
            {data.showUptime ? (
              <>
                <div className="mt-4 flex h-8 items-end gap-1" aria-label="30 day uptime">
                  {component.dailyUptime.map((day) => (
                    <span
                      key={day.date}
                      title={`${day.date}: ${day.uptime === null ? "No data" : formatPercent(day.uptime)}`}
                      className={`min-w-0 flex-1 rounded-sm ${
                        day.uptime === null
                          ? "h-1.5 bg-line"
                          : `h-full ${day.uptime >= 99.9 ? "bg-success" : day.uptime >= 95 ? "bg-warning" : "bg-danger"}`
                      }`}
                    />
                  ))}
                </div>
                <div className="mt-1.5 flex justify-between text-[11px] text-muted">
                  <span>30 days ago</span>
                  <span>Today</span>
                </div>
              </>
            ) : null}
          </div>
        ))}
      </Card>

      {data.maintenance.length ? (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold">Maintenance</h2>
          {data.maintenance.map((window) => (
            <Card key={window.id} className="p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">{window.name}</h3>
                <StatusBadge status={window.status} />
              </div>
              <p className="mt-2 text-sm text-muted">
                {formatDateTimeRange(
                  window.nextStartsAt ?? window.startsAt,
                  window.nextEndsAt ?? window.endsAt
                )}
              </p>
            </Card>
          ))}
        </section>
      ) : null}

      {active.length ? <IncidentSection title="Active incidents" incidents={active} /> : null}
      {past.length ? (
        <IncidentSection
          title="Past incidents"
          incidents={past.slice(0, visibleIncidentCount)}
          footer={
            visibleIncidentCount < past.length ? (
              <div className="flex justify-center pt-1">
                <Button variant="outline" onClick={onShowMore}>
                  Load more
                </Button>
              </div>
            ) : null
          }
        />
      ) : null}

      {data.subscriptionsEnabled ? (
        <Card className="p-5">
          <form onSubmit={(event) => void onSubscribe(event)}>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                aria-label="Email address"
                name="email"
                type="email"
                required
                placeholder="Email address"
              />
              <Button
                type="submit"
                disabled={subscribing}
                className="shrink-0 bg-[var(--status-accent,var(--color-coral))] text-night hover:opacity-90"
              >
                <Bell /> Subscribe
              </Button>
            </div>
            <Link
              to="/privacy"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-xs font-semibold text-violet-strong"
            >
              Privacy policy
            </Link>
          </form>
        </Card>
      ) : null}
    </div>
  );
}

function IncidentSection({
  title,
  incidents,
  footer,
}: {
  title: string;
  incidents: PublicIncident[];
  footer?: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {incidents.map((incident) => {
        const [latest, ...earlier] = incident.updates;
        return (
          <Card key={incident.id} className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="mr-auto font-semibold">{incident.title}</h3>
              <StatusBadge status={incident.status} />
              <StatusBadge status={incident.impact} />
            </div>
            {latest ? (
              <div className="mt-4 border-l border-line pl-4">
                <p className="text-sm leading-6">{latest.message}</p>
                <p className="mt-1 text-xs text-muted">
                  {updateStatusLabels[latest.status] ?? latest.status} ·{" "}
                  {formatRelative(latest.createdAt)}
                </p>
              </div>
            ) : null}
            {earlier.length ? (
              <details className="mt-3">
                <summary className="text-xs font-semibold text-muted">
                  {formatCount(earlier.length, "earlier update")}
                </summary>
                <div className="mt-3 grid gap-4 border-l border-line pl-4">
                  {earlier.toReversed().map((update) => (
                    <div key={update.id}>
                      <p className="text-sm leading-6">{update.message}</p>
                      <p className="mt-1 text-xs text-muted">
                        {updateStatusLabels[update.status] ?? update.status} ·{" "}
                        {formatRelative(update.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </Card>
        );
      })}
      {footer}
    </section>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function duplicateComponentNames(
  components: PublicStatusPage["components"]
): ReadonlyMap<string, string> {
  const totals = new Map<string, number>();
  for (const component of components) {
    totals.set(component.name, (totals.get(component.name) ?? 0) + 1);
  }

  const positions = new Map<string, number>();
  return new Map(
    components.map((component) => {
      const position = (positions.get(component.name) ?? 0) + 1;
      positions.set(component.name, position);
      const name =
        (totals.get(component.name) ?? 0) > 1 ? `${component.name} ${position}` : component.name;
      return [component.id, name];
    })
  );
}
