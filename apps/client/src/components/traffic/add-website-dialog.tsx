import type { ResourceSummary, TrafficSiteSummary } from "@mimorii/contracts";
import { useState, type FormEvent } from "react";
import { api, jsonBody } from "../../lib/api";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "../ui/dialog";
import { Field, FieldError, FieldLabel } from "../ui/field";
import { Input, Select } from "../ui/input";

export function AddWebsiteDialog({
  open,
  onOpenChange,
  teamId,
  resources,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  resources: ResourceSummary[];
  onCreated: (site: TrafficSiteSummary) => void;
}) {
  const [resourceId, setResourceId] = useState("");
  const [domain, setDomain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedResourceId = resourceId || resources[0]?.id || "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const site = await api<TrafficSiteSummary>(`/teams/${teamId}/traffic/sites`, {
        method: "POST",
        ...jsonBody({
          resourceId: selectedResourceId,
          ...(domain.trim() ? { domains: domain.split(",") } : {}),
        }),
      });
      setDomain("");
      setResourceId("");
      onCreated(site);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Website could not be added");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title="Track a website" />
        <form className="grid gap-4" onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor="traffic-resource">Resource</FieldLabel>
            <Select
              id="traffic-resource"
              value={selectedResourceId}
              onChange={(event) => setResourceId(event.target.value)}
              required
            >
              {resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="traffic-domain">Domain</FieldLabel>
            <Input
              id="traffic-domain"
              inputMode="url"
              autoComplete="off"
              placeholder="example.com"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
            />
          </Field>
          {error ? <FieldError>{error}</FieldError> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="coral" disabled={busy || !selectedResourceId}>
              {busy ? "Adding…" : "Add website"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
