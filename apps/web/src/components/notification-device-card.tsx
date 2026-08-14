import type { NotificationPushCapabilities } from "@mimorii/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, BellRing, MonitorSmartphone } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { devicePushState, disablePush, enablePush } from "../lib/push-notifications";
import { StatusBadge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

export function NotificationDeviceCard({ teamId }: { teamId: string }) {
  const queryClient = useQueryClient();
  const capabilities = useQuery({
    queryKey: ["notification-push", teamId],
    queryFn: () => api<NotificationPushCapabilities>(`/teams/${teamId}/notifications/push`),
  });
  const state = useQuery({
    queryKey: ["notification-device", teamId, capabilities.data],
    queryFn: () => devicePushState(capabilities.data!),
    enabled: Boolean(capabilities.data),
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notification-push", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["notification-device", teamId] }),
    ]);
  const enable = useMutation({
    mutationFn: () => enablePush(teamId, capabilities.data!),
    onSuccess: async () => {
      await refresh();
      toast.success("Notifications enabled");
    },
    onError: (error) => toast.error(error.message),
  });
  const disable = useMutation({
    mutationFn: () => disablePush(teamId),
    onSuccess: async () => {
      await refresh();
      toast.success("Notifications disabled");
    },
    onError: (error) => toast.error(error.message),
  });

  if (capabilities.isLoading || state.isLoading) return null;
  const current = state.data;
  const blocked = !current?.supported
    ? "Notifications unavailable"
    : !current.available
      ? "Push is not configured"
      : current.permission === "denied"
        ? "Blocked in device settings"
        : null;
  const status = blocked ?? (current?.registration === "invalid" ? "Registration expired" : null);

  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      <span className="grid size-10 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
        <MonitorSmartphone className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-display font-bold">This device</h3>
          <StatusBadge status={current?.enabled ? "operational" : "paused"}>
            {current?.enabled ? "Enabled" : "Disabled"}
          </StatusBadge>
        </div>
        {status ? <p className="mt-1 text-sm text-muted">{status}</p> : null}
      </div>
      {current?.enabled ? (
        <Button variant="outline" onClick={() => disable.mutate()} disabled={disable.isPending}>
          <BellOff /> Disable
        </Button>
      ) : (
        <Button
          variant="outline"
          onClick={() => enable.mutate()}
          disabled={Boolean(blocked) || enable.isPending}
        >
          <BellRing /> Enable
        </Button>
      )}
    </Card>
  );
}
