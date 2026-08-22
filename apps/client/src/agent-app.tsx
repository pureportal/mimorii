import { Activity, RefreshCw, ScanLine, Settings, Unplug } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ConfirmationDialog } from "./components/ui/confirmation-dialog";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import { Field, FieldError, FieldLabel } from "./components/ui/field";
import { Input } from "./components/ui/input";
import { parseAgentEnrollmentCode } from "./lib/agent-enrollment";
import { cn } from "./lib/cn";
import { scanEnrollmentCode } from "./lib/enrollment-scanner";
import { formatRelative } from "./lib/format";
import {
  collectMobileStatusNow,
  enrollMobileAgent,
  mobileAgentState,
  openMobileAgentBackgroundSettings,
  unenrollMobileAgent,
  type MobileAgentState,
} from "./lib/mobile-agent";

type PendingAction = "activate" | "scan" | "collect" | "settings" | "disconnect" | null;

export function AgentApp() {
  const [state, setState] = useState<MobileAgentState | null>(null);
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [manual, setManual] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [enrollmentKey, setEnrollmentKey] = useState("");
  const [pending, setPending] = useState<PendingAction>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setState(await mobileAgentState());
      setError("");
    } catch (cause) {
      setError(message(cause, "Agent status is unavailable"));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);

  async function activate(event: FormEvent) {
    event.preventDefault();
    setPending("activate");
    setError("");
    try {
      const details = manual
        ? { serverUrl: serverUrl.trim(), enrollmentKey: enrollmentKey.trim() }
        : parseAgentEnrollmentCode(enrollmentCode);
      const next = await enrollMobileAgent(details);
      setState(next);
      setEnrollmentCode("");
      setEnrollmentKey("");
    } catch (cause) {
      setError(message(cause, "Agent could not be activated"));
    } finally {
      setPending(null);
    }
  }

  async function scanAndActivate() {
    setPending("scan");
    setError("");
    try {
      const details = parseAgentEnrollmentCode(await scanEnrollmentCode());
      const next = await enrollMobileAgent(details);
      setState(next);
      setEnrollmentCode("");
      setEnrollmentKey("");
    } catch (cause) {
      setError(message(cause, "QR code could not be scanned"));
    } finally {
      setPending(null);
    }
  }

  async function collectNow() {
    setPending("collect");
    setError("");
    try {
      setState(await collectMobileStatusNow());
    } catch (cause) {
      setError(message(cause, "Collection could not be scheduled"));
    } finally {
      setPending(null);
    }
  }

  async function openSettings() {
    setPending("settings");
    setError("");
    try {
      await openMobileAgentBackgroundSettings();
    } catch (cause) {
      setError(message(cause, "Background settings could not be opened"));
    } finally {
      setPending(null);
    }
  }

  async function disconnect() {
    setPending("disconnect");
    setError("");
    try {
      setState(await unenrollMobileAgent());
      setDisconnectOpen(false);
    } catch (cause) {
      setError(message(cause, "Agent could not be disconnected"));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="safe-page safe-page-footer min-h-dvh bg-canvas text-ink" data-theme="light">
      <header className="border-b border-line bg-surface/94 px-5 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <img src="/mimorii-app-icon.png" alt="" className="size-10 object-contain" />
          <h1 className="font-display text-xl font-extrabold tracking-tight">Mimorii Agent</h1>
        </div>
      </header>
      <main className="mx-auto grid max-w-lg gap-5 px-4 py-6 sm:px-6">
        <AgentStatusCard
          state={state}
          refreshing={refreshing || pending !== null}
          onRefresh={refresh}
        />

        {state?.enrolled ? (
          <Card className="grid gap-4 p-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <StatusValue label="Last report" value={formatRelative(state.lastSubmittedAt)} />
              <StatusValue
                label="Interval"
                value={
                  state.collectionIntervalSeconds
                    ? `${Math.round(state.collectionIntervalSeconds / 60)} min`
                    : "—"
                }
              />
            </div>
            {state.backgroundRestricted ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending !== null}
                onClick={() => void openSettings()}
              >
                <Settings /> Allow background access
              </Button>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pending !== null}
                onClick={() => void collectNow()}
              >
                <Activity /> Collect now
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending !== null}
                onClick={() => setDisconnectOpen(true)}
              >
                <Unplug /> Disconnect
              </Button>
            </div>
          </Card>
        ) : state ? (
          <Card className="p-5">
            <form className="grid gap-5" onSubmit={activate}>
              {manual ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="agent-server">Server URL</FieldLabel>
                    <Input
                      id="agent-server"
                      type="url"
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
                      value={serverUrl}
                      onChange={(event) => setServerUrl(event.target.value)}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="agent-key">Enrollment key</FieldLabel>
                    <Input
                      id="agent-key"
                      type="password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      value={enrollmentKey}
                      onChange={(event) => setEnrollmentKey(event.target.value)}
                      required
                    />
                  </Field>
                </>
              ) : (
                <Field>
                  <FieldLabel htmlFor="agent-code">Enrollment code</FieldLabel>
                  <Input
                    id="agent-code"
                    type="password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={enrollmentCode}
                    onChange={(event) => setEnrollmentCode(event.target.value)}
                    required
                  />
                </Field>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button type="submit" variant="coral" size="lg" disabled={pending !== null}>
                  {pending === "activate" ? "Activating…" : "Activate"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={pending !== null}
                  onClick={() => void scanAndActivate()}
                >
                  <ScanLine /> {pending === "scan" ? "Scanning…" : "Scan QR"}
                </Button>
              </div>
              <button
                type="button"
                className="justify-self-center text-sm font-semibold text-muted"
                onClick={() => setManual((value) => !value)}
              >
                {manual ? "Use enrollment code" : "Enter details"}
              </button>
            </form>
          </Card>
        ) : null}

        <FieldError>{error || state?.lastError}</FieldError>
      </main>
      <ConfirmationDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        title="Disconnect this agent?"
        description="Background collection will stop."
        confirmLabel="Disconnect"
        pending={pending === "disconnect"}
        onConfirm={() => void disconnect()}
      />
    </div>
  );
}

function AgentStatusCard({
  state,
  refreshing,
  onRefresh,
}: {
  state: MobileAgentState | null;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
}) {
  const status = !state
    ? "Checking"
    : !state.enrolled
      ? "Not active"
      : state.backgroundRestricted || state.lastError
        ? "Needs attention"
        : "Active";
  const active = status === "Active";
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-1 size-3 shrink-0 rounded-full",
            active ? "bg-success" : status === "Checking" ? "bg-muted" : "bg-danger"
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold">{state?.agentName ?? "Android agent"}</p>
          <p className="mt-1 text-sm text-muted">{status}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Refresh status"
          disabled={refreshing}
          onClick={() => void onRefresh()}
        >
          <RefreshCw className={refreshing ? "animate-spin" : undefined} />
        </Button>
      </div>
    </Card>
  );
}

function StatusValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-canvas p-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function message(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
