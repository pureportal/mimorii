import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../lib/auth";
import { twoFactorStatusQueryKey, useTwoFactorStatus } from "../../lib/two-factor";
import { cn } from "../../lib/cn";
import { ErrorState, LoadingState } from "../page-state";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { RecoveryCodesDialog, ReplaceAuthenticatorDialog } from "./two-factor-dialogs";

const LOW_RECOVERY_CODE_COUNT = 2;

export function TwoFactorCard() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const status = useTwoFactorStatus();
  const [dialog, setDialog] = useState<"recovery-codes" | "authenticator" | null>(null);
  const remaining = status.data?.recoveryCodesRemaining;

  const dialogProps = {
    email: session!.user.email,
    onClose: () => setDialog(null),
    onChanged: () => queryClient.invalidateQueries({ queryKey: twoFactorStatusQueryKey }),
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-mint/20 text-success-strong">
            <ShieldCheck />
          </span>
          <h2 className="font-display font-bold">Two-factor authentication</h2>
        </div>
      </CardHeader>
      <CardContent>
        {status.isLoading ? <LoadingState /> : null}
        {status.isError ? <ErrorState retry={() => void status.refetch()} /> : null}
        {remaining !== undefined ? (
          <div className="grid gap-4">
            <div className="flex items-center justify-between rounded-xl bg-ink/[.035] p-4 text-sm">
              <span className="text-muted">Recovery codes</span>
              <span
                className={cn(
                  "font-semibold",
                  remaining <= LOW_RECOVERY_CODE_COUNT && "text-danger"
                )}
              >
                {remaining} left
              </span>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setDialog("recovery-codes")}>
                New recovery codes
              </Button>
              <Button variant="outline" onClick={() => setDialog("authenticator")}>
                Replace authenticator
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
      {dialog === "recovery-codes" ? <RecoveryCodesDialog {...dialogProps} /> : null}
      {dialog === "authenticator" ? <ReplaceAuthenticatorDialog {...dialogProps} /> : null}
    </Card>
  );
}
