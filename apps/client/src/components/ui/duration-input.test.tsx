import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DurationInput } from "./duration-input";

function hiddenValue(container: HTMLElement): string {
  return (container.querySelector('input[type="hidden"]') as HTMLInputElement).value;
}

describe("DurationInput", () => {
  afterEach(cleanup);

  it("starts in the largest whole unit and keeps the number when the unit changes", () => {
    const { container } = render(
      <DurationInput
        id="interval"
        name="intervalSeconds"
        label="Expected every"
        defaultSeconds={7_200}
        minSeconds={60}
        maxSeconds={2_592_000}
      />
    );
    expect(screen.getByRole("spinbutton")).toHaveValue(2);
    expect(screen.getByLabelText("Expected every unit")).toHaveValue("hours");
    expect(hiddenValue(container)).toBe("7200");

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Expected every unit"), { target: { value: "days" } });
    expect(screen.getByRole("spinbutton")).toHaveValue(7);
    expect(hiddenValue(container)).toBe("604800");
  });

  it("submits an empty value for an optional duration", () => {
    const { container } = render(
      <DurationInput
        id="runtime"
        name="maxRuntimeSeconds"
        label="Maximum runtime"
        defaultSeconds={null}
        minSeconds={60}
        maxSeconds={86_400}
      />
    );
    expect(hiddenValue(container)).toBe("");
    expect(screen.getByLabelText("Maximum runtime unit")).toHaveValue("minutes");
  });
});
