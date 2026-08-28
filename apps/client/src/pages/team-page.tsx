import type { TeamInvitationSummary, TeamRole } from "@mimorii/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Crown, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "../components/page-state";
import { TeamLogoField } from "../components/team-logo-field";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { ConfirmationDialog } from "../components/ui/confirmation-dialog";
import { Dialog, DialogContent, DialogHeader } from "../components/ui/dialog";
import { Field, FieldError, FieldLabel } from "../components/ui/field";
import { Input, Select } from "../components/ui/input";
import { ApiError, api, jsonBody } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatCount } from "../lib/format";

interface Member {
  id: string;
  email: string;
  name: string;
  role: TeamRole;
  joinedAt: string;
}

interface CreatedInvite {
  id: string;
  email: string;
  role: TeamRole;
  token: string;
  expiresAt: string;
}

type TeamConfirmation =
  | { action: "remove-member"; member: Member }
  | { action: "revoke-invitation"; invitation: TeamInvitationSummary };

export function TeamPage() {
  const { activeTeam, refreshIdentity } = useAuth();
  const [teamOpen, setTeamOpen] = useState(false);
  if (activeTeam) return <TeamDetailsPage />;
  return (
    <Card data-guide-page="team-summary">
      <CardContent className="grid justify-items-center gap-5 py-14 text-center">
        <div>
          <h2 className="font-display text-2xl font-black tracking-tight">Create a team</h2>
        </div>
        <Button variant="coral" onClick={() => setTeamOpen(true)}>
          <Plus /> New team
        </Button>
        <CreateTeamDialog open={teamOpen} onOpenChange={setTeamOpen} onCreated={refreshIdentity} />
      </CardContent>
    </Card>
  );
}

