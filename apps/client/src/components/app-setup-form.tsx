import { appDefinitions, appKinds, type AppKind, type CreatedApp } from "@mimorii/contracts";
import { Check, Copy } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, getServerUrl, jsonBody } from "../lib/api";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/cn";
import { Button } from "./ui/button";
import { DialogFooter } from "./ui/dialog";
import { Field, FieldError, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

export function AppSetupForm({
  teamId,
  onCancel,
  onCreated,
  onDone,
}: {
  teamId: string;
  onCancel: () => void;
  onCreated: () => Promise<void>;
  onDone: () => void;
}) {
  const { activeTeam } = useAuth();
  const [kind, setKind] = useState<AppKind>("foxytail");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedApp | null>(null);
  const definition = appDefinitions[kind];
  const needsLogs = Boolean(definition.logSource) && !activeTeam!.logsEnabled;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<CreatedApp>(`/teams/${teamId}/apps`, {
        method: "POST",
        ...jsonBody({
          kind,
          name: name.trim() || definition.name,
          ...(address.trim() ? { address: address.trim() } : {}),
        }),
      });
      setCreated(result);
      await onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${definition.name} could not be added`);
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    const secrets = [
      ...(created.enrollmentCode
        ? [{ label: "Enrollment code", value: created.enrollmentCode }]
        : []),
      ...(created.logToken
        ? [
            { label: "Mimorii address", value: getServerUrl().replace(/\/api$/, "") },
            { label: "Log source token", value: created.logToken },
          ]
        : []),
    ];
    return (
      <div className="grid gap-4">
        {definition.connectIn && secrets.length ? (
          <p className="text-sm text-muted">Paste into {definition.connectIn}.</p>
        ) : null}
        {secrets.map((secret) => (
          <SecretField key={secret.label} label={secret.label} value={secret.value} />
        ))}
        <DialogFooter>
          <Button onClick={onDone}>Done</Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
      <div role="radiogroup" aria-label="App" className="grid grid-cols-3 gap-2">
        {appKinds.map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="radio"
            aria-checked={kind === candidate}
            onClick={() => {
              setKind(candidate);
              setError("");
            }}
            className={cn(
              "rounded-2xl border px-3 py-3 text-sm font-semibold transition",
              kind === candidate
                ? "border-lavender bg-lavender-soft text-violet-strong"
                : "border-line hover:bg-ink/5"
            )}
          >
            {appDefinitions[candidate].name}
          </button>
        ))}
      </div>
      <Field>
        <FieldLabel htmlFor="app-name">Name</FieldLabel>
        <Input
          id="app-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={definition.name}
          maxLength={100}
        />
      </Field>
      {definition.address ? (
        <Field>
          <FieldLabel htmlFor="app-address">{definition.address.label}</FieldLabel>
          <Input
            id="app-address"
            inputMode="url"
            autoComplete="off"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder={definition.address.placeholder}
            required={definition.address.required}
          />
        </Field>
      ) : null}
      {needsLogs ? <FieldError>Logs must be enabled for this team.</FieldError> : null}
      <FieldError>{error}</FieldError>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="coral" disabled={busy || needsLogs}>
          {busy ? "Adding…" : `Add ${definition.name}`}
        </Button>
      </DialogFooter>
    </form>
  );
}

function SecretField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex gap-2">
        <Input value={value} readOnly className="font-mono" aria-label={label} />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
            } catch {
              toast.error("Copy failed. Select the value and copy it manually.");
            }
          }}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </Field>
  );
}
