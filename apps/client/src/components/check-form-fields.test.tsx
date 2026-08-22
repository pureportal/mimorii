import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkFields } from "./check-form-config";
import { HttpCheckFields } from "./check-form-fields";

describe("HTTP check fields", () => {
  afterEach(cleanup);

  it("offers all supported request methods", () => {
    render(<HttpCheckFields fields={checkFields(undefined)} update={vi.fn()} />);

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "GET",
      "HEAD",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ]);
  });
});