function TeamDetailsPage() {
  const { session, activeTeam, refreshIdentity } = useAuth();
  const teamId = activeTeam!.id;
  const queryClient = useQueryClient();
  const canManage = activeTeam!.role === "owner" || activeTeam!.role === "admin";
  const [inviteOpen, setInviteOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<TeamConfirmation | null>(null);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const members = useQuery({
    queryKey: ["members", teamId],
    queryFn: () => api<Member[]>(`/teams/${teamId}/members`),
  });
  const invitations = useQuery({
    queryKey: ["team-invitations", teamId],
    queryFn: () => api<TeamInvitationSummary[]>(`/teams/${teamId}/invitations`),
    enabled: canManage,
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["members", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["team-invitations", teamId] }),
    ]);
  };

  if (members.isLoading || (canManage && invitations.isLoading)) return <LoadingState />;
  if (members.isError || (canManage && invitations.isError)) {
    return (
      <ErrorState
        retry={() => {
          void members.refetch();
          void invitations.refetch();
        }}
      />
    );
  }

  async function updateRole(member: Member, role: TeamRole) {
    try {
      await api(`/teams/${teamId}/members/${member.id}`, {
        method: "PATCH",
        ...jsonBody({ role }),
      });
      await refresh();
      toast.success("Role updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Role could not be updated");
    }
  }

  async function remove(member: Member) {
    setConfirmationPending(true);
    try {
      await api(`/teams/${teamId}/members/${member.id}`, { method: "DELETE" });
      await refresh();
      await refreshIdentity();
      toast.success("Member removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Member could not be removed");
    } finally {
      setConfirmationPending(false);
      setConfirmation(null);
    }
  }

  async function revokeInvitation(invitation: TeamInvitationSummary) {
    setConfirmationPending(true);
    try {
      await api(`/teams/${teamId}/invitations/${invitation.id}`, { method: "DELETE" });
      await refresh();
      toast.success("Invitation revoked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invitation could not be revoked");
    } finally {
      setConfirmationPending(false);
      setConfirmation(null);
    }
  }

  return (
    <div className="space-y-6">
      <div
        data-guide-page="team-summary"
        className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"
      >
        <div>
          <h2 className="font-display text-2xl font-black tracking-tight">{activeTeam?.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {formatCount(members.data?.length ?? 0, "member")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <Button variant="outline" onClick={() => setManageOpen(true)}>
              <Pencil /> Edit team
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => setTeamOpen(true)}>
            <Plus /> New team
          </Button>
          {canManage ? (
            <Button variant="coral" onClick={() => setInviteOpen(true)}>
              <UserPlus /> Invite
            </Button>
          ) : null}
        </div>
      </div>
      <Card data-guide-page="team-members">
        <CardHeader>
          <h3 className="font-display font-bold">Members</h3>
        </CardHeader>
        <CardContent className="p-0 md:p-5 md:pt-2">
          {members.data?.length ? (
            <>
              <div className="divide-y divide-line md:hidden">
                {members.data.map((member) => (
                  <article key={member.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-lavender-soft font-display text-xs font-black text-violet-strong">
                        {member.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="truncate font-semibold">{member.name}</h4>
                          {member.role === "owner" ? (
                            <Crown className="size-3.5 shrink-0 text-warning" />
                          ) : null}
                        </div>
                        <p className="mt-1 break-all text-xs text-muted">{member.email}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      {canManage ? (
                        <Select
                          aria-label={`Role for ${member.name}`}
                          value={member.role}
                          onChange={(event) =>
                            void updateRole(member, event.target.value as TeamRole)
                          }
                          className="h-10 w-32 text-xs"
                        >
                          <option value="owner">Owner</option>
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                          <option value="viewer">Viewer</option>
                        </Select>
                      ) : (
                        <span className="text-sm capitalize text-muted">{member.role}</span>
                      )}
                      {canManage && member.id !== session?.user.id ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-danger"
                          aria-label={`Remove ${member.name}`}
                          onClick={() => setConfirmation({ action: "remove-member", member })}
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
              <table className="hidden w-full min-w-[620px] text-left text-sm md:table">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="px-5 pb-3 font-medium sm:px-0">Member</th>
                    <th className="pb-3 font-medium">Email</th>
                    <th className="pb-3 font-medium">Role</th>
                    <th className="pb-3" />
                  </tr>
                </thead>
                <tbody>
                  {members.data.map((member) => (
                    <tr key={member.id} className="border-t border-line">
                      <td className="px-5 py-4 sm:px-0">
                        <div className="flex items-center gap-3">
                          <span className="grid size-9 place-items-center rounded-full bg-lavender-soft font-display text-xs font-black text-violet-strong">
                            {member.name.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="font-semibold">{member.name}</span>
                          {member.role === "owner" ? (
                            <Crown className="size-3.5 text-warning" />
                          ) : null}
                        </div>
                      </td>
                      <td className="py-4 text-muted">{member.email}</td>
                      <td className="py-4">
                        {canManage ? (
                          <Select
                            aria-label={`Role for ${member.name}`}
                            value={member.role}
                            onChange={(event) =>
                              void updateRole(member, event.target.value as TeamRole)
                            }
                            className="h-9 w-28 text-xs"
                          >
                            <option value="owner">Owner</option>
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                            <option value="viewer">Viewer</option>
                          </Select>
                        ) : (
                          <span className="capitalize text-muted">{member.role}</span>
                        )}
                      </td>
                      <td className="pr-5 text-right sm:pr-0">
                        {canManage && member.id !== session?.user.id ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-danger"
                            aria-label={`Remove ${member.name}`}
                            onClick={() => setConfirmation({ action: "remove-member", member })}
                          >
                            <Trash2 />
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <EmptyState title="No members" />
          )}
        </CardContent>
      </Card>
      {canManage ? (
        <Card>
          <CardHeader>
            <h3 className="font-display font-bold">Invitations</h3>
          </CardHeader>
          <CardContent className="p-0 md:p-5 md:pt-2">
            {invitations.data?.length ? (
              <>
                <div className="divide-y divide-line md:hidden">
                  {invitations.data.map((invitation) => (
                    <article key={invitation.id} className="p-4">
                      <p className="break-all font-semibold">{invitation.email}</p>
                      <div className="mt-2 flex items-center gap-2 text-xs capitalize text-muted">
                        <span>{invitation.role}</span>
                        <span aria-hidden="true">·</span>
                        <span>{invitation.status}</span>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger"
                          onClick={() =>
                            setConfirmation({ action: "revoke-invitation", invitation })
                          }
                        >
                          <Trash2 /> Revoke
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
                <table className="hidden w-full min-w-[560px] text-left text-sm md:table">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="pb-3 font-medium">Email</th>
                      <th className="pb-3 font-medium">Role</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.data.map((invitation) => (
                      <tr key={invitation.id} className="border-t border-line">
                        <td className="py-3 font-semibold">{invitation.email}</td>
                        <td className="py-3 capitalize text-muted">{invitation.role}</td>
                        <td className="py-3 capitalize text-muted">{invitation.status}</td>
                        <td className="py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger"
                            onClick={() =>
                              setConfirmation({ action: "revoke-invitation", invitation })
                            }
                          >
                            <Trash2 /> Revoke
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <EmptyState title="No invitations" />
            )}
          </CardContent>
        </Card>
      ) : null}
      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        teamId={teamId}
        onCreated={refresh}
      />
      <CreateTeamDialog open={teamOpen} onOpenChange={setTeamOpen} onCreated={refreshIdentity} />
      <ManageTeamDialog
        key={`${teamId}-${activeTeam!.name}-${activeTeam!.logoUpdatedAt ?? "no-logo"}`}
        open={manageOpen}
        onOpenChange={setManageOpen}
        teamId={teamId}
        name={activeTeam!.name}
        logoUpdatedAt={activeTeam!.logoUpdatedAt ?? null}
        canDelete={activeTeam!.role === "owner"}
        onChanged={refreshIdentity}
      />
      <ConfirmationDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
        title={
          confirmation?.action === "remove-member"
            ? `Remove ${confirmation.member.name} from ${activeTeam!.name}?`
            : `Revoke the invitation for ${confirmation?.invitation.email ?? "this address"}?`
        }
        confirmLabel={
          confirmation?.action === "remove-member" ? "Remove member" : "Revoke invitation"
        }
        pending={confirmationPending}
        onConfirm={() => {
          if (!confirmation) return;
          if (confirmation.action === "remove-member") void remove(confirmation.member);
          else void revokeInvitation(confirmation.invitation);
        }}
      />
    </div>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  teamId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  onCreated: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<TeamRole, "owner">>("member");
  const [invite, setInvite] = useState<CreatedInvite | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setInvite(
        await api<CreatedInvite>(`/teams/${teamId}/invitations`, {
          method: "POST",
          ...jsonBody({ email, role }),
        })
      );
      await onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invitation could not be created");
    } finally {
      setBusy(false);
    }
  }
  function close(value: boolean) {
    if (!value) {
      setInvite(null);
      setEmail("");
      setError("");
    }
    onOpenChange(value);
  }
  const link = invite ? `${window.location.origin}/invite/${invite.token}` : "";
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader title={invite ? "Invitation ready" : "Invite member"}>
          {invite ? `Send this link to ${invite.email}.` : undefined}
        </DialogHeader>
        {invite ? (
          <div className="grid gap-4">
            <div className="rounded-xl border border-line bg-ink/[.035] p-3 font-mono text-xs break-all">
              {link}
            </div>
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(link);
                toast.success("Invite link copied");
              }}
            >
              <Copy /> Copy link
            </Button>
            <Button variant="ghost" onClick={() => close(false)}>
              Done
            </Button>
          </div>
        ) : (
          <form className="grid gap-5" onSubmit={submit}>
            <Field>
              <FieldLabel htmlFor="invite-email">Email</FieldLabel>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-role">Role</FieldLabel>
              <Select
                id="invite-role"
                value={role}
                onChange={(event) => setRole(event.target.value as typeof role)}
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </Select>
            </Field>
            <FieldError>{error}</FieldError>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="coral" disabled={busy}>
                {busy ? "Creating…" : "Create invite"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateTeamDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [logoError, setLogoError] = useState("");
  const [logoReady, setLogoReady] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setLogo(null);
    setLogoError("");
    setLogoReady(true);
    setError("");
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!logoReady) return;
    setBusy(true);
    setError("");
    try {
      await api("/teams", { method: "POST", body: teamMutationBody(name, logo) });
      await onCreated();
      toast.success("Team created");
      onOpenChange(false);
      setName("");
      setLogo(null);
    } catch (cause) {
      setError(teamMutationFailureMessage(cause, "Team could not be created. Try again."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeDisabled={busy}>
        <DialogHeader title="New team" />
        <form className="grid gap-5" onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor="team-name">Name</FieldLabel>
            <Input
              id="team-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={80}
            />
          </Field>
          <TeamLogoField
            name={name}
            file={logo}
            disabled={busy}
            uploading={busy && Boolean(logo)}
            validationError={logoError}
            onFileChange={setLogo}
            onInteraction={() => setError("")}
            onReadyChange={setLogoReady}
            onValidationErrorChange={setLogoError}
          />
          <FieldError>{error ? <span role="alert">{error}</span> : null}</FieldError>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="coral" disabled={busy || !logoReady}>
              {busy ? "Creating…" : "Create team"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManageTeamDialog({
  open,
  onOpenChange,
  teamId,
  name: initialName,
  logoUpdatedAt,
  canDelete,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  name: string;
  logoUpdatedAt: string | null;
  canDelete: boolean;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoError, setLogoError] = useState("");
  const [logoReady, setLogoReady] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setLogo(null);
    setLogoError("");
    setLogoReady(true);
    setError("");
  }, [initialName, open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!logoReady) return;
    setBusy(true);
    setError("");
    try {
      await api(`/teams/${teamId}`, {
        method: "PATCH",
        body: teamMutationBody(name, logo),
      });
      await onChanged();
      toast.success("Team updated");
      onOpenChange(false);
    } catch (cause) {
      setError(teamMutationFailureMessage(cause, "Team could not be updated. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api(`/teams/${teamId}`, {
        method: "DELETE",
        ...jsonBody({ name: initialName }),
      });
      await onChanged();
      toast.success("Team deleted");
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Team could not be deleted");
    } finally {
      setBusy(false);
      setDeleteOpen(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent closeDisabled={busy}>
          <DialogHeader title="Edit team" />
          <form className="grid gap-5" onSubmit={submit}>
            <Field>
              <FieldLabel htmlFor="edit-team-name">Name</FieldLabel>
              <Input
                id="edit-team-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={80}
              />
            </Field>
            <TeamLogoField
              team={{ id: teamId, name, logoUpdatedAt }}
              name={name}
              file={logo}
              disabled={busy}
              uploading={busy && Boolean(logo)}
              validationError={logoError}
              onFileChange={setLogo}
              onInteraction={() => setError("")}
              onReadyChange={setLogoReady}
              onValidationErrorChange={setLogoError}
            />
            <FieldError>{error ? <span role="alert">{error}</span> : null}</FieldError>
            <div className="grid gap-2 min-[460px]:flex min-[460px]:justify-between">
              {canDelete ? (
                <Button
                  type="button"
                  variant="danger"
                  className="w-full min-[460px]:w-auto"
                  disabled={busy}
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 /> Delete team
                </Button>
              ) : (
                <span />
              )}
              <div className="grid grid-cols-2 gap-2 min-[460px]:flex">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full min-[460px]:w-auto"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="coral"
                  className="w-full min-[460px]:w-auto"
                  disabled={busy || !logoReady}
                >
                  {busy ? "Saving…" : "Save team"}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${initialName}?`}
        description="All of its monitoring data will also be deleted."
        confirmLabel="Delete team"
        pending={busy}
        onConfirm={() => void remove()}
      />
    </>
  );
}

function teamMutationBody(name: string, logo: File | null): FormData {
  const body = new FormData();
  body.set("name", name);
  if (logo) body.set("logo", logo);
  return body;
}

function teamMutationFailureMessage(cause: unknown, fallback: string): string {
  return cause instanceof ApiError && cause.status < 500 ? cause.message : fallback;
}
