import type { PublicStatusPage } from "@mimorii/contracts";
import { useQuery } from "@tanstack/react-query";
import { Bell, CalendarClock, CheckCircle2, TriangleAlert } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ErrorState, LoadingState } from "../components/page-state";
import { StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { api, jsonBody } from "../lib/api";
import { formatPercent, formatRelative } from "../lib/format";
import { statusPagePath } from "../lib/status-page-links";

export function PublicStatusPageView() {
  const { id = "", slug = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [subscribing, setSubscribing] = useState(false);
  const page = useQuery({
    queryKey: ["public-status-page", id],
    queryFn: () =>
      api<PublicStatusPage>(
        `/public/status-pages/${encodeURIComponent(id)}/${encodeURIComponent(slug)}`
      ),
    refetchInterval: 60_000,
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

  if (page.isLoading) return <LoadingState />;
  if (page.isError || !page.data) return <ErrorState retry={() => void page.refetch()} />;
  const data = page.data;
  const state = {
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
  }[data.state];
  const StateIcon = state.icon;

  async function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubscribing(true);
    try {
      await api(
        `/public/status-pages/${encodeURIComponent(id)}/${encodeURIComponent(slug)}/subscribers`,
        {
          method: "POST",
          ...jsonBody({ email: form.get("email") }),
        }
      );
      event.currentTarget.reset();
      toast.success("Check your email");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Subscription could not be created");
    } finally {
      setSubscribing(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 bg-canvas px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-black tracking-tight">{data.name}</h1>
        <span className="text-xs text-muted">Updated {formatRelative(data.updatedAt)}</span>
      </header>

      <section className={`flex items-center gap-3 rounded-2xl border p-5 ${state.className}`}>
        <StateIcon className="size-6" />
        <h2 className="font-display text-lg font-bold">{state.title}</h2>
      </section>

      <Card className="divide-y divide-line">
        {data.components.map((component) => (
          <div key={component.id} className="p-5">
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-semibold">{component.name}</h3>
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
              <div className="mt-4 flex h-8 gap-1" aria-label="30 day uptime">
                {component.dailyUptime.map((day) => (
                  <span
                    key={day.date}
                    title={`${day.date}: ${formatPercent(day.uptime)}`}
                    className={`min-w-0 flex-1 rounded-sm ${day.uptime == null ? "bg-line" : day.uptime >= 99.9 ? "bg-success" : day.uptime >= 95 ? "bg-warning" : "bg-danger"}`}
                  />
                ))}
              </div>
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
                {new Date(window.nextStartsAt ?? window.startsAt).toLocaleString()}
                {window.nextEndsAt ? ` – ${new Date(window.nextEndsAt).toLocaleString()}` : ""}
              </p>
            </Card>
          ))}
        </section>
      ) : null}

      {data.incidents.length ? (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold">Incidents</h2>
          {data.incidents.map((incident) => (
            <Card key={incident.id} className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="mr-auto font-semibold">{incident.title}</h3>
                <StatusBadge status={incident.status} />
                <StatusBadge status={incident.impact} />
              </div>
              <div className="mt-4 grid gap-4 border-l border-line pl-4">
                {incident.updates.toReversed().map((update) => (
                  <div key={update.id}>
                    <p className="text-sm leading-6">{update.message}</p>
                    <p className="mt-1 text-xs text-muted">
                      {update.status} · {formatRelative(update.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </section>
      ) : null}

      {data.subscriptionsEnabled ? (
        <Card className="p-5">
          <form onSubmit={subscribe}>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                aria-label="Email address"
                name="email"
                type="email"
                required
                placeholder="Email address"
              />
              <Button type="submit" disabled={subscribing} className="shrink-0">
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
    </main>
  );
}
