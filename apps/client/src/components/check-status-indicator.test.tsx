import type { CheckType, MonitorStatus } from "@mimorii/contracts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckStatusIndicator } from "./check-status-indicator";

const states = [
  {
    status: "pending",
    type: "http",
    label: "Pending",
    description: "Waiting for the first result.",
    icon: "lucide-clock-3",
    tone: "bg-lavender-soft",
  },
  {
    status: "up",
    type: "http",
    label: "Up",
    description: "The latest connectivity check passed.",
    icon: "lucide-circle-check",
    tone: "bg-success/12",
  },
  {
    status: "degraded",
    type: "http",
    label: "Degraded",
    description: "The latest connectivity check completed with a warning.",
    icon: "lucide-triangle-alert",
    tone: "bg-warning/16",
  },
  {
    status: "okay",
    type: "host",
    label: "Okay",
    description: "The latest health check passed.",
    icon: "lucide-circle-check",
    tone: "bg-success/12",
  },
  {
    status: "warning",
    type: "host",
    label: "Warning",
    description: "A health metric reached its warning threshold.",
    icon: "lucide-triangle-alert",
    tone: "bg-warning/16",
  },
  {
    status: "critical",
    type: "disk",
    label: "Critical",
    description: "A health metric reached its critical threshold.",
    icon: "lucide-octagon-alert",
    tone: "bg-danger",
  },
  {
    status: "down",
    type: "http",
    label: "Down",
    description: "The latest connectivity check failed.",
    icon: "lucide-circle-x",
    tone: "bg-danger/12",
  },
  {
    status: "paused",
    type: "http",
    label: "Paused",
    description: "Runs are paused.",
    icon: "lucide-circle-pause",
    tone: "bg-ink/6",
  },
] as const satisfies ReadonlyArray<{
  status: MonitorStatus;
  type: CheckType;
  label: string;
  description: string;
  icon: string;
  tone: string;
}>;

describe("CheckStatusIndicator", () => {
  afterEach(cleanup);

  it.each(states)("shows $status details on hover", (state) => {
    render(<CheckStatusIndicator checkName="API" status={state.status} type={state.type} />);

    const indicator = screen.getByRole("img", { name: `API status: ${state.label}` });
    expect(indicator).toHaveClass(state.tone);
    expect(indicator.querySelector(`.${state.icon}`)).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.mouseEnter(indicator);

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent(state.label);
    expect(tooltip).toHaveTextContent(state.description);
    expect(indicator).toHaveAttribute("aria-describedby", tooltip.id);
  });

  it("stays open when the pointer moves from the icon to the tooltip", async () => {
    vi.useFakeTimers();

    try {
      render(<CheckStatusIndicator checkName="API" status="degraded" type="http" />);

      const indicator = screen.getByRole("img", { name: "API status: Degraded" });
      fireEvent.mouseEnter(indicator);
      const tooltip = screen.getByRole("tooltip");

      fireEvent.mouseLeave(indicator);
      fireEvent.mouseEnter(tooltip);
      await act(() => vi.advanceTimersByTime(120));
      expect(screen.getByRole("tooltip")).toBeInTheDocument();

      fireEvent.mouseLeave(tooltip);
      await act(() => vi.advanceTimersByTime(120));
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens on focus, closes with Escape, and distinguishes an offline reporter", () => {
    render(<CheckStatusIndicator checkName="Host" status="down" type="host" />);

    const indicator = screen.getByRole("img", { name: "Host status: Down" });
    fireEvent.focus(indicator);

    expect(screen.getByRole("tooltip")).toHaveTextContent("The reporter is offline.");
    expect(indicator).toHaveAccessibleDescription("Down The reporter is offline.");

    fireEvent.keyDown(indicator, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.blur(indicator);
    fireEvent.focus(indicator);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });
});
