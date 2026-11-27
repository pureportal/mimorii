import { Download, ShieldCheck, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, apiBlob, jsonBody } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "./ui/dialog";
import { Field, FieldError, FieldLabel } from "./ui/field";
import { PasswordInput } from "./ui/input";

export function PersonalDataCard() {
  const { logout } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      const file = await apiBlob("/auth/account/export");
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = "mimorii-personal-data.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  async function deleteAccount(event: FormEvent) {
    event.preventDefault();
    setDeleteError("");
    setDeleting(true);
    try {
      await api("/auth/account", { method: "DELETE", ...jsonBody({ password }) });
      logout();
      toast.success("Account deleted");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Account could not be deleted");
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
            <ShieldCheck />
          </span>
          <h2 className="font-display font-bold">Your data</h2>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap justify-between gap-3">
        <Button variant="outline" disabled={downloading} onClick={() => void download()}>
          <Download /> Download my data
        </Button>
        <Button variant="danger" onClick={() => setDeleteOpen(true)}>
          <Trash2 /> Delete account
        </Button>
      </CardContent>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) {
            setPassword("");
            setDeleteError("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader title="Delete account?" />
          <form className="grid gap-4" onSubmit={deleteAccount}>
            <p className="text-sm leading-6 text-muted">
              Your account, sign-ins, API tokens, and teams where you are the only member are
              deleted permanently.
            </p>
            <Field>
              <FieldLabel htmlFor="delete-account-password">Password</FieldLabel>
              <PasswordInput
                id="delete-account-password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>
            <FieldError>{deleteError}</FieldError>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" disabled={deleting}>
                Delete account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
