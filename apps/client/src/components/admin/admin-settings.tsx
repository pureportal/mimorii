import type { PlatformSettings } from "@mimorii/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ErrorState, LoadingState } from "../page-state";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Field, FieldError, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { api, jsonBody } from "../../lib/api";

export function AdminSettings() {
  const settings = useQuery({
    queryKey: ["global-admin", "settings"],
    queryFn: () => api<PlatformSettings>("/admin/settings"),
  });
  if (settings.isLoading) return <LoadingState />;
  if (settings.isError) return <ErrorState retry={() => void settings.refetch()} />;
  return <SettingsForm key={settings.data!.revision} settings={settings.data!} />;
}

function SettingsForm({ settings }: { settings: PlatformSettings }) {
  const queryClient = useQueryClient();
  const [registrationEnabled, setRegistrationEnabled] = useState(settings.registrationEnabled);
  const [sponsorshipApplicationsEnabled, setSponsorshipApplicationsEnabled] = useState(
    settings.sponsorshipApplicationsEnabled
  );
  const [retentionDays, setRetentionDays] = useState(
    String(settings.sponsorshipApplicationRetentionDays)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const updated = await api<PlatformSettings>("/admin/settings", {
        method: "PATCH",
        ...jsonBody({
          registrationEnabled,
          sponsorshipApplicationsEnabled,
          sponsorshipApplicationRetentionDays: Number(retentionDays),
          expectedRevision: settings.revision,
        }),
      });
      queryClient.setQueryData(["global-admin", "settings"], updated);
      toast.success("Settings saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Settings could not be saved");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="font-display font-bold">Settings</h3>
      </CardHeader>
      <CardContent>
        <form className="grid max-w-xl gap-5" onSubmit={submit}>
          <label className="flex items-center justify-between gap-4 rounded-xl border border-line p-4">
            <span className="text-sm font-semibold">Registration</span>
            <input
              type="checkbox"
              checked={registrationEnabled}
              onChange={(event) => setRegistrationEnabled(event.target.checked)}
              className="size-5 accent-[var(--color-coral)]"
            />
          </label>
          <label className="flex items-center justify-between gap-4 rounded-xl border border-line p-4">
            <span className="text-sm font-semibold">Sponsorship applications</span>
            <input
              type="checkbox"
              checked={sponsorshipApplicationsEnabled}
              onChange={(event) => setSponsorshipApplicationsEnabled(event.target.checked)}
              className="size-5 accent-[var(--color-coral)]"
            />
          </label>
          <Field>
            <FieldLabel htmlFor="sponsorship-retention-days">Application retention days</FieldLabel>
            <Input
              id="sponsorship-retention-days"
              type="number"
              min={1}
              max={3650}
              required
              value={retentionDays}
              onChange={(event) => setRetentionDays(event.target.value)}
            />
          </Field>
          <FieldError>{error}</FieldError>
          <Button type="submit" variant="coral" className="justify-self-start" disabled={busy}>
            Save settings
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
