import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FoxytailDialog } from "./foxytail-dialog";

const { apiMock, errorMock } = vi.hoisted(() => ({ apiMock: vi.fn(), errorMock: vi.fn() }));
vi.mock("../lib/api", () => ({
  api: apiMock,
  jsonBody: (body: unknown) => ({ body: JSON.stringify(body) }),
}));
vi.mock("sonner", () => ({ toast: { error: errorMock } }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("Foxytail enrollment dialog", () => {
  it("creates and copies the scoped code", async () => {
    apiMock.mockResolvedValue({ pingToken: "mim_hb_test" });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const onSaved = vi.fn().mockResolvedValue(undefined);
    render(<FoxytailDialog teamId="team" onClose={vi.fn()} onSaved={onSaved} />);
    expect(screen.getByLabelText("Server name")).toHaveValue("Foxytail");
    fireEvent.click(screen.getByRole("button", { name: "Create enrollment code" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Enrollment code")).toHaveValue("mim_hb_test")
    );
    expect(apiMock).toHaveBeenCalledWith("/teams/team/heartbeats/foxytail", {
      method: "POST",
      body: JSON.stringify({ name: "Foxytail" }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("mim_hb_test"));
    expect(onSaved).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Create enrollment code" })).toBeNull();
  });

  it("keeps the form available after a failed enrollment", async () => {
    apiMock.mockRejectedValue(new Error("Forbidden"));
    render(<FoxytailDialog teamId="team" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Create enrollment code" }));
    await waitFor(() => expect(errorMock).toHaveBeenCalledWith("Forbidden"));
    expect(screen.getByRole("button", { name: "Create enrollment code" })).toBeEnabled();
    expect(screen.queryByLabelText("Enrollment code")).toBeNull();
  });
});
