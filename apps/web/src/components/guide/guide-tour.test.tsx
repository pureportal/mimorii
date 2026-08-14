import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuideTour } from "./guide-tour";

const joyrideState = vi.hoisted(() => ({
  onEvent: null as null | ((event: { type: string; status: string }) => void),
}));

vi.mock("react-joyride", () => ({
  EVENTS: { TOUR_END: "tour:end" },
  STATUS: { FINISHED: "finished", SKIPPED: "skipped" },
  Joyride: ({ onEvent }: { onEvent: (event: { type: string; status: string }) => void }) => {
    joyrideState.onEvent = onEvent;
    return null;
  },
}));

describe("GuideTour", () => {
  afterEach(() => {
    cleanup();
    joyrideState.onEvent = null;
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
});
