import { teamRoles, type CreatedApiToken, type TeamRole } from "@mimorii/contracts";
import { KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, jsonBody } from "../lib/api";
import { apiTokenAccessLabels, teamRoleLabels } from "../lib/api-tokens";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";
import { Field, FieldLabel } from "./ui/field";
import { Input, Select } from "./ui/input";

export function ApiTokenDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (token: CreatedApiToken) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title="Create API token" />
        <ApiTokenForm onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  );
}

function ApiTokenForm({ onCreated }: { onCreated: (token: CreatedApiToken) => void }) {
  const { session, activeTeam } = useAuth();
  const [selectedTeams, setSelectedTeams] = useState<ReadonlyMap<string, TeamRole>>(
    () => new Map(activeTeam ? [[activeTeam.id, "viewer"]] : [])
  );
  const [pending, setPending] = useState(false);

  function selectTeam(teamId: string, role: TeamRole | null) {
    setSelectedTeams((current) => {
      const next = new Map(current);
      if (role) next.set(teamId, role);
      else next.delete(teamId);
      return next;
    });
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const expiresInDays = form.get("expiresInDays");
    setPending(true);
    try {
      onCreated(
        await api<CreatedApiToken>("/auth/api-tokens", {
          method: "POST",
          ...jsonBody({
            name: form.get("name"),
            access: form.get("access"),
            teams: [...selectedTeams].map(([teamId, role]) => ({ teamId, role })),
            expiresInDays: expiresInDays === "never" ? null : Number(expiresInDays),
          }),
        })
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Token could not be created");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={create}>
      <Field>
        <FieldLabel htmlFor="api-token-name">Name</FieldLabel>
        <Input id="api-token-name" name="name" required maxLength={100} />
      </Field>
      <Field>
        <FieldLabel htmlFor="api-token-access">Access</FieldLabel>
        <Select id="api-token-access" name="access" defaultValue="read">
          <option value="read">{apiTokenAccessLabels.read}</option>
          <option value="write">{apiTokenAccessLabels.write}</option>
        </Select>
      </Field>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium text-ink">Teams</legend>
        <div className="grid max-h-64 gap-2 overflow-y-auto">
          {session?.teams.map((team) => {
            const role = selectedTeams.get(team.id);
            return (
              <div
                key={team.id}
                className="flex min-h-14 items-center gap-3 rounded-xl border border-line px-3 py-1.5"
              >
                <label className="flex min-w-0 flex-1 items-center gap-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={Boolean(role)}
                    onChange={(event) =>
                      selectTeam(team.id, event.target.checked ? "viewer" : null)
                    }
                    className="size-4 shrink-0 accent-violet-strong"
                  />
                  <span className="truncate">{team.name}</span>
                </label>
                {role ? (
                  <Select
                    aria-label={`${team.name} role`}
                    value={role}
                    onChange={(event) => selectTeam(team.id, event.target.value as TeamRole)}
                    className="w-32"
                  >
                    {teamRoles.slice(teamRoles.indexOf(team.role)).map((option) => (
                      <option key={option} value={option}>
                        {teamRoleLabels[option]}
                      </option>
                    ))}
                  </Select>
                ) : null}
              </div>
            );
          })}
        </div>
      </fieldset>
      <Field>
        <FieldLabel htmlFor="api-token-expiry">Expires</FieldLabel>
        <Select id="api-token-expiry" name="expiresInDays" defaultValue="90">
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="365">1 year</option>
          <option value="never">Never</option>
        </Select>
      </Field>
      <Button type="submit" disabled={pending || selectedTeams.size === 0}>
        <KeyRound /> Create token
      </Button>
    </form>
  );
}
