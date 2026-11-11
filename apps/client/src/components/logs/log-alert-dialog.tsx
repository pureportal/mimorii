import {
  incidentImpacts,
  logAlertComparisons,
  logAlertPendingSeconds,
  logAlertWindowSeconds,
  parseLogQuery,
  LogQueryError,
  type IncidentImpact,
  type LogAlertComparison,
  type LogAlertPreview,
  type LogAlertRuleSummary,
  type ResourceSummary,
} from "@mimorii/contracts";
import { FlaskConical, LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, jsonBody } from "../../lib/api";
import { formatLogAlertWindow } from "../../lib/log-alert-format";
import { formatLogTimestamp, logLevelPresentation } from "../../lib/log-display";
import { resourceOptionLabels } from "../../lib/resource-option-labels";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "../ui/dialog";
import { Field, FieldError, FieldLabel } from "../ui/field";
import { Input, Select, Textarea } from "../ui/input";
import { Switch } from "../ui/switch";

const comparisonLabels: Record<LogAlertComparison, string> = {
  atLeast: "At least",
  below: "Fewer than",
};

const impactLabels: Record<IncidentImpact, string> = {
  minor: "Minor",
  major: "Major",
  critical: "Critical",
};

export function LogAlertDialog({
  teamId,
  rule,
  defaultQuery,
  resources,
  onOpenChange,
  onSaved,
}: {
  teamId: string;
  rule: LogAlertRuleSummary | null;
  defaultQuery: string;
  resources: ResourceSummary[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const resourceLabels = resourceOptionLabels(resources);
  const [name, setName] = useState(rule?.name ?? "");
  const [query, setQuery] = useState(rule?.query ?? defaultQuery);
  const [comparison, setComparison] = useState<LogAlertComparison>(rule?.comparison ?? "atLeast");
  const [threshold, setThreshold] = useState(String(rule?.threshold ?? 1));
  const [windowSeconds, setWindowSeconds] = useState(rule?.windowSeconds ?? 300);
  const [pendingSeconds, setPendingSeconds] = useState(rule?.pendingSeconds ?? 0);
  const [impact, setImpact] = useState<IncidentImpact>(rule?.impact ?? "major");
  const [resourceId, setResourceId] = useState(rule?.resourceId ?? "");
  const [autoResolve, setAutoResolve] = useState(rule?.autoResolve ?? true);
  const [preview, setPreview] = useState<LogAlertPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const queryError = validateQuery(query);
  const condition = {
    query: query.trim(),
    comparison,
    threshold: Number(threshold),
    windowSeconds,
  };

  async function runPreview() {
    if (queryError) return;
    setPreviewing(true);
    setError("");
    try {
      setPreview(
        await api<LogAlertPreview>(`/teams/${teamId}/logs/alerts/preview`, {
          method: "POST",
          ...jsonBody(condition),
        })
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The preview could not run");
    } finally {
      setPreviewing(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (queryError) return;
    setSaving(true);
    setError("");
    const payload = {
      ...condition,
      name: name.trim(),
      impact,
      pendingSeconds,
      resourceId: resourceId || null,
      autoResolve,
    };
    try {
      await api(rule ? `/teams/${teamId}/logs/alerts/${rule.id}` : `/teams/${teamId}/logs/alerts`, {
        method: rule ? "PATCH" : "POST",
        ...jsonBody(payload),
      });
      toast.success(rule ? "Alert rule updated" : "Alert rule added");
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The alert rule could not be saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader title={rule ? "Edit alert rule" : "Add alert rule"} />
        <form className="grid gap-4" onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor="log-alert-name">Name</FieldLabel>
            <Input
              id="log-alert-name"
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="log-alert-query">Query</FieldLabel>
            <Textarea
              id="log-alert-query"
              required
              spellCheck={false}
              placeholder={'{service="web"} |= "Error 404 - Failed to load"'}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPreview(null);
              }}
              className="min-h-20 font-mono text-[13px] leading-6"
            />
            <FieldError>{query.trim() ? queryError : null}</FieldError>
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium text-ink">Condition</legend>
            <div className="grid gap-2 sm:grid-cols-[9rem_7rem_minmax(0,1fr)]">
              <Select
                aria-label="Comparison"
                value={comparison}
                onChange={(event) => {
                  setComparison(event.target.value as LogAlertComparison);
                  setPreview(null);
                }}
              >
                {logAlertComparisons.map((option) => (
                  <option key={option} value={option}>
                    {comparisonLabels[option]}
                  </option>
                ))}
              </Select>
              <Input
                aria-label="Matching lines"
                type="number"
                min={1}
                max={100_000}
                required
                value={threshold}
                onChange={(event) => {
                  setThreshold(event.target.value);
                  setPreview(null);
                }}
              />
              <Select
                aria-label="Window"
                value={windowSeconds}
                onChange={(event) => {
                  setWindowSeconds(Number(event.target.value));
                  setPreview(null);
                }}
              >
                {logAlertWindowSeconds.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    matching lines in {formatLogAlertWindow(seconds)}
                  </option>
                ))}
              </Select>
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="log-alert-pending">Open incident after</FieldLabel>
              <Select
                id="log-alert-pending"
                value={pendingSeconds}
                onChange={(event) => setPendingSeconds(Number(event.target.value))}
              >
                {logAlertPendingSeconds.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds ? formatLogAlertWindow(seconds) : "Immediately"}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="log-alert-impact">Incident impact</FieldLabel>
              <Select
                id="log-alert-impact"
                value={impact}
                onChange={(event) => setImpact(event.target.value as IncidentImpact)}
              >
                {incidentImpacts.map((option) => (
                  <option key={option} value={option}>
                    {impactLabels[option]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="log-alert-resource">Resource</FieldLabel>
              <Select
                id="log-alert-resource"
                value={resourceId}
                onChange={(event) => setResourceId(event.target.value)}
              >
                <option value="">None</option>
                {resources.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resourceLabels.get(resource.id)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <label className="flex items-center justify-between gap-4 rounded-xl border border-line p-3.5 text-sm font-medium">
            Resolve the incident when the condition clears
            <Switch checked={autoResolve} onCheckedChange={setAutoResolve} />
          </label>

          <div className="rounded-xl border border-line bg-canvas/40 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {preview ? (
                <p className="text-sm">
                  <span className="font-semibold">{preview.matchCount.toLocaleString()}</span>{" "}
                  matching {preview.matchCount === 1 ? "line" : "lines"} in the last{" "}
                  {formatLogAlertWindow(windowSeconds)} ·{" "}
                  <span className={preview.conditionMet ? "text-danger" : "text-success-strong"}>
                    {preview.conditionMet ? "Would open an incident" : "Condition not met"}
                  </span>
                </p>
              ) : (
                <span />
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={Boolean(queryError) || previewing || !Number(threshold)}
                onClick={() => void runPreview()}
              >
                {previewing ? <LoaderCircle className="animate-spin" /> : <FlaskConical />}
                Test rule
              </Button>
            </div>
            {preview?.samples.length ? (
              <ol className="mt-3 grid gap-1 font-mono text-xs">
                {preview.samples.map((sample) => (
                  <li key={sample.id} className="flex gap-2 truncate">
                    <span
                      aria-hidden="true"
                      className="mt-1 size-2 shrink-0 rounded-sm"
                      style={{ backgroundColor: logLevelPresentation[sample.level].color }}
                    />
                    <span className="shrink-0 text-muted">
                      {formatLogTimestamp(sample.timestamp)}
                    </span>
                    <span className="truncate">{sample.message}</span>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>

          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="coral" disabled={saving || Boolean(queryError)}>
              {saving ? <LoaderCircle className="animate-spin" /> : null}
              {rule ? "Save rule" : "Add rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function validateQuery(query: string): string | null {
  if (!query.trim()) return "Enter a query";
  try {
    parseLogQuery(query);
    return null;
  } catch (cause) {
    if (cause instanceof LogQueryError) return `${cause.message} at position ${cause.position + 1}`;
    return "The query is invalid";
  }
}
