import { ChartNoAxesCombined, LockKeyhole, MousePointer2, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "../lib/cn";
import { usePrivacy } from "../lib/privacy";
import { Button, type ButtonProps } from "./ui/button";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";

export function PrivacyControls() {
  const {
    preferences,
    analyticsConfigured,
    sessionReplayConfigured,
    settingsOpen,
    setSettingsOpen,
    savePreferences,
  } = usePrivacy();
  const [analytics, setAnalytics] = useState(preferences?.analytics ?? false);
  const [sessionReplay, setSessionReplay] = useState(preferences?.sessionReplay ?? false);
  const consentDescription = sessionReplayConfigured
    ? "Share optional feature-use, performance, and error data plus masked interaction replays so we can find friction, fix issues faster, and focus improvements where they matter. They stay off until you agree, and you can change your choice anytime."
    : "Share optional feature-use, performance, and error data so we can find friction, fix issues faster, and focus improvements where they matter. It stays off until you agree, and you can change your choice anytime.";

  useEffect(() => {
    if (!settingsOpen) return;
    setAnalytics(preferences?.analytics ?? false);
    setSessionReplay(preferences?.sessionReplay ?? false);
  }, [preferences, settingsOpen]);

  if (!analyticsConfigured) return null;

  return (
    <>
      {!preferences ? (
        <section
          aria-labelledby="privacy-consent-title"
          aria-describedby="privacy-consent-description"
          className="safe-floating-bottom fixed z-40 isolate mx-auto max-w-5xl animate-fade-in overflow-y-auto rounded-3xl border border-line/90 bg-surface/95 p-4 shadow-[0_28px_80px_-32px_rgba(23,21,47,.78)] backdrop-blur-xl motion-reduce:animate-none sm:p-6"
        >
          <div
            aria-hidden="true"
            className="absolute inset-x-8 top-0 h-0.5 bg-gradient-to-r from-coral via-lavender to-mint"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-14 -top-16 -z-10 size-40 rounded-full bg-coral/10 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-14 -top-20 -z-10 size-44 rounded-full bg-mint/12 blur-3xl"
          />
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_18rem] md:items-center md:gap-8">
            <div className="flex items-start gap-3.5 sm:gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-lavender/30 bg-gradient-to-br from-lavender-soft via-surface to-mint/25 text-violet-strong shadow-sm sm:size-12">
                <ChartNoAxesCombined className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2
                  id="privacy-consent-title"
                  className="font-display text-xl font-bold tracking-tight text-ink"
                >
                  Help make Mimorii better
                </h2>
                <p
                  id="privacy-consent-description"
                  className="mt-1.5 max-w-2xl text-sm leading-6 text-muted"
                >
                  {consentDescription}
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-line/80 bg-canvas/65 p-2.5">
              <div
                role="group"
                aria-label="Privacy choices"
                className="grid gap-2 min-[400px]:grid-cols-2"
              >
                <Button
                  type="button"
                  aria-describedby="privacy-consent-description"
                  className="w-full bg-surface/90"
                  variant="outline"
                  size="lg"
                  onClick={() => savePreferences({ analytics: false, sessionReplay: false })}
                >
                  Reject
                </Button>
                <Button
                  type="button"
                  aria-describedby="privacy-consent-description"
                  className="w-full bg-surface/90"
                  variant="outline"
                  size="lg"
                  onClick={() =>
                    savePreferences({ analytics: true, sessionReplay: sessionReplayConfigured })
                  }
                >
                  Accept all
                </Button>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3">
                <Button
                  type="button"
                  className="h-8 px-2 text-xs"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSettingsOpen(true)}
                >
                  Choose settings
                </Button>
                <Link
                  className="inline-flex h-8 items-center px-2 text-xs font-semibold text-violet-strong underline decoration-violet-strong/35 underline-offset-4 hover:decoration-violet-strong"
                  to="/privacy"
                >
                  Privacy policy
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg p-5 sm:p-6">
          <div
            aria-hidden="true"
            className="absolute inset-x-8 top-0 h-0.5 bg-gradient-to-r from-coral via-lavender to-mint"
          />
          <DialogHeader title="Privacy settings" />
          <div className="grid gap-3">
            <PreferenceToggle
              id="required-storage"
              icon={LockKeyhole}
              label="Required storage"
              description="Saves your privacy choice and essential session data. Always active."
              checked
              disabled
            />
            <PreferenceToggle
              id="usage-analytics"
              icon={ChartNoAxesCombined}
              label="Usage analytics"
              description="Page views, feature use, performance, errors, device details, and an internal account ID help us prioritize improvements."
              checked={analytics}
              onChange={(checked) => {
                setAnalytics(checked);
                if (!checked) setSessionReplay(false);
              }}
            />
            {sessionReplayConfigured ? (
              <PreferenceToggle
                id="session-replay"
                icon={MousePointer2}
                label="Session replay"
                description={`Sampled, masked interaction recordings reveal where workflows become difficult and may still contain personal data.${analytics ? "" : " Requires usage analytics."}`}
                checked={sessionReplay}
                disabled={!analytics}
                onChange={setSessionReplay}
              />
            ) : null}
          </div>
          <div className="mt-5 grid gap-2 min-[400px]:grid-cols-2">
            <Button
              type="button"
              className="w-full"
              variant="outline"
              onClick={() => {
                savePreferences({ analytics: false, sessionReplay: false });
                setSettingsOpen(false);
              }}
            >
              Reject optional
            </Button>
            <Button
              type="button"
              className="w-full"
              variant="outline"
              onClick={() => {
                savePreferences({ analytics, sessionReplay });
                setSettingsOpen(false);
              }}
            >
              Save choices
            </Button>
          </div>
          <Link
            className="mt-4 inline-flex text-xs font-semibold text-violet-strong underline decoration-violet-strong/35 underline-offset-4 hover:decoration-violet-strong"
            to="/privacy"
            onClick={() => setSettingsOpen(false)}
          >
            Privacy policy
          </Link>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PrivacySettingsButton(props: ButtonProps) {
  const { analyticsConfigured, setSettingsOpen } = usePrivacy();
  if (!analyticsConfigured) return null;
  return (
    <Button type="button" {...props} onClick={() => setSettingsOpen(true)}>
      Privacy settings
    </Button>
  );
}

function PreferenceToggle({
  id,
  icon: Icon,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  icon: LucideIcon;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "group flex items-start gap-3 rounded-2xl border border-line p-3.5 transition hover:border-lavender hover:bg-lavender-soft/30 focus-within:border-lavender",
        disabled && "bg-ink/[.025] hover:border-line hover:bg-ink/[.025]"
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 pt-0.5">
        <span id={`${id}-label`} className="block text-sm font-semibold text-ink">
          {label}
        </span>
        <span id={`${id}-description`} className="mt-1 block text-xs leading-5 text-muted">
          {description}
        </span>
      </span>
      <input
        id={id}
        className="peer sr-only"
        type="checkbox"
        role="switch"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-description`}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      <span
        aria-hidden="true"
        className="relative mt-1 h-6 w-11 shrink-0 rounded-full border border-line bg-ink/8 transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-surface after:shadow-sm after:transition-transform peer-checked:border-violet-strong peer-checked:bg-violet-strong peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-coral-strong peer-focus-visible:ring-offset-2 peer-disabled:opacity-60"
      />
    </label>
  );
}
