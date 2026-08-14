import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  EVENTS,
  Joyride,
  STATUS,
  type EventData,
  type Step,
  type TooltipRenderProps,
} from "react-joyride";
import { GuideArtwork } from "./guide-artwork";

export type GuideTourOutcome = typeof STATUS.FINISHED | typeof STATUS.SKIPPED;

export function GuideTour({
  run,
  steps,
  onEnd,
}: {
  run: boolean;
  steps: Step[];
  onEnd: (outcome: GuideTourOutcome) => void;
}) {
  function handleEvent(event: EventData) {
    if (
      event.type === EVENTS.TOUR_END &&
      (event.status === STATUS.FINISHED || event.status === STATUS.SKIPPED)
    ) {
      onEnd(event.status);
    }
  }

  return (
    <Joyride
      run={run}
      continuous
      scrollToFirstStep
      steps={steps}
      tooltipComponent={MimoTourTooltip}
      onEvent={handleEvent}
      locale={{ back: "Back", close: "Close", last: "Done", next: "Next", skip: "End tour" }}
      options={{
        backgroundColor: "var(--color-surface)",
        blockTargetInteraction: true,
        buttons: ["back", "skip", "primary", "close"],
        closeButtonAction: "skip",
        dismissKeyAction: "close",
        offset: 14,
        overlayClickAction: false,
        overlayColor: "rgba(4, 6, 14, 0.74)",
        primaryColor: "var(--color-coral)",
        scrollDuration: 320,
        scrollOffset: 88,
        showProgress: true,
        skipBeacon: true,
        spotlightPadding: 8,
        spotlightRadius: 16,
        textColor: "var(--color-ink)",
        width: "min(390px, calc(100vw - 24px))",
        zIndex: 80,
      }}
      styles={{
        floater: { filter: "drop-shadow(0 20px 38px rgba(0, 0, 0, 0.55))" },
        spotlight: { stroke: "var(--color-lavender)", strokeWidth: 2 },
      }}
    />
  );
}

function MimoTourTooltip({
  backProps,
  closeProps,
  index,
  isLastStep,
  primaryProps,
  size,
  skipProps,
  step,
  tooltipProps,
}: TooltipRenderProps) {
  return (
    <div
      {...tooltipProps}
      aria-labelledby="mimo-tour-title"
      aria-describedby="mimo-tour-description"
      className="relative overflow-hidden rounded-3xl border border-lavender/50 bg-surface shadow-2xl"
    >
      <button
        {...closeProps}
        type="button"
        className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-surface/90 text-muted outline-none transition hover:bg-ink/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-coral-strong"
      >
        <X className="size-4" />
        <span className="sr-only">Close tour</span>
      </button>

      <div className="grid grid-cols-[72px_minmax(0,1fr)] border-b border-line bg-gradient-to-r from-lavender-soft/80 to-coral/10 pr-11">
        <GuideArtwork variant="portrait" className="h-full min-h-24 w-[72px] object-[53%_18%]" />
        <div className="px-4 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-strong">
            Mimo Guide · {index + 1} of {size}
          </p>
          {step.title ? (
            <h2 id="mimo-tour-title" className="mt-1 font-display text-lg font-bold text-ink">
              {step.title}
            </h2>
          ) : null}
        </div>
      </div>

      <div id="mimo-tour-description" className="px-5 py-4 text-sm leading-6 text-muted">
        {step.content}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
        <button
          {...skipProps}
          type="button"
          className="h-9 rounded-xl px-3 text-xs font-semibold text-muted outline-none transition hover:bg-ink/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-coral-strong"
        >
          End tour
        </button>
        <div className="flex gap-2">
          {index > 0 ? (
            <button
              {...backProps}
              type="button"
              className="inline-flex h-9 items-center gap-1 rounded-xl border border-line bg-surface px-3 text-xs font-semibold text-ink outline-none transition hover:border-lavender hover:bg-lavender-soft focus-visible:ring-2 focus-visible:ring-coral-strong"
            >
              <ChevronLeft className="size-3.5" /> Back
            </button>
          ) : null}
          <button
            {...primaryProps}
            type="button"
            className="inline-flex h-9 items-center gap-1 rounded-xl bg-ink px-4 text-xs font-semibold text-canvas outline-none transition hover:bg-ink/90 focus-visible:ring-2 focus-visible:ring-coral-strong"
          >
            {isLastStep ? "Done" : "Next"}
            {!isLastStep ? <ChevronRight className="size-3.5" /> : null}
          </button>
        </div>
      </div>
    </div>
  );
}
