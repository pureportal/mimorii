import type { NotificationChannelSummary, NotificationChannelType } from "@mimorii/contracts";
import { useQuery } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, jsonBody } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";
import { Field, FieldLabel } from "./ui/field";
import { Input, Select, Textarea } from "./ui/input";

export function NotificationChannelDialog({
  open,
  onOpenChange,
  channel,
  teamId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: NotificationChannelSummary | null;
  teamId: string;
  onSaved: () => Promise<void>;
}) {
  const { session } = useAuth();
  const [type, setType] = useState<NotificationChannelType>(channel?.type ?? "email");
  const [pushUserIds, setPushUserIds] = useState<string[]>(
    channel?.recipientUserIds.length ? channel.recipientUserIds : session ? [session.user.id] : []
  );
  const [saving, setSaving] = useState(false);
  const members = useQuery({
    queryKey: ["members", teamId],
    queryFn: () => api<Member[]>(`/teams/${teamId}/members`),
    enabled: open && type === "push",
  });

  useEffect(() => {
    if (!open) return;
    setType(channel?.type ?? "email");
    setPushUserIds(
      channel?.recipientUserIds.length ? channel.recipientUserIds : session ? [session.user.id] : []
    );
  }, [channel, open, session]);

  useEffect(() => {
    if (!open || type !== "push" || !members.data) return;
    const memberIds = new Set(members.data.map((member) => member.id));
    setPushUserIds((current) => current.filter((id) => memberIds.has(id)));
  }, [members.data, open, type]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {
      name: form.get("name"),
      type,
      enabled: form.get("enabled") === "on",
    };
    if (type === "email") {
      const recipients = form.get("recipients");
      if (typeof recipients !== "string") return;
      payload.emailRecipients = recipients
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    } else if (type === "webhook") {
      const webhookUrl = form.get("webhookUrl");
      const webhookSecret = form.get("webhookSecret");
      if (typeof webhookUrl === "string" && webhookUrl) payload.webhookUrl = webhookUrl;
      if (typeof webhookSecret === "string" && webhookSecret) {
        payload.webhookSecret = webhookSecret;
      }
    } else {
      payload.pushUserIds = pushUserIds;
    }
    setSaving(true);
    try {
      await api(`/teams/${teamId}/notifications/channels${channel ? `/${channel.id}` : ""}`, {
        method: channel ? "PATCH" : "POST",
        ...jsonBody(payload),
      });
      await onSaved();
      onOpenChange(false);
      toast.success(channel ? "Channel updated" : "Channel added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Channel could not be saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={channel ? "Edit channel" : "Add channel"} />
        <form className="grid gap-4" onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor="channel-name">Name</FieldLabel>
            <Input
              id="channel-name"
              name="name"
              defaultValue={channel?.name}
              required
              maxLength={100}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="channel-type">Type</FieldLabel>
            <Select
              id="channel-type"
              value={type}
              disabled={Boolean(channel)}
              onChange={(event) => setType(event.target.value as NotificationChannelType)}
            >
              <option value="email">Email</option>
              <option value="webhook">Webhook</option>
              <option value="push">Browser and Android</option>
            </Select>
          </Field>
          {type === "email" ? (
            <Field>
              <FieldLabel htmlFor="channel-recipients">Recipients</FieldLabel>
              <Textarea
                id="channel-recipients"
                name="recipients"
                defaultValue={channel?.type === "email" ? channel.target : ""}
                required
              />
            </Field>
          ) : type === "webhook" ? (
            <>
              <Field>
                <FieldLabel htmlFor="channel-webhook-url">Webhook URL</FieldLabel>
                <Input id="channel-webhook-url" name="webhookUrl" type="url" required={!channel} />
              </Field>
              <Field>
                <FieldLabel htmlFor="channel-webhook-secret">Signing secret</FieldLabel>
                <Input
                  id="channel-webhook-secret"
                  name="webhookSecret"
                  type="password"
                  maxLength={200}
                />
              </Field>
            </>
          ) : (
            <Field>
              <FieldLabel>Recipients</FieldLabel>
              <div className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-2">
                {members.data?.map((member) => (
                  <label key={member.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={pushUserIds.includes(member.id)}
                      onChange={(event) =>
                        setPushUserIds(
                          event.target.checked
                            ? [...pushUserIds, member.id]
                            : pushUserIds.filter((id) => id !== member.id)
                        )
                      }
                      className="size-4 accent-violet-strong"
                    />
                    {member.name}
                  </label>
                ))}
              </div>
            </Field>
          )}
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              name="enabled"
              type="checkbox"
              defaultChecked={channel?.enabled ?? true}
              className="size-4 accent-violet-strong"
            />
            Enabled
          </label>
          <Button type="submit" disabled={saving}>
            <BellRing /> {channel ? "Save channel" : "Add channel"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface Member {
  id: string;
  name: string;
}
