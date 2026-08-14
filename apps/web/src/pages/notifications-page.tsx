import type {
  NotificationChannelSummary,
  NotificationConditionNode,
  NotificationDeliverySummary,
  NotificationPolicySummary,
} from "@mimorii/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  Mail,
  Pencil,
  Plus,
  RotateCcw,
  Route,
  Send,
  Trash2,
  Webhook,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { NotificationChannelDialog } from "../components/notification-channel-dialog";
import { NotificationPolicyDialog } from "../components/notification-policy-dialog";
import { EmptyState, ErrorState, LoadingState } from "../components/page-state";
import { SectionTabs } from "../components/section-tabs";
import { StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { ConfirmationDialog } from "../components/ui/confirmation-dialog";
import { api } from "../lib/api";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { formatCount, formatRelative } from "../lib/format";

type NotificationConfirmation =
  | { action: "channel"; item: NotificationChannelSummary }
  | { action: "policy"; item: NotificationPolicySummary };

export type AlertingSection = "channels" | "rules" | "history";

export function NotificationsPage({ section }: { section: AlertingSection }) {
  const { activeTeam } = useAuth();
  const teamId = activeTeam!.id;
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<NotificationChannelSummary | null>(null);
  const [policyDialogOpen, setPolicyDialogOpen] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<NotificationPolicySummary | null>(null);
  const [confirmation, setConfirmation] = useState<NotificationConfirmation | null>(null);
  const channels = useQuery({
    queryKey: ["notification-channels", teamId],
    queryFn: () => api<NotificationChannelSummary[]>(`/teams/${teamId}/notifications/channels`),
    enabled: section !== "history",
  });
  const deliveries = useQuery({
    queryKey: ["notification-deliveries", teamId],
    queryFn: () =>
      api<NotificationDeliverySummary[]>(`/teams/${teamId}/notifications/deliveries?limit=100`),
    enabled: section === "history",
  });
  const policies = useQuery({
    queryKey: ["notification-policies", teamId],
    queryFn: () => api<NotificationPolicySummary[]>(`/teams/${teamId}/notifications/policies`),
    enabled: section === "rules",
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notification-channels", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["notification-deliveries", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["notification-policies", teamId] }),
    ]);
  };
  const test = useMutation({
    mutationFn: (id: string) =>
      api<NotificationDeliverySummary>(`/teams/${teamId}/notifications/channels/${id}/test`, {
        method: "POST",
      }),
    onSuccess: async (delivery) => {
      await refresh();
      if (delivery.status === "delivered") toast.success("Test delivered");
      else if (delivery.status === "pending") toast.info("Test queued for retry");
      else toast.error(delivery.error ?? "Test delivery failed");
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/teams/${teamId}/notifications/channels/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refresh();
      toast.success("Channel deleted");
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setConfirmation(null),
  });
  const retry = useMutation({
    mutationFn: (id: string) =>
      api<NotificationDeliverySummary>(`/teams/${teamId}/notifications/deliveries/${id}/retry`, {
        method: "POST",
      }),
    onSuccess: async (delivery) => {
      await refresh();
      if (delivery.status === "delivered") toast.success("Delivery sent");
      else if (delivery.status === "pending") toast.info("Delivery queued for retry");
      else toast.error(delivery.error ?? "Delivery failed");
    },
    onError: (error) => toast.error(error.message),
  });
  const removePolicy = useMutation({
    mutationFn: (id: string) =>
      api(`/teams/${teamId}/notifications/policies/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refresh();
      toast.success("Rule deleted");
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setConfirmation(null),
  });

  if (channels.isLoading || deliveries.isLoading || policies.isLoading) return <LoadingState />;
  if (channels.isError || deliveries.isError || policies.isError) {
    return (
      <ErrorState
        retry={() => {
          void channels.refetch();
          void deliveries.refetch();
          void policies.refetch();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div
        data-guide-page="alerting-summary"
        className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"
      >
        <p className="text-sm text-muted">
          {section === "channels"
            ? formatCount(channels.data?.length ?? 0, "channel")
            : section === "rules"
              ? formatCount(policies.data?.length ?? 0, "rule")
              : `${formatCount(deliveries.data?.length ?? 0, "delivery")} loaded`}
        </p>
        {section === "channels" ? (
          <Button
            variant="coral"
            onClick={() => {
              setSelected(null);
              setDialogOpen(true);
            }}
          >
            <Plus /> Add channel
          </Button>
        ) : section === "rules" ? (
          <Button
            variant="coral"
            disabled={!channels.data?.length}
            onClick={() => {
              setSelectedPolicy(null);
              setPolicyDialogOpen(true);
            }}
          >
            <Route /> Add rule
          </Button>
        ) : null}
      </div>

      <SectionTabs
        label="Alerting"
        items={[
          { label: "Channels", to: appRoutes.alertChannels },
          { label: "Routing rules", to: appRoutes.alertRules },
          { label: "Delivery history", to: appRoutes.alertHistory },
        ]}
        className="lg:hidden"
      />

      <div data-guide-page="alerting-content">
        {section === "channels" ? (
          channels.data?.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {channels.data.map((channel) => {
                const Icon =
                  channel.type === "email" ? Mail : channel.type === "webhook" ? Webhook : BellRing;
                return (
                  <Card key={channel.id} className="p-5">
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display font-bold">{channel.name}</h3>
                          <StatusBadge status={channel.enabled ? "operational" : "paused"}>
                            {channel.enabled ? "Enabled" : "Disabled"}
                          </StatusBadge>
                        </div>
                        <p className="mt-1 truncate text-sm text-muted">{channel.target}</p>
                        <p className="mt-2 text-xs text-muted">
                          {formatRelative(channel.lastDeliveredAt)}
                        </p>
                      </div>
                      {channel.lastDeliveryStatus ? (
                        <StatusBadge status={channel.lastDeliveryStatus} />
                      ) : null}
                    </div>
                    <div className="mt-4 flex justify-end gap-2 border-t border-line pt-4">
                      <Button variant="ghost" size="sm" onClick={() => test.mutate(channel.id)}>
                        <Send /> Test
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelected(channel);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil /> Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setConfirmation({ action: "channel", item: channel })}
                      >
                        <Trash2 /> Delete
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No notification channels" illustration="empty" />
          )
        ) : null}

        {section === "rules" ? (
          <section>
            {policies.data?.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {policies.data.map((policy) => (
                  <Card key={policy.id} className="p-5">
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 place-items-center rounded-xl bg-mint/20 text-success-strong">
                        <Route className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-display font-bold">{policy.name}</h4>
                          <StatusBadge status={policy.enabled ? "operational" : "paused"}>
                            {policy.enabled ? "Enabled" : "Disabled"}
                          </StatusBadge>
                        </div>
                        <p className="mt-1 text-sm text-muted">{policy.channelNames.join(", ")}</p>
                        <p className="mt-2 text-xs text-muted">
                          {formatCount(policy.events.length, "event")}
                          {conditionCount(policy.condition)
                            ? ` · ${formatCount(conditionCount(policy.condition), "condition")}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end gap-2 border-t border-line pt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedPolicy(policy);
                          setPolicyDialogOpen(true);
                        }}
                      >
                        <Pencil /> Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setConfirmation({ action: "policy", item: policy })}
                      >
                        <Trash2 /> Delete
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptyState title="No notification rules" />
            )}
          </section>
        ) : null}

        {section === "history" ? (
          <Card>
            <CardContent className="overflow-x-auto pt-5">
              {deliveries.data?.length ? (
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="pb-3 font-medium">Channel</th>
                      <th className="pb-3 font-medium">Event</th>
                      <th className="pb-3 font-medium">Time</th>
                      <th className="pb-3 font-medium">Attempts</th>
                      <th className="pb-3 font-medium">Error</th>
                      <th className="pb-3 text-right font-medium">Status</th>
                      <th className="pb-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.data.map((delivery) => (
                      <tr key={delivery.id} className="border-t border-line">
                        <td className="py-3 font-semibold">{delivery.channelName}</td>
                        <td className="py-3 text-muted">{delivery.event}</td>
                        <td className="py-3 text-muted">{formatRelative(delivery.createdAt)}</td>
                        <td className="py-3 text-muted">{delivery.attempts}</td>
                        <td className="max-w-72 break-words py-3 text-muted">
                          {delivery.error ?? "—"}
                        </td>
                        <td className="py-3 text-right">
                          <StatusBadge status={delivery.status} />
                        </td>
                        <td className="py-3 text-right">
                          {delivery.status === "failed" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => retry.mutate(delivery.id)}
                            >
                              <RotateCcw /> Retry
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="grid h-32 place-items-center text-sm text-muted">No deliveries</div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <NotificationChannelDialog
        key={selected?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        channel={selected}
        teamId={teamId}
        onSaved={refresh}
      />
      <NotificationPolicyDialog
        key={selectedPolicy?.id ?? "new-policy"}
        open={policyDialogOpen}
        onOpenChange={setPolicyDialogOpen}
        policy={selectedPolicy}
        channels={channels.data ?? []}
        teamId={teamId}
        onSaved={refresh}
      />
      <ConfirmationDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
        title={`Delete ${confirmation?.item.name ?? "notification item"}?`}
        confirmLabel={confirmation?.action === "policy" ? "Delete rule" : "Delete channel"}
        pending={remove.isPending || removePolicy.isPending}
        onConfirm={() => {
          if (!confirmation) return;
          if (confirmation.action === "channel") remove.mutate(confirmation.item.id);
          else removePolicy.mutate(confirmation.item.id);
        }}
      />
    </div>
  );
}

function conditionCount(node: NotificationConditionNode): number {
  if (node.kind === "condition") return 1;
  return node.conditions.reduce((total, condition) => total + conditionCount(condition), 0);
}
