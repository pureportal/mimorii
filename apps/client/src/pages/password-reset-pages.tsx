import type { PasswordResetInspection } from "@mimorii/contracts";
import { CircleCheck, MailCheck } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { VerificationCodeField } from "../components/two-factor/verification-code-field";
import { Button } from "../components/ui/button";
import { Field, FieldError, FieldLabel } from "../components/ui/field";
import { Input, PasswordInput } from "../components/ui/input";
import { api, jsonBody } from "../lib/api";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api<void>("/auth/password-reset", { method: "POST", ...jsonBody({ email }) });
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PasswordResetShell>
      {sent ? (
        <div className="grid gap-4">
          <MailCheck className="size-10 text-mint" />
          <h1 className="font-display text-3xl font-black tracking-tight">Check your email</h1>
          <p className="text-sm text-muted">
            If an account exists for {email}, it gets a reset link that works for 30 minutes.
          </p>
          <Button asChild variant="outline">
            <Link to="/login" state={{ email }}>
              Back to sign in
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <h1 className="font-display text-3xl font-black tracking-tight">Reset password</h1>
          <form className="mt-8 grid gap-5" onSubmit={(event) => void submit(event)}>
            <Field>
              <FieldLabel htmlFor="reset-email">Email</FieldLabel>
              <Input
                id="reset-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </Field>
            <FieldError>{error}</FieldError>
            <Button type="submit" variant="coral" size="lg" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </Button>
          </form>
          <p className="mt-5 text-sm">
            <Link to="/login" className="font-semibold text-violet-strong">
              Back to sign in
            </Link>
          </p>
        </>
      )}
    </PasswordResetShell>
  );
}

export function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = new URLSearchParams(location.hash.slice(1)).get("token") ?? "";
  const [inspection, setInspection] = useState<PasswordResetInspection | null>(null);
  const [loadError, setLoadError] = useState(token ? "" : "This reset link is incomplete.");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    api<PasswordResetInspection>("/auth/password-reset/inspect", {
      method: "POST",
      ...jsonBody({ token }),
    })
      .then((result) => {
        if (active) setInspection(result);
      })
      .catch((cause: unknown) => {
        if (active) setLoadError(cause instanceof Error ? cause.message : "Request failed");
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmation) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api<void>("/auth/password-reset/complete", {
        method: "POST",
        ...jsonBody({ token, password, ...(inspection?.twoFactorRequired ? { code } : {}) }),
      });
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <PasswordResetShell>
        <div className="grid gap-4">
          <CircleCheck className="size-10 text-mint" />
          <h1 className="font-display text-3xl font-black tracking-tight">Password changed</h1>
          <p className="text-sm text-muted">
            You were signed out everywhere, and API tokens were revoked.
          </p>
          <Button
            variant="coral"
            size="lg"
            onClick={() =>
              void navigate("/login", { replace: true, state: { email: inspection?.email } })
            }
          >
            Sign in
          </Button>
        </div>
      </PasswordResetShell>
    );
  }

  return (
    <PasswordResetShell>
      <h1 className="font-display text-3xl font-black tracking-tight">Choose a new password</h1>
      {loadError ? (
        <div className="mt-6 grid gap-4">
          <FieldError>{loadError}</FieldError>
          <Button asChild variant="outline">
            <Link to="/forgot-password">Request a new link</Link>
          </Button>
        </div>
      ) : inspection ? (
        <form className="mt-8 grid gap-5" onSubmit={(event) => void submit(event)}>
          <p className="text-sm text-muted">{inspection.email}</p>
          <Field>
            <FieldLabel htmlFor="new-password">New password</FieldLabel>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={12}
              maxLength={128}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="confirm-password">Repeat password</FieldLabel>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              minLength={12}
              maxLength={128}
              required
            />
          </Field>
          {inspection.twoFactorRequired ? (
            <VerificationCodeField
              id="reset-code"
              value={code}
              onChange={setCode}
              recovery={recovery}
              onRecoveryChange={setRecovery}
            />
          ) : null}
          <FieldError>{error}</FieldError>
          <Button type="submit" variant="coral" size="lg" disabled={busy}>
            {busy ? "Saving…" : "Change password"}
          </Button>
        </form>
      ) : (
        <p className="mt-6 text-sm text-muted">Checking link…</p>
      )}
    </PasswordResetShell>
  );
}

function PasswordResetShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex px-5 py-6 sm:px-10">
      <div className="mx-auto my-auto w-full max-w-md py-16">{children}</div>
    </main>
  );
}
