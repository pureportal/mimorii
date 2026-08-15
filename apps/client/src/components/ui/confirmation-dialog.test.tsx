import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmationDialog } from "./confirmation-dialog";

describe("ConfirmationDialog", () => {
  afterEach(cleanup);

  it("renders an accessible confirmation and focuses the safe action", async () => {
    const onConfirm = vi.fn();

    render(
      <ConfirmationDialog
        open
        onOpenChange={vi.fn()}
        title="Delete Warehouse?"
        description="Its monitoring history will also be deleted."
        confirmLabel="Delete resource"
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByRole("alertdialog", { name: "Delete Warehouse?" })).toBeInTheDocument();
    expect(screen.getByText("Its monitoring history will also be deleted.")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: "Delete resource" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("dismisses without confirming", () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ConfirmationDialog
        open
        onOpenChange={onOpenChange}
        title="Revoke token?"
        confirmLabel="Revoke token"
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("prevents dismissal and repeat submission while pending", () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ConfirmationDialog
        open
        pending
        onOpenChange={onOpenChange}
        title="Rotate relay key?"
        confirmLabel="Rotate key"
        onConfirm={onConfirm}
      />
    );

    const dialog = screen.getByRole("alertdialog", { name: "Rotate relay key?" });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rotate key" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();

    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Rotate key" }));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
