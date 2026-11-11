import type { TwoFactorReplacement } from "@mimorii/contracts";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  confirmAuthenticatorReplacement,
  isEndedChallenge,
  regenerateRecoveryCodes,
  startAuthenticatorReplacement,
} from "../../lib/two-factor";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader } from "../ui/dialog";
import { Field, FieldError, FieldLabel } from "../ui/field";
import { PasswordInput } from "../ui/input";
import { AuthenticatorSetup } from "./authenticator-setup";
import { RecoveryCodesPanel } from "./recovery-codes-panel";
import { VerificationCodeField } from "./verification-code-field";

interface TwoFactorDialogProps {
  email: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

export function RecoveryCodesDialog({ email, onClose, onChanged }: TwoFactorDialogProps) {
  const [codes, setCodes] = useState<string[] | null>(null);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader title="New recovery codes">
          {codes ? null : "Your current recovery codes stop working."}
        </DialogHeader>
        {codes ? (
          <div className="grid gap-5">
            <RecoveryCodesPanel codes={codes} email={email} />
            <Button type="button" variant="coral" className="justify-self-end" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <StepUpForm
            submitLabel="Create codes"
            onVerify={async (password, code) => {
              setCodes((await regenerateRecoveryCodes(password, code)).recoveryCodes);
              await onChanged();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ReplaceAuthenticatorDialog({ onClose, onChanged }: TwoFactorDialogProps) {
  const [replacement, setReplacement] = useState<TwoFactorReplacement | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirmCode(value: string) {
    if (!replacement || busy) return;
    setError("");
    setBusy(true);
    try {
      await confirmAuthenticatorReplacement(replacement.challengeToken, value);
      await onChanged();
      toast.success("Authenticator replaced");
      onClose();
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Authenticator could not be replaced";
      if (isEndedChallenge(cause)) setReplacement(null);
      setCode("");
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  function confirm(event: FormEvent) {
    event.preventDefault();
    void confirmCode(code);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader title="Replace authenticator">
          {replacement
            ? "Scan the QR code with your new authenticator app. Your other devices will be signed out."
            : null}
        </DialogHeader>
        {replacement ? (
          <form className="grid gap-5" onSubmit={confirm}>
            <AuthenticatorSetup setup={replacement.setup} />
            <VerificationCodeField
              id="replacement-code"
              value={code}
              onChange={setCode}
              autoFocus
              onComplete={(value) => void confirmCode(value)}
            />
            <FieldError>{error}</FieldError>
            <Button type="submit" variant="coral" className="justify-self-end" disabled={busy}>
              Replace
            </Button>
          </form>
        ) : (
          <StepUpForm
            submitLabel="Continue"
            error={error}
            onVerify={async (password, verificationCode) => {
              setError("");
              setReplacement(await startAuthenticatorReplacement(password, verificationCode));
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function StepUpForm({
  submitLabel,
  error: externalError = "",
  onVerify,
}: {
  submitLabel: string;
  error?: string;
  onVerify: (password: string, code: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await onVerify(password, code);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
      <Field>
        <FieldLabel htmlFor="step-up-password">Password</FieldLabel>
        <PasswordInput
          id="step-up-password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </Field>
      <VerificationCodeField
        id="step-up-code"
        value={code}
        onChange={setCode}
        recovery={recovery}
        onRecoveryChange={setRecovery}
      />
      <FieldError>{error || externalError}</FieldError>
      <Button type="submit" variant="coral" className="justify-self-end" disabled={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}
