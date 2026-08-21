import { ServerCog } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Field, FieldError, FieldLabel } from "../components/ui/field";
import { Input } from "../components/ui/input";
import { useAuth } from "../lib/auth";
import { getServerUrl, setServerUrl } from "../lib/api";
import { cn } from "../lib/cn";

export function AuthPage({
  mode,
  compact = false,
}: {
  mode: "login" | "register";
  compact?: boolean;
}) {
  const { session, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [server, setServer] = useState(getServerUrl());
  const [showServer, setShowServer] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/app" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      setServerUrl(server);
      if (mode === "login") await login(email, password);
      else await register(name, email, password, acceptedTerms);
      const from = (location.state as { from?: string } | null)?.from ?? "/app";
      void navigate(from, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={cn(!compact && "grid lg:grid-cols-[1fr_1.05fr]")}>
      <div className="flex flex-col px-5 py-6 sm:px-10 lg:px-14">
        <div className="mx-auto my-auto w-full max-w-md py-12">
          <h1 className="font-display text-3xl font-black tracking-tight">
            {mode === "login" ? (compact ? "Sign in" : "Welcome back") : "Create your workspace"}
          </h1>
          <form className="mt-8 grid gap-5" onSubmit={submit}>
            {mode === "register" ? (
              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input
                  id="name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  minLength={2}
                  maxLength={100}
                  required
                />
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={mode === "login" ? 1 : 12}
                required
              />
            </Field>
            {showServer ? (
              <Field>
                <FieldLabel htmlFor="server">Server URL</FieldLabel>
                <Input
                  id="server"
                  type="url"
                  value={server}
                  onChange={(event) => setServer(event.target.value)}
                  required
                />
              </Field>
            ) : null}
            {mode === "register" ? (
              <div className="grid gap-2 text-sm text-muted">
                <label className="flex items-start gap-3">
                  <input
                    className="mt-0.5 size-4 accent-[var(--color-coral)]"
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(event) => setAcceptedTerms(event.target.checked)}
                    required
                  />
                  <span>
                    I accept the{" "}
                    <Link
                      className="font-semibold text-violet-strong"
                      to="/terms"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Terms of Use
                    </Link>
                    .
                  </span>
                </label>
                <p className="pl-7">
                  <Link
                    className="font-semibold text-violet-strong"
                    to="/privacy"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Privacy policy
                  </Link>
                </p>
              </div>
            ) : null}
            <FieldError>{error}</FieldError>
            <Button type="submit" variant="coral" size="lg" disabled={busy}>
              {busy ? "Connecting…" : mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <div className="mt-5 flex items-center justify-between text-sm">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 font-medium text-muted hover:text-ink"
              onClick={() => setShowServer((value) => !value)}
            >
              <ServerCog className="size-4" /> Server
            </button>
            {mode === "login" ? (
              <Link to="/register" className="font-semibold text-violet-strong">
                Create account
              </Link>
            ) : (
              <Link to="/login" className="font-semibold text-violet-strong">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </div>
      {compact ? null : (
        <div className="relative hidden overflow-hidden bg-night p-10 lg:block">
          <img
            src="/art/mimorii-hero.png"
            alt=""
            className="absolute inset-0 size-full object-cover opacity-82"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-night via-night/10 to-transparent" />
          <Card className="absolute bottom-10 left-10 right-10 border-white/10 bg-night/76 p-6 text-white backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-mint text-night">
                <ServerCog />
              </span>
              <div>
                <p className="font-display text-lg font-bold">Your server. Your metrics.</p>
                <p className="text-sm text-white/58">
                  Local accounts. Agents that only connect out.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
