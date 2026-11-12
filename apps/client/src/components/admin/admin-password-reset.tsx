import type { AdminPasswordReset } from "@mimorii/contracts";
import { Copy, Link2, Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, jsonBody } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { Button } from "../ui/button";
import { FieldError } from "../ui/field";
import { Input } from "../ui/input";

export function AdminPasswordResetSection({ userId }: { userId: string }) {
  const [issued, setIssued] = useState<AdminPasswordReset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function issue(sendEmail: boolean) {
    setBusy(true);
    setError("");
    try {
      const result = await api<AdminPasswordReset>(`/admin/users/${userId}/password-reset`, {
        method: "POST",
        ...jsonBody({ sendEmail }),
      });
      setIssued(result);
      if (sendEmail) toast.success("Reset link emailed");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The reset link could not be created");
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Reset link copied");
    } catch {
      toast.error("Copying is unavailable");
    }
  }

  return (
    <div className="grid gap-3 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Password</span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void issue(false)}
          >
            <Link2 /> Create reset link
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void issue(true)}
          >
            <Mail /> Email link
          </Button>
        </div>
      </div>
      {issued ? (
        <div className="grid gap-1.5">
          <div className="flex gap-2">
            <Input
              aria-label="Reset link"
              value={issued.url}
              readOnly
              className="h-9 font-mono text-xs"
              onFocus={(event) => event.target.select()}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Copy reset link"
              onClick={() => void copy(issued.url)}
            >
              <Copy />
            </Button>
          </div>
          <p className="text-xs text-muted">Works once until {formatDateTime(issued.expiresAt)}</p>
        </div>
      ) : null}
      <FieldError>{error}</FieldError>
    </div>
  );
}
