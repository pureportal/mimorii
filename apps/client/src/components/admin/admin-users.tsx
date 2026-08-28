import type { GlobalAdminUsersPage, GlobalAdminUserSummary } from "@mimorii/contracts";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Search, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "../page-state";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { ConfirmationDialog } from "../ui/confirmation-dialog";
import { Dialog, DialogContent, DialogHeader } from "../ui/dialog";
import { Field, FieldError, FieldLabel } from "../ui/field";
import { Input, Select } from "../ui/input";
import { api, jsonBody } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatCount, formatRelative } from "../../lib/format";

const PAGE_SIZE = 20;

export function AdminUsers() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<GlobalAdminUserSummary | null>(null);
  const [revokeUser, setRevokeUser] = useState<GlobalAdminUserSummary | null>(null);
  const [revoking, setRevoking] = useState(false);
  const users = useInfiniteQuery({
    queryKey: ["global-admin", "users", search, status],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(pageParam),
        status,
      });
      if (search) query.set("search", search);
      return api<GlobalAdminUsersPage>(`/admin/users?${query}`);
    },
    getNextPageParam: (page) =>
      page.offset + page.limit < page.total ? page.offset + page.limit : undefined,
  });
  const rows = users.data?.pages.flatMap((page) => page.users) ?? [];
  const total = users.data?.pages[0]?.total ?? 0;

  if (users.isLoading) return <LoadingState />;
  if (users.isError) return <ErrorState retry={() => void users.refetch()} />;

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(draftSearch.trim());
  }

  async function revokeSessions(user: GlobalAdminUserSummary) {
    setRevoking(true);
    try {
      await api(`/admin/users/${user.id}/revoke-sessions`, { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: ["global-admin", "users"] });
      toast.success("Sessions revoked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sessions could not be revoked");
    } finally {
      setRevoking(false);
      setRevokeUser(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-col sm:flex-row sm:items-end">
        <div>
          <h3 className="font-display font-bold">Users</h3>
          <p className="mt-1 text-xs text-muted">{formatCount(total, "account")}</p>
        </div>
        <form
          className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:w-auto"
          onSubmit={submitSearch}
        >
          <Input
            aria-label="Search users"
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            maxLength={100}
            className="min-w-0 sm:w-56"
          />
          <Button type="submit" variant="outline" size="icon" aria-label="Search">
            <Search />
          </Button>
          <Select
            aria-label="Account status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="col-span-2 w-full sm:w-36"
          >
            <option value="all">All accounts</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
            <option value="administrators">Administrators</option>
          </Select>
        </form>
      </CardHeader>
      <CardContent className="p-0 xl:p-5 xl:pt-2">
        {rows.length ? (
          <>
            <div className="divide-y divide-line xl:hidden">
              {rows.map((user) => (
                <article key={user.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="truncate font-semibold">{user.name}</h4>
                      <p className="mt-1 break-all text-xs text-muted">{user.email}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs">
                      <span className={user.disabledAt ? "text-danger" : "text-success-strong"}>
                        {user.disabledAt ? "Disabled" : "Enabled"}
                      </span>
                      {user.isGlobalAdmin ? (
                        <ShieldCheck
                          className="size-4 text-violet-strong"
                          aria-label="Global Administrator"
                        />
                      ) : null}
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm">
                    <div>
                      <dt className="text-[11px] text-muted">Teams</dt>
                      <dd className="mt-1 font-medium">{user.teamCount.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-muted">Last sign-in</dt>
                      <dd className="mt-1 font-medium">{formatRelative(user.lastSignedInAt)}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex justify-end gap-1">
                    <Button variant="outline" size="sm" onClick={() => setSelected(user)}>
                      Manage
                    </Button>
                    {user.id !== session!.user.id ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Revoke sessions for ${user.name}`}
                        onClick={() => setRevokeUser(user)}
                      >
                        <KeyRound />
                      </Button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
            <table className="hidden w-full min-w-[900px] text-left text-sm xl:table">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="px-5 pb-3 font-medium sm:px-0">User</th>
                  <th className="pb-3 font-medium">Access</th>
                  <th className="pb-3 font-medium">Teams</th>
                  <th className="pb-3 font-medium">Last sign-in</th>
                  <th className="pb-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((user) => (
                  <tr key={user.id} className="border-t border-line">
                    <td className="px-5 py-4 sm:px-0">
                      <p className="font-semibold">{user.name}</p>
                      <p className="mt-0.5 text-xs text-muted">{user.email}</p>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center gap-2">
                        <span className={user.disabledAt ? "text-danger" : "text-success-strong"}>
                          {user.disabledAt ? "Disabled" : "Enabled"}
                        </span>
                        {user.isGlobalAdmin ? (
                          <ShieldCheck
                            className="size-4 text-violet-strong"
                            aria-label="Global Administrator"
                          />
                        ) : null}
                      </div>
                    </td>
                    <td className="py-4 text-muted">{user.teamCount.toLocaleString()}</td>
                    <td className="py-4 text-muted">{formatRelative(user.lastSignedInAt)}</td>
                    <td className="pr-5 text-right sm:pr-0">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setSelected(user)}>
                          Manage
                        </Button>
                        {user.id !== session!.user.id ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Revoke sessions for ${user.name}`}
                            onClick={() => setRevokeUser(user)}
                          >
                            <KeyRound />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <EmptyState title="No accounts" />
        )}
      </CardContent>
      {users.hasNextPage ? (
        <div className="flex justify-center border-t border-line p-4">
          <Button
            variant="outline"
            onClick={() => void users.fetchNextPage()}
            disabled={users.isFetchingNextPage}
          >
            Load more
          </Button>
        </div>
      ) : null}
      {selected ? (
        <AccessDialog
          key={selected.updatedAt}
          user={selected}
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          onSaved={async () => {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ["global-admin", "users"] }),
              queryClient.invalidateQueries({ queryKey: ["global-admin", "statistics"] }),
            ]);
            setSelected(null);
          }}
        />
      ) : null}
      <ConfirmationDialog
        open={Boolean(revokeUser)}
        onOpenChange={(open) => {
          if (!open) setRevokeUser(null);
        }}
        title={`Revoke every session and API token for ${revokeUser?.name ?? "this user"}?`}
        confirmLabel="Revoke sessions and tokens"
        pending={revoking}
        onConfirm={() => {
          if (revokeUser) void revokeSessions(revokeUser);
        }}
      />
    </Card>
  );
}

function AccessDialog({
  user,
  open,
  onOpenChange,
  onSaved,
}: {
  user: GlobalAdminUserSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(user.isGlobalAdmin);
  const [disabled, setDisabled] = useState(user.disabledAt !== null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function saveAccess() {
    setBusy(true);
    setError("");
    try {
      await api(`/admin/users/${user.id}/access`, {
        method: "PATCH",
        ...jsonBody({
          isGlobalAdmin,
          disabled,
          expectedIsGlobalAdmin: user.isGlobalAdmin,
          expectedDisabled: user.disabledAt !== null,
        }),
      });
      await onSaved();
      toast.success("Account access updated");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Account access could not be updated");
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if ((disabled && !user.disabledAt) || (!isGlobalAdmin && user.isGlobalAdmin)) {
      setConfirmOpen(true);
      return;
    }
    void saveAccess();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader title={user.name} />
          <form className="grid gap-5" onSubmit={submit}>
            <Field>
              <FieldLabel htmlFor="admin-account-state">Account</FieldLabel>
              <Select
                id="admin-account-state"
                value={disabled ? "disabled" : "enabled"}
                onChange={(event) => setDisabled(event.target.value === "disabled")}
              >
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="admin-platform-role">Platform role</FieldLabel>
              <Select
                id="admin-platform-role"
                value={isGlobalAdmin ? "administrator" : "user"}
                onChange={(event) => setIsGlobalAdmin(event.target.value === "administrator")}
              >
                <option value="user">User</option>
                <option value="administrator">Global Administrator</option>
              </Select>
            </Field>
            <FieldError>{error}</FieldError>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="coral" disabled={busy}>
                Save access
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmationDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Apply the access restrictions to ${user.name}?`}
        confirmLabel="Apply restrictions"
        pending={busy}
        onConfirm={() => void saveAccess()}
      />
    </>
  );
}
