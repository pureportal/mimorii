import { size as floatingSize } from "@floating-ui/react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  EVENTS,
  Joyride,
  STATUS,
  type EventData,
  type Step,
  type TooltipRenderProps,
} from "react-joyride";
import { Button } from "../ui/button";
import { GuideArtwork } from "./guide-artwork";

const tooltipViewportPadding = 12;
const tooltipSizeMiddleware = floatingSize({
  padding: tooltipViewportPadding,
  apply({ availableWidth, elements }) {
    elements.floating.style.maxWidth = `${Math.max(0, availableWidth)}px`;
  },
});

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
      floatingOptions={{
        middleware: [tooltipSizeMiddleware],
        strategy: "fixed",
        shiftOptions: {
          crossAxis: true,
          padding: tooltipViewportPadding,
          rootBoundary: "viewport",
        },
      }}
      options={{
        arrowColor: "var(--color-surface)",
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
      className="relative grid max-h-[calc(100dvh-1.5rem)] w-[390px] max-w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-3xl border border-lavender/50 bg-surface shadow-2xl"
    >
      <Button
        {...closeProps}
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-3 top-3 z-10 size-9 rounded-full bg-surface/90 text-muted active:scale-95 active:bg-ink/10"
      >
        <X className="size-4" />
        <span className="sr-only">Close tour</span>
      </Button>

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

      <div
        id="mimo-tour-description"
        className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4 text-sm leading-6 text-muted"
      >
        {step.content}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
        <Button
          {...skipProps}
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 text-muted active:scale-[0.97] active:bg-ink/10"
        >
          End tour
        </Button>
        <div className="flex gap-2">
          {index > 0 ? (
            <Button
              {...backProps}
              type="button"
              variant="outline"
              size="sm"
              className="h-9 active:scale-[0.97] active:bg-lavender-soft/75"
            >
              <ChevronLeft className="size-3.5" /> Back
            </Button>
          ) : null}
          <Button
            {...primaryProps}
            type="button"
            variant="coral"
            size="sm"
            className="h-9 min-w-[4.5rem] active:scale-[0.97] active:bg-coral/80"
          >
            {isLastStep ? "Done" : "Next"}
            {!isLastStep ? <ChevronRight className="size-3.5" /> : null}
          </Button>
        </div>
      </div>
    </div>
  );
}
