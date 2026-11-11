import type { LogAlertRuleSummary, ResourceSummary } from "@mimorii/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Pause, Pencil, Play, Plus, ScrollText, Siren, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { LogAlertDialog } from "../components/logs/log-alert-dialog";
import { EmptyState, ErrorState, LoadingState } from "../components/page-state";
import { StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { ConfirmationDialog } from "../components/ui/confirmation-dialog";
import { api, jsonBody } from "../lib/api";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/cn";
import { formatCount, formatRelative } from "../lib/format";
import { formatLogAlertCondition, formatLogAlertWindow } from "../lib/log-alert-format";

const stateBadges = {
  firing: { status: "down", label: "Firing" },
  pending: { status: "degraded", label: "Pending" },
  normal: { status: "okay", label: "Normal" },
  paused: { status: "paused", label: "Paused" },
} as const;

export function LogAlertsPage() {
  const { activeTeam } = useAuth();
  const team = activeTeam!;
  const teamId = team.id;
  const canEdit = team.role !== "viewer";
  const canDelete = team.role === "owner" || team.role === "admin";
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightedRuleId = searchParams.get("ruleId");
  const [editor, setEditor] = useState<{ rule: LogAlertRuleSummary | null; query: string } | null>(
    () =>
      canEdit && searchParams.get("new") === "1"
        ? { rule: null, query: searchParams.get("query") ?? "" }
        : null
  );
  const [deleteRule, setDeleteRule] = useState<LogAlertRuleSummary | null>(null);
  const rules = useQuery({
    queryKey: ["logs", teamId, "alerts"],
    queryFn: () => api<LogAlertRuleSummary[]>(`/teams/${teamId}/logs/alerts`),
    refetchInterval: 15_000,
  });
  const resources = useQuery({
    queryKey: ["resources", teamId],
    queryFn: () => api<ResourceSummary[]>(`/teams/${teamId}/resources`),
    enabled: canEdit,
  });

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    next.delete("query");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["logs", teamId, "alerts"] });
  const toggle = useMutation({
    mutationFn: (rule: LogAlertRuleSummary) =>
      api(`/teams/${teamId}/logs/alerts/${rule.id}`, {
        method: "PATCH",
        ...jsonBody({ enabled: !rule.enabled }),
      }),
    onSuccess: () => refresh(),
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (rule: LogAlertRuleSummary) =>
      api(`/teams/${teamId}/logs/alerts/${rule.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refresh();
      toast.success("Alert rule deleted");
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setDeleteRule(null),
  });

  if (rules.isLoading) return <LoadingState />;
  if (rules.isError) return <ErrorState retry={() => void rules.refetch()} />;
  const items = rules.data ?? [];
  const firing = items.filter((rule) => rule.state === "firing").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <p className="text-sm text-muted">
          {formatCount(items.length, "rule")}
          {firing ? <span className="text-danger"> · {firing} firing</span> : null}
        </p>
        {canEdit ? (
          <Button variant="coral" onClick={() => setEditor({ rule: null, query: "" })}>
            <Plus /> Add rule
          </Button>
        ) : null}
      </div>

      {items.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {items.map((rule) => {
            const badge = stateBadges[rule.state];
            return (
              <article
                key={rule.id}
                ref={(element) => {
                  if (rule.id === highlightedRuleId) element?.scrollIntoView({ block: "center" });
                }}
                className="min-w-0"
              >
                <Card
                  className={cn(
                    "flex h-full flex-col",
                    rule.id === highlightedRuleId && "border-lavender",
                    rule.state === "firing" && "border-danger/45"
                  )}
                >
                  <CardHeader className="pb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="min-w-0 font-display text-lg font-bold">{rule.name}</h3>
                        <StatusBadge status={badge.status}>{badge.label}</StatusBadge>
                        <StatusBadge status={rule.impact} />
                      </div>
                      <p className="mt-1.5 text-sm text-muted">
                        {formatLogAlertCondition(
                          rule.comparison,
                          rule.threshold,
                          rule.windowSeconds
                        )}
                        {rule.pendingSeconds
                          ? ` for ${formatLogAlertWindow(rule.pendingSeconds)}`
                          : ""}
                        {rule.resourceName ? ` · ${rule.resourceName}` : ""}
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="grid flex-1 content-start gap-3">
                    <pre className="overflow-x-auto rounded-xl border border-line bg-canvas/50 px-3 py-2 font-mono text-[12.5px] leading-5 text-ink [scrollbar-width:thin]">
                      {rule.query}
                    </pre>
                    {rule.lastError ? (
                      <p
                        role="alert"
                        className="rounded-lg border border-danger/35 bg-danger/8 px-3 py-2 text-xs text-danger"
                      >
                        Last evaluation failed: {rule.lastError}
                      </p>
                    ) : null}
                    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                      <div>
                        <dt className="text-[11px] text-muted">Last match count</dt>
                        <dd className="mt-0.5 font-medium">
                          {rule.lastMatchCount === null
                            ? "—"
                            : rule.lastMatchCount.toLocaleString()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-muted">Last matched</dt>
                        <dd className="mt-0.5 font-medium">{formatRelative(rule.lastMatchedAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-muted">Evaluated</dt>
                        <dd className="mt-0.5 font-medium">
                          {formatRelative(rule.lastEvaluatedAt)}
                        </dd>
                      </div>
                    </dl>
                  </CardContent>
                  <div className="flex flex-wrap items-center justify-end gap-1 border-t border-line px-4 py-3">
                    {rule.openIncidentId ? (
                      <Button asChild variant="outline" size="sm" className="mr-auto">
                        <Link to={appRoutes.incidents}>
                          <Siren /> Open incident <ArrowUpRight />
                        </Link>
                      </Button>
                    ) : null}
                    <Button asChild variant="ghost" size="sm">
                      <Link
                        to={`${appRoutes.logs}?${new URLSearchParams({
                          query: rule.query,
                          from: `now-${Math.max(1, Math.round(rule.windowSeconds / 60) * 2)}m`,
                          to: "now",
                        })}`}
                      >
                        <ScrollText /> Explore
                      </Link>
                    </Button>
                    {canEdit ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={toggle.isPending}
                          onClick={() => toggle.mutate(rule)}
                        >
                          {rule.enabled ? <Pause /> : <Play />}
                          {rule.enabled ? "Pause" : "Resume"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditor({ rule, query: rule.query })}
                        >
                          <Pencil /> Edit
                        </Button>
                      </>
                    ) : null}
                    {canDelete ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${rule.name}`}
                        onClick={() => setDeleteRule(rule)}
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </div>
                </Card>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState title="No alert rules" illustration="empty" />
      )}

      {editor ? (
        <LogAlertDialog
          key={editor.rule?.id ?? "new"}
          teamId={teamId}
          rule={editor.rule}
          defaultQuery={editor.query}
          resources={resources.data ?? []}
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          onSaved={async () => {
            setEditor(null);
            await refresh();
          }}
        />
      ) : null}
      <ConfirmationDialog
        open={Boolean(deleteRule)}
        onOpenChange={(open) => {
          if (!open) setDeleteRule(null);
        }}
        title={`Delete ${deleteRule?.name ?? "alert rule"}?`}
        description={deleteRule?.openIncidentId ? "Its open incident is resolved." : undefined}
        confirmLabel="Delete rule"
        pending={remove.isPending}
        onConfirm={() => {
          if (deleteRule) remove.mutate(deleteRule);
        }}
      />
    </div>
  );
}
