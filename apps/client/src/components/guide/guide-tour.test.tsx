import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuideTour } from "./guide-tour";

interface TooltipActionProps {
  "aria-label": string;
  "data-action": string;
  onClick: () => void;
  role: string;
  title: string;
}

interface CapturedTooltipProps {
  backProps: TooltipActionProps;
  closeProps: TooltipActionProps;
  index: number;
  isLastStep: boolean;
  primaryProps: TooltipActionProps;
  size: number;
  skipProps: TooltipActionProps;
  step: { content: ReactNode; title: string };
  tooltipProps: { "aria-modal": boolean; role: string };
}

interface CapturedJoyrideProps {
  floatingOptions?: {
    middleware?: Array<{ name?: string }>;
    strategy?: string;
    shiftOptions?: {
      crossAxis?: boolean;
      padding?: number;
      rootBoundary?: string;
    };
  };
  onEvent: (event: { type: string; status: string }) => void;
  options?: { arrowColor?: string; scrollOffset?: number };
  scrollToFirstStep?: boolean;
  tooltipComponent?: ComponentType<CapturedTooltipProps>;
}

const joyrideState = vi.hoisted(() => ({
  onEvent: null as null | ((event: { type: string; status: string }) => void),
  props: null as CapturedJoyrideProps | null,
}));

vi.mock("react-joyride", () => ({
  EVENTS: { TOUR_END: "tour:end" },
  STATUS: { FINISHED: "finished", SKIPPED: "skipped" },
  Joyride: (props: CapturedJoyrideProps) => {
    joyrideState.onEvent = props.onEvent;
    joyrideState.props = props;
    return null;
  },
}));

describe("GuideTour", () => {
  afterEach(() => {
    cleanup();
    joyrideState.onEvent = null;
    joyrideState.props = null;
  });

  it.each(["finished", "skipped"] as const)("reports a %s tour", (status) => {
    const onEnd = vi.fn();
    render(<GuideTour run steps={[]} onEnd={onEnd} />);

    act(() => joyrideState.onEvent?.({ type: "tour:end", status }));

    expect(onEnd).toHaveBeenCalledWith(status);
  });

  it("ignores non-terminal events", () => {
    const onEnd = vi.fn();
    render(<GuideTour run steps={[]} onEnd={onEnd} />);

    act(() => joyrideState.onEvent?.({ type: "tour:status", status: "finished" }));

    expect(onEnd).not.toHaveBeenCalled();
  });

  it("keeps tooltips inside the viewport while scrolling to targets", () => {
    render(<GuideTour run steps={[]} onEnd={vi.fn()} />);

    expect(joyrideState.props?.scrollToFirstStep).toBe(true);
    expect(joyrideState.props?.options).toMatchObject({
      arrowColor: "var(--color-surface)",
      scrollOffset: 88,
    });
    expect(joyrideState.props?.floatingOptions).toMatchObject({
      strategy: "fixed",
      shiftOptions: {
        crossAxis: true,
        padding: 12,
        rootBoundary: "viewport",
      },
    });
    expect(joyrideState.props?.floatingOptions?.middleware).toEqual([
      expect.objectContaining({ name: "size" }),
    ]);
  });

  it("renders accessible design-system controls around a scrollable body", () => {
    render(<GuideTour run steps={[]} onEnd={vi.fn()} />);
    const Tooltip = joyrideState.props?.tooltipComponent;

    expect(Tooltip).toBeDefined();
    if (!Tooltip) return;

    const handlers = {
      back: vi.fn(),
      close: vi.fn(),
      next: vi.fn(),
      skip: vi.fn(),
    };
    render(
      <Tooltip
        {...tooltipProps({
          back: handlers.back,
          close: handlers.close,
          next: handlers.next,
          skip: handlers.skip,
        })}
      />
    );

    expect(screen.getByRole("alertdialog")).toHaveClass(
      "max-h-[calc(100dvh-1.5rem)]",
      "w-[390px]",
      "max-w-full",
      "grid-rows-[auto_minmax(0,1fr)_auto]"
    );
    expect(document.getElementById("mimo-tour-description")).toHaveClass(
      "overflow-y-auto",
      "min-h-0"
    );

    const close = screen.getByRole("button", { name: "Close" });
    const skip = screen.getByRole("button", { name: "End tour" });
    const back = screen.getByRole("button", { name: "Back" });
    const next = screen.getByRole("button", { name: "Next" });

    expect(close).toHaveClass("rounded-full", "active:scale-95");
    expect(skip).toHaveClass("text-muted", "active:scale-[0.97]");
    expect(back).toHaveClass("border-line", "bg-surface");
    expect(next).toHaveClass("bg-coral", "text-night", "active:scale-[0.97]");

    fireEvent.click(close);
    fireEvent.click(skip);
    fireEvent.click(back);
    fireEvent.click(next);

    expect(handlers.back).toHaveBeenCalledOnce();
    expect(handlers.close).toHaveBeenCalledOnce();
    expect(handlers.next).toHaveBeenCalledOnce();
    expect(handlers.skip).toHaveBeenCalledOnce();
  });
});

function tooltipProps(handlers: {
  back: () => void;
  close: () => void;
  next: () => void;
  skip: () => void;
}): CapturedTooltipProps {
  return {
    backProps: actionProps("Back", "back", handlers.back),
    closeProps: actionProps("Close", "close", handlers.close),
    index: 1,
    isLastStep: false,
    primaryProps: actionProps("Next", "primary", handlers.next),
    size: 3,
    skipProps: actionProps("End tour", "skip", handlers.skip),
    step: {
      content: <div>Tour content</div>,
      title: "Tour title",
    },
    tooltipProps: {
      "aria-modal": true,
      role: "alertdialog",
    },
  };
}

function actionProps(label: string, action: string, onClick: () => void) {
  return {
    "aria-label": label,
    "data-action": action,
    onClick,
    role: "button",
    title: label,
  };
}
