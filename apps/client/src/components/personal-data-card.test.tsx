import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalDataCard } from "./personal-data-card";

const { apiMock, apiBlobMock, logoutMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  apiBlobMock: vi.fn(),
  logoutMock: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  api: apiMock,
  apiBlob: apiBlobMock,
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ logout: logoutMock }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("PersonalDataCard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal(
      "URL",
      class extends URL {
        static override createObjectURL = vi.fn(() => "blob:personal-data");
        static override revokeObjectURL = vi.fn();
      }
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("downloads the personal data export", async () => {
    apiBlobMock.mockResolvedValue(new Blob(["{}"], { type: "application/json" }));
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(<PersonalDataCard />);

    fireEvent.click(screen.getByRole("button", { name: "Download my data" }));

    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(apiBlobMock).toHaveBeenCalledWith("/auth/account/export");
  });

  it("deletes the account after password confirmation and signs out", async () => {
    apiMock.mockResolvedValue(undefined);
    render(<PersonalDataCard />);

    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "SecurePassword123" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Delete account" }).at(-1)!);

    await waitFor(() => expect(logoutMock).toHaveBeenCalled());
    expect(apiMock).toHaveBeenCalledWith("/auth/account", {
      method: "DELETE",
      body: JSON.stringify({ password: "SecurePassword123" }),
    });
  });

  it("keeps the dialog open with the reason when deletion is refused", async () => {
    apiMock.mockRejectedValue(new Error("Make another member an owner of Operations first"));
    render(<PersonalDataCard />);

    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "SecurePassword123" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Delete account" }).at(-1)!);

    expect(
      await screen.findByText("Make another member an owner of Operations first")
    ).toBeInTheDocument();
    expect(logoutMock).not.toHaveBeenCalled();
  });
});
