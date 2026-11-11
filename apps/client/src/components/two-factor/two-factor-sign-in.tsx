import {
  appRoutes,
  type AuthSession,
  type SignInChallenge,
  type TwoFactorEnrollment,
} from "@mimorii/contracts";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { enrollTwoFactor, isEndedChallenge, verifyTwoFactor } from "../../lib/two-factor";
import { Button } from "../ui/button";
import { FieldError } from "../ui/field";
import { AuthenticatorSetup } from "./authenticator-setup";
import { RecoveryCodesPanel } from "./recovery-codes-panel";
import { VerificationCodeField } from "./verification-code-field";

export function TwoFactorSignIn({
  challenge,
  email,
  onChallengeUsed,
  onSignedIn,
  onRestart,
}: {
  challenge: SignInChallenge;
  email: string;
  onChallengeUsed: () => void;
  onSignedIn: (session: AuthSession) => void;
  onRestart: (message: string) => void;
}) {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [enrollment, setEnrollment] = useState<TwoFactorEnrollment | null>(null);
  const enrolling = challenge.purpose === "enrollment";

  async function submitCode(value: string) {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      if (enrolling) {
        const enrolled = await enrollTwoFactor(challenge.challengeToken, value);
        onChallengeUsed();
        setEnrollment(enrolled);
        return;
      }
      const session = await verifyTwoFactor(challenge.challengeToken, value);
      onChallengeUsed();
      onSignedIn(session);
      if (recovery) {
        toast("Signed in with a recovery code", {
          action: {
            label: "Two-factor settings",
            onClick: () => void navigate(appRoutes.account),
          },
        });
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Verification failed";
      if (isEndedChallenge(cause)) {
        onRestart(message);
        return;
      }
      setError(message);
      if (!recovery) setCode("");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void submitCode(code);
  }

  if (enrollment) {
    return (
      <>
        <h1 className="font-display text-3xl font-black tracking-tight">Recovery codes</h1>
        <div className="mt-8 grid gap-5">
          <RecoveryCodesPanel codes={enrollment.recoveryCodes} email={email} />
          <Button
            type="button"
            variant="coral"
            size="lg"
            onClick={() => onSignedIn(enrollment.session)}
          >
            Continue
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="font-display text-3xl font-black tracking-tight">
        {enrolling ? "Set up two-factor authentication" : "Two-factor authentication"}
      </h1>
      {enrolling ? (
        <p className="mt-2 text-sm text-muted">
          Scan the QR code with an authenticator app, then enter the code it shows.
        </p>
      ) : (
        <p className="mt-2 break-all text-sm text-muted">{email}</p>
      )}
      <form className="mt-8 grid gap-5" onSubmit={submit}>
        {challenge.purpose === "enrollment" ? <AuthenticatorSetup setup={challenge.setup} /> : null}
        <VerificationCodeField
          id="two-factor-code"
          value={code}
          onChange={setCode}
          recovery={recovery}
          onRecoveryChange={enrolling ? undefined : setRecovery}
          autoFocus
          onComplete={(value) => void submitCode(value)}
        />
        <FieldError>{error}</FieldError>
        <Button type="submit" variant="coral" size="lg" disabled={busy}>
          {busy ? "Verifying…" : "Verify"}
        </Button>
      </form>
      <button
        type="button"
        className="mt-5 text-sm font-medium text-muted hover:text-ink"
        onClick={() => onRestart("")}
      >
        Back
      </button>
    </>
  );
}
