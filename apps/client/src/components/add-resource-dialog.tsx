import type {
  AgentSummary,
  CheckType,
  ResourceSummary,
  WebsiteCheckSuggestion,
  WebsiteDiscovery,
} from "@mimorii/contracts";
import { useQuery } from "@tanstack/react-query";
import { Boxes, Globe2, LoaderCircle, Waypoints } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, jsonBody } from "../lib/api";
import { cn } from "../lib/cn";
import { formatInterval } from "../lib/format";
import { CheckTypeIcon } from "./check-type-icon";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "./ui/dialog";
import { Field, FieldError, FieldLabel } from "./ui/field";
import { Input, Select } from "./ui/input";

type SetupMode = "website" | "port" | "service";

interface PlannedCheck {
  name: string;
  type: CheckType;
  config: object;
  intervalSeconds: number;
}

const discoveryDelayMs = 600;

export function AddResourceDialog({
  open,
  onOpenChange,
  teamId,
  agents,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  agents: AgentSummary[];
  onCreated: () => Promise<void>;
}) {
  const [mode, setMode] = useState<SetupMode>("website");
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [port, setPort] = useState("443");
  const [agentId, setAgentId] = useState("");
  const [interval, setInterval] = useState("60");
  const [timeout, setTimeoutValue] = useState("5000");
  const [statusCode, setStatusCode] = useState("200");
  const [content, setContent] = useState("");
  const [skippedChecks, setSkippedChecks] = useState<ReadonlySet<CheckType>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const websiteUrl = mode === "website" ? normalizeWebsiteUrl(target) : null;
  const [discoveryUrl, setDiscoveryUrl] = useState<string | null>(null);
  const discovery = useQuery({
    queryKey: ["website-discovery", teamId, discoveryUrl],
    queryFn: () =>
      api<WebsiteDiscovery>(`/teams/${teamId}/resources/discover`, {
        method: "POST",
        ...jsonBody({ url: discoveryUrl }),
      }),
    enabled: open && discoveryUrl !== null,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const discovered = discoveryUrl === websiteUrl ? discovery.data : undefined;

  useEffect(() => {
    if (open) {
      setError("");
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setDiscoveryUrl(websiteUrl), discoveryDelayMs);
    return () => clearTimeout(timer);
  }, [websiteUrl]);

  const suggestedName =
    discovered?.name ?? (websiteUrl ? new URL(websiteUrl).hostname.replace(/^www\./, "") : "");
  const suggestedChecks =
    mode === "website" && websiteUrl
      ? websiteChecks(websiteUrl, discovered, statusCode, content, Number(interval))
      : [];
  const plannedChecks: PlannedCheck[] =
    mode === "website"
      ? suggestedChecks.filter((check) => !skippedChecks.has(check.type))
      : mode === "port" && target.trim()
        ? [
            {
              name: `TCP ${port}`,
              type: "tcp",
              config: { target: { host: target.trim(), port: Number(port) } },
              intervalSeconds: Number(interval),
            },
          ]
        : [];

  function changeMode(next: SetupMode) {
    setMode(next);
    setTarget("");
    setSkippedChecks(new Set());
    if (next === "service") setAgentId("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    let resourceId: string | null = null;
    try {
      const resource = await api<ResourceSummary>(`/teams/${teamId}/resources`, {
        method: "POST",
        ...jsonBody({
          name:
            name.trim() || (mode === "port" ? `${target.trim()}:${port}` : suggestedName.trim()),
          kind: "service",
          ...(discovered?.description ? { description: discovered.description } : {}),
          tags: [],
        }),
      });
      resourceId = resource.id;
      for (const check of plannedChecks) {
        await api(`/teams/${teamId}/checks`, {
          method: "POST",
          ...jsonBody({
            resourceId,
            name: check.name,
            type: check.type,
            config: check.config,
            execution: agentId ? { kind: "agent", agentId } : { kind: "direct" },
            intervalSeconds: check.intervalSeconds,
            timeoutMs: Number(timeout),
            failureThreshold: 2,
            recoveryThreshold: 1,
            enabled: true,
          }),
        });
      }
      if (plannedChecks.some((check) => check.type === "http")) {
        try {
          await api(`/teams/${teamId}/resources/${resourceId}/favicon`, { method: "POST" });
        } catch {
          toast.error("Favicon could not be retrieved. Use Update favicon to try again.");
        }
      }
      await onCreated();
      onOpenChange(false);
      setName("");
      setTarget("");
      setSkippedChecks(new Set());
    } catch (cause) {
      if (resourceId)
        await api(`/teams/${teamId}/resources/${resourceId}`, { method: "DELETE" }).catch(
          () => undefined
        );
      setError(cause instanceof Error ? cause.message : "Resource could not be added");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title="Add resource" />
        <form className="grid grid-cols-1 gap-5" onSubmit={submit}>
          <div className="grid grid-cols-3 gap-2">
            <ModeButton
              active={mode === "website"}
              icon={Globe2}
              label="Website"
              onClick={() => changeMode("website")}
            />
            <ModeButton
              active={mode === "port"}
              icon={Waypoints}
              label="Port"
              onClick={() => changeMode("port")}
            />
            <ModeButton
              active={mode === "service"}
              icon={Boxes}
              label="Service"
              onClick={() => changeMode("service")}
            />
          </div>
          {mode !== "service" ? (
            <div className={mode === "port" ? "grid gap-4 sm:grid-cols-[1fr_120px]" : "grid gap-4"}>
              <Field>
                <FieldLabel htmlFor="resource-target">
                  {mode === "website" ? "URL" : "Host"}
                </FieldLabel>
                <Input
                  id="resource-target"
                  inputMode="url"
                  autoComplete="off"
                  autoFocus
                  placeholder={mode === "website" ? "example.com" : "db.example.com"}
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  aria-invalid={mode === "website" && Boolean(target.trim()) && !websiteUrl}
                  required
                />
              </Field>
              {mode === "port" ? (
                <Field>
                  <FieldLabel htmlFor="resource-port">Port</FieldLabel>
                  <Input
                    id="resource-port"
                    type="number"
                    min={1}
                    max={65535}
                    value={port}
                    onChange={(event) => setPort(event.target.value)}
                    required
                  />
                </Field>
              ) : null}
            </div>
          ) : null}
          {mode === "website" && websiteUrl ? (
            <WebsitePreview
              url={websiteUrl}
              discovery={discovered}
              loading={discovery.isFetching || discoveryUrl !== websiteUrl}
              direct={!agentId}
            />
          ) : null}
          <Field>
            <FieldLabel htmlFor="resource-name">Name</FieldLabel>
            <Input
              id="resource-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={
                (mode === "port" && target.trim() ? `${target.trim()}:${port}` : suggestedName) ||
                (mode === "website" ? "Main website" : "Production service")
              }
              maxLength={100}
              required={mode === "service"}
            />
          </Field>
          {suggestedChecks.length ? (
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-semibold">Checks</legend>
              {suggestedChecks.map((check) => (
                <SuggestedCheck
                  key={check.type}
                  check={check}
                  selected={!skippedChecks.has(check.type)}
                  onSelectedChange={(selected) =>
                    setSkippedChecks((current) => {
                      const next = new Set(current);
                      if (selected) next.delete(check.type);
                      else next.add(check.type);
                      return next;
                    })
                  }
                />
              ))}
            </fieldset>
          ) : null}
          {mode === "website" || mode === "port" ? (
            <Field>
              <FieldLabel htmlFor="resource-agent">Run from</FieldLabel>
              <Select
                id="resource-agent"
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
              >
                <option value="">Mimorii</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.resourceName}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {mode !== "service" ? (
            <details className="rounded-2xl border border-line px-4 py-3">
              <summary className="text-sm font-semibold">Advanced</summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {mode === "website" ? (
                  <>
                    <Field>
                      <FieldLabel htmlFor="quick-status">Expected status</FieldLabel>
                      <Input
                        id="quick-status"
                        type="number"
                        min={100}
                        max={599}
                        value={statusCode}
                        onChange={(event) => setStatusCode(event.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="quick-content">Response contains</FieldLabel>
                      <Input
                        id="quick-content"
                        value={content}
                        onChange={(event) => setContent(event.target.value)}
                        maxLength={512}
                      />
                    </Field>
                  </>
                ) : null}
                <Field>
                  <FieldLabel htmlFor="quick-interval">Interval · seconds</FieldLabel>
                  <Input
                    id="quick-interval"
                    type="number"
                    min={30}
                    max={86400}
                    value={interval}
                    onChange={(event) => setInterval(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="quick-timeout">Timeout · ms</FieldLabel>
                  <Input
                    id="quick-timeout"
                    type="number"
                    min={250}
                    max={30000}
                    value={timeout}
                    onChange={(event) => setTimeoutValue(event.target.value)}
                  />
                </Field>
              </div>
            </details>
          ) : null}
          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="coral"
              disabled={busy || (mode === "website" && !websiteUrl)}
            >
              {busy ? "Adding…" : "Add resource"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WebsitePreview({
  url,
  discovery,
  loading,
  direct,
}: {
  url: string;
  discovery: WebsiteDiscovery | undefined;
  loading: boolean;
  direct: boolean;
}) {
  const address = new URL(discovery?.url ?? url);
  return (
    <div
      aria-live="polite"
      aria-busy={loading}
      className="flex items-center gap-3 rounded-2xl border border-line bg-canvas/60 p-3"
    >
      <span
        className={cn(
          "grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl text-violet-strong",
          discovery?.icon ? "bg-white" : "bg-lavender-soft"
        )}
      >
        {discovery?.icon ? (
          <img src={discovery.icon} alt="" className="size-full object-contain p-1.5" />
        ) : loading ? (
          <LoaderCircle className="size-5 animate-spin" />
        ) : (
          <Globe2 className="size-5" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{discovery?.name ?? address.hostname}</p>
        <p className="truncate text-xs text-muted">
          {[displayAddress(address), discovery?.description].filter(Boolean).join(" · ")}
        </p>
        {discovery && !discovery.reachable && direct ? (
          <p className="mt-1 text-xs text-warning-strong">
            Mimorii can't reach this address. Run the checks from an agent on its network.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SuggestedCheck({
  check,
  selected,
  onSelectedChange,
}: {
  check: WebsiteCheckSuggestion;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition",
        selected ? "border-lavender/60 bg-lavender-soft/40" : "border-line opacity-70"
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={(event) => onSelectedChange(event.target.checked)}
        className="size-4 shrink-0 accent-[var(--color-lavender)]"
      />
      <CheckTypeIcon type={check.type} className="size-4 shrink-0 text-violet-strong" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{check.name}</span>
        <span className="block truncate text-xs text-muted">{checkTarget(check)}</span>
      </span>
      <span className="shrink-0 text-xs text-muted">
        every {formatInterval(check.intervalSeconds)}
      </span>
    </label>
  );
}

function ModeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Globe2;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`grid min-h-20 place-items-center gap-1 rounded-2xl border p-3 text-xs font-semibold transition ${active ? "border-lavender bg-lavender-soft text-violet-strong" : "border-line bg-surface text-muted hover:border-lavender"}`}
    >
      <Icon className="size-5" />
      {label}
    </button>
  );
}

function normalizeWebsiteUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function websiteChecks(
  url: string,
  discovery: WebsiteDiscovery | undefined,
  statusCode: string,
  content: string,
  intervalSeconds: number
): WebsiteCheckSuggestion[] {
  const suggestions: WebsiteCheckSuggestion[] = discovery?.checks ?? [
    {
      type: "http",
      name: "Website availability",
      intervalSeconds: 60,
      config: {
        target: { url, method: "GET" },
        expectedStatuses: [200],
        followRedirects: true,
        validateTls: true,
      },
    },
  ];
  return suggestions.map((check) =>
    check.type === "http"
      ? {
          name: check.name,
          type: check.type,
          intervalSeconds,
          config: {
            ...check.config,
            expectedStatuses: [Number(statusCode)],
            ...(content ? { responseContains: content } : {}),
          },
        }
      : check
  );
}

function checkTarget(check: WebsiteCheckSuggestion): string {
  if (check.type === "http") return displayAddress(new URL(check.config.target.url));
  if (check.type === "tls") return `${check.config.target.host}:${check.config.target.port}`;
  return check.config.target.domain;
}

function displayAddress(url: URL): string {
  return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
}
