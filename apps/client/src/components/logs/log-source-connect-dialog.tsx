import type { LogIngestionEndpoints, LogSourceList, LogSourceSummary } from "@mimorii/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleCheck, Copy, LoaderCircle, ScrollText, Send } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { appRoutes } from "../../lib/app-navigation";
import { cn } from "../../lib/cn";
import { formatRelative } from "../../lib/format";
import { logIntegrations } from "../../lib/log-source-snippets";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader } from "../ui/dialog";

const groups = ["Send directly", "Collectors", "Platforms"] as const;
const placeholderToken = "YOUR_SOURCE_TOKEN";

export function LogSourceConnectDialog({
  teamId,
  source,
  token,
  endpoints,
  onOpenChange,
}: {
  teamId: string;
  source: LogSourceSummary;
  token: string | null;
  endpoints: LogIngestionEndpoints;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [integrationId, setIntegrationId] = useState(logIntegrations[0]!.id);
  const [openedAt] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  const sources = useQuery({
    queryKey: ["logs", teamId, "sources"],
    queryFn: () => api<LogSourceList>(`/teams/${teamId}/logs/sources`),
    refetchInterval: 3_000,
  });
  const current = sources.data?.sources.find((candidate) => candidate.id === source.id) ?? source;
  const receivedRecently =
    current.lastReceivedAt !== null && Date.parse(current.lastReceivedAt) >= openedAt - 5 * 60_000;
  const integration = logIntegrations.find((candidate) => candidate.id === integrationId)!;
  const snippet = integration.snippet({ endpoints, token: token ?? placeholderToken });

  async function sendTest() {
    setSending(true);
    try {
      await api<LogSourceSummary>(`/teams/${teamId}/logs/sources/${source.id}/test`, {
        method: "POST",
      });
      await queryClient.invalidateQueries({ queryKey: ["logs", teamId] });
      toast.success("Test log stored");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The test log could not be sent");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader title={`Connect ${source.name}`}>
          {token ? "Copy the token now. It is shown only once." : undefined}
        </DialogHeader>
        <div className="grid gap-4">
          <div
            aria-live="polite"
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3",
              receivedRecently ? "border-success/40 bg-success/8" : "border-line bg-canvas/40"
            )}
          >
            <p className="flex items-center gap-2 text-sm font-medium">
              {receivedRecently ? (
                <CircleCheck className="size-4 text-success-strong" />
              ) : (
                <LoaderCircle className="size-4 animate-spin text-muted" />
              )}
              {receivedRecently
                ? `Receiving logs · ${formatRelative(current.lastReceivedAt)}`
                : current.lastReceivedAt
                  ? `Waiting for logs · last ${formatRelative(current.lastReceivedAt)}`
                  : "Waiting for the first log"}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={sending}
                onClick={() => void sendTest()}
              >
                {sending ? <LoaderCircle className="animate-spin" /> : <Send />}
                Send test log
              </Button>
              {receivedRecently ? (
                <Button asChild variant="coral" size="sm">
                  <Link
                    to={`${appRoutes.logs}?${new URLSearchParams({ from: "now-15m", to: "now" })}`}
                    onClick={() => onOpenChange(false)}
                  >
                    <ScrollText /> Open Explore
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
          {token ? <CopyBlock label="Token" value={token} compact /> : null}
          <div role="radiogroup" aria-label="Integration" className="grid gap-2.5">
            {groups.map((group) => (
              <div
                key={group}
                className="grid gap-1.5 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:items-start"
              >
                <p className="pt-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted/80">
                  {group}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {logIntegrations
                    .filter((candidate) => candidate.group === group)
                    .map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        role="radio"
                        aria-checked={candidate.id === integrationId}
                        onClick={() => setIntegrationId(candidate.id)}
                        className={cn(
                          "h-8 rounded-lg border border-line px-2.5 text-xs font-semibold text-muted transition hover:border-lavender hover:text-ink",
                          candidate.id === integrationId &&
                            "border-lavender bg-lavender-soft text-violet-strong"
                        )}
                      >
                        {candidate.label}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
          <CopyBlock label={integration.label} value={snippet} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CopyBlock({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    } catch {
      toast.error("Copying is unavailable");
    }
  }

  return (
    <div className="relative min-w-0">
      <pre
        aria-label={label}
        className={cn(
          "overflow-x-auto rounded-xl border border-line bg-canvas/70 pr-14 font-mono text-[12.5px] leading-5 text-ink [scrollbar-width:thin]",
          compact ? "p-3" : "max-h-80 p-4"
        )}
      >
        {value}
      </pre>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Copy ${label.toLowerCase()}`}
        onClick={() => void copy()}
        className="absolute right-2 top-2 size-9 border border-line bg-surface/95 shadow-sm"
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}
