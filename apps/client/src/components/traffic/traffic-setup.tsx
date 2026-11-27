import type { TrafficSiteSummary } from "@mimorii/contracts";
import { Check, Copy } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, jsonBody } from "../../lib/api";
import { trackingSnippet } from "../../lib/traffic";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { ConfirmationDialog } from "../ui/confirmation-dialog";
import { Field, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";

export function TrafficSetup({
  teamId,
  site,
  canManage,
  onChanged,
  onDeleted,
}: {
  teamId: string;
  site: TrafficSiteSummary;
  canManage: boolean;
  onChanged: () => Promise<void>;
  onDeleted: () => void;
}) {
  const [domains, setDomains] = useState(site.domains.join(", "));
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [waitForConsent, setWaitForConsent] = useState(false);
  const snippet = trackingSnippet(site.publicKey, waitForConsent);

  async function update(input: { domains?: string[]; heatmapsEnabled?: boolean }) {
    setSaving(true);
    try {
      await api(`/teams/${teamId}/traffic/sites/${site.id}`, {
        method: "PATCH",
        ...jsonBody(input),
      });
      await onChanged();
      toast.success("Website updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Website could not be updated");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api(`/teams/${teamId}/traffic/sites/${site.id}`, { method: "DELETE" });
      onDeleted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Website could not be deleted");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h3 className="font-display font-bold">Tracking code</h3>
          {site.lastEventAt ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-success-strong">
              <Check className="size-3.5" /> Receiving data
            </span>
          ) : (
            <span className="text-xs text-muted">Waiting for the first visit</span>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium">Wait for consent</span>
            <Switch
              checked={waitForConsent}
              aria-label="Wait for consent"
              onCheckedChange={setWaitForConsent}
            />
          </label>
          <CodeBlock label="Add to every page, inside <head>" code={snippet} />
          {waitForConsent ? (
            <CodeBlock
              label="Call from your consent banner"
              code={`mimorii.consent(true)\nmimorii.consent(false)`}
            />
          ) : null}
          <CodeBlock
            label="Count an event"
            code={`<button data-mimorii-event="Signup">Sign up</button>\n<script>mimorii.track("Signup")</script>`}
          />
          <p className="text-xs leading-5 text-muted">
            No cookies or local storage. IP addresses are never stored, visitors are counted with a
            daily changing anonymous hash, and browsers sending Do Not Track or Global Privacy
            Control are not tracked. Add <code className="font-mono">data-mimorii-mask</code> to
            exclude an area from heatmaps.
          </p>
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <h3 className="font-display font-bold">Settings</h3>
          </CardHeader>
          <CardContent className="space-y-5">
            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                void update({ domains: domains.split(",") });
              }}
            >
              <Field className="flex-1">
                <FieldLabel htmlFor="traffic-domains">Domains</FieldLabel>
                <Input
                  id="traffic-domains"
                  value={domains}
                  onChange={(event) => setDomains(event.target.value)}
                  required
                />
              </Field>
              <Button type="submit" variant="outline" disabled={saving}>
                Save
              </Button>
            </form>
            <label className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium">Heatmaps</span>
              <Switch
                checked={site.heatmapsEnabled}
                disabled={saving}
                aria-label="Heatmaps"
                onCheckedChange={(checked) => void update({ heatmapsEnabled: checked })}
              />
            </label>
            <div className="flex justify-end border-t border-line pt-4">
              <Button variant="danger" onClick={() => setDeleteOpen(true)}>
                Stop tracking
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <ConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Stop tracking ${site.resourceName}?`}
        description="All traffic and heatmap data for this website will be deleted."
        confirmLabel="Stop tracking"
        pending={deleting}
        onConfirm={() => void remove()}
      />
    </div>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-semibold">{label}</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
            } catch {
              toast.error("Copy failed. Select the code and copy it manually.");
            }
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-xl bg-ink/5 p-3 font-mono text-xs leading-5">
        {code}
      </pre>
    </div>
  );
}
