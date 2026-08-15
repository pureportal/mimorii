import type { ApiTokenSummary, CreatedApiToken } from "@mimorii/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, jsonBody } from "../lib/api";
import { formatRelative } from "../lib/format";
import { ErrorState, LoadingState } from "./page-state";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { ConfirmationDialog } from "./ui/confirmation-dialog";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";
import { Field, FieldLabel } from "./ui/field";
import { Input, Select } from "./ui/input";

export function ApiTokensCard() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [created, setCreated] = useState<CreatedApiToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeToken, setRevokeToken] = useState<ApiTokenSummary | null>(null);
  const tokens = useQuery({
    queryKey: ["api-tokens"],
    queryFn: () => api<ApiTokenSummary[]>("/auth/api-tokens"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/auth/api-tokens/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
      toast.success("Token revoked");
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setRevokeToken(null),
  });

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const expiresInDays = form.get("expiresInDays");
    try {
      const result = await api<CreatedApiToken>("/auth/api-tokens", {
        method: "POST",
        ...jsonBody({
          name: form.get("name"),
          expiresInDays: expiresInDays === "never" ? null : Number(expiresInDays),
        }),
      });
      setFormOpen(false);
      setCreated(result);
      await queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Token could not be created");
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
              <KeyRound />
            </span>
            <h2 className="font-display font-bold">API tokens</h2>
          </div>
          <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
            <Plus /> Create
          </Button>
        </CardHeader>
        <CardContent>
          {tokens.isLoading ? <LoadingState /> : null}
          {tokens.isError ? <ErrorState retry={() => void tokens.refetch()} /> : null}
          {tokens.data?.length ? (
            <div className="divide-y divide-line rounded-xl border border-line">
              {tokens.data.map((token) => (
                <div key={token.id} className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{token.name}</p>
                    <p className="mt-1 font-mono text-xs text-muted">{token.prefix}…</p>
                    <p className="mt-1 text-xs text-muted">
                      Used {formatRelative(token.lastUsedAt)} · Expires{" "}
                      {formatRelative(token.expiresAt)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Revoke ${token.name}`}
                    onClick={() => setRevokeToken(token)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          ) : tokens.isSuccess ? (
            <div className="grid h-24 place-items-center text-sm text-muted">No API tokens</div>
          ) : null}
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={Boolean(revokeToken)}
        onOpenChange={(open) => {
          if (!open) setRevokeToken(null);
        }}
        title={`Revoke ${revokeToken?.name ?? "token"}?`}
        confirmLabel="Revoke token"
        pending={remove.isPending}
        onConfirm={() => {
          if (revokeToken) remove.mutate(revokeToken.id);
        }}
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader title="Create API token" />
          <form className="grid gap-4" onSubmit={create}>
            <Field>
              <FieldLabel htmlFor="api-token-name">Name</FieldLabel>
              <Input id="api-token-name" name="name" required maxLength={100} />
            </Field>
            <Field>
              <FieldLabel htmlFor="api-token-expiry">Expires</FieldLabel>
              <Select id="api-token-expiry" name="expiresInDays" defaultValue="90">
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="365">1 year</option>
                <option value="never">Never</option>
              </Select>
            </Field>
            <Button type="submit">
              <KeyRound /> Create token
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(created)}
        onOpenChange={(open) => {
          if (!open) {
            setCreated(null);
            setCopied(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader title="API token">Copy this token now. It is shown once.</DialogHeader>
          <div className="flex gap-2">
            <Input value={created?.token ?? ""} readOnly className="font-mono text-xs" />
            <Button
              variant="outline"
              size="icon"
              aria-label="Copy API token"
              onClick={async () => {
                if (!created) return;
                try {
                  await navigator.clipboard.writeText(created.token);
                  setCopied(true);
                } catch {
                  toast.error("Token could not be copied");
                }
              }}
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
          <Button
            onClick={() => {
              setCreated(null);
              setCopied(false);
            }}
          >
            Done
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
