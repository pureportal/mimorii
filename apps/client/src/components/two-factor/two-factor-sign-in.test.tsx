import type { AuthSession, SignInChallenge } from "@mimorii/contracts";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api";
import { TwoFactorSignIn } from "./two-factor-sign-in";

const { enrollTwoFactorMock, verifyTwoFactorMock } = vi.hoisted(() => ({
  enrollTwoFactorMock: vi.fn(),
  verifyTwoFactorMock: vi.fn(),
}));

vi.mock("../../lib/two-factor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/two-factor")>()),
  enrollTwoFactor: enrollTwoFactorMock,
  verifyTwoFactor: verifyTwoFactorMock,
}));

const session = { accessToken: "access-token" } as AuthSession;
const signInChallenge: SignInChallenge = {
  purpose: "sign-in",
  challengeToken: "mim_tfc_sign_in",
  expiresAt: "2026-11-11T12:05:00.000Z",
};
const enrollmentChallenge: SignInChallenge = {
  purpose: "enrollment",
  challengeToken: "mim_tfc_enrollment",
  expiresAt: "2026-11-11T12:15:00.000Z",
  setup: {
    secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    uri: "otpauth://totp/Mimorii:aiko%40example.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
  },
};

function renderSignIn(props: Partial<ComponentProps<typeof TwoFactorSignIn>> = {}) {
  const handlers = {
    onChallengeUsed: vi.fn(),
    onSignedIn: vi.fn(),
    onRestart: vi.fn(),
  };
  render(
    <MemoryRouter>
      <TwoFactorSignIn
        challenge={signInChallenge}
        email="aiko@example.com"
        {...handlers}
        {...props}
      />
    </MemoryRouter>
  );
  return handlers;
}

describe("two-factor sign-in", () => {
  beforeEach(() => {
    enrollTwoFactorMock.mockReset();
    verifyTwoFactorMock.mockReset();
  });

  afterEach(cleanup);

  it("submits a pasted authenticator code as soon as it is complete", async () => {
    verifyTwoFactorMock.mockResolvedValue(session);
    const handlers = renderSignIn();

    expect(screen.getByText("aiko@example.com")).toBeVisible();
    expect(screen.getByLabelText("Authentication code")).toHaveFocus();
    fireEvent.change(screen.getByLabelText("Authentication code"), {
      target: { value: "123 456" },
    });

    await waitFor(() => expect(handlers.onSignedIn).toHaveBeenCalledWith(session));
    expect(verifyTwoFactorMock).toHaveBeenCalledOnce();
    expect(verifyTwoFactorMock).toHaveBeenCalledWith("mim_tfc_sign_in", "123456");
    expect(handlers.onChallengeUsed).toHaveBeenCalledOnce();
  });

  it("signs in with a recovery code", async () => {
    verifyTwoFactorMock.mockResolvedValue(session);
    const handlers = renderSignIn();

    fireEvent.click(screen.getByRole("button", { name: "Use a recovery code" }));
    const field = screen.getByLabelText("Recovery code");
    expect(field).toHaveFocus();
    fireEvent.change(field, { target: { value: "ab3c0-9xyz1" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => expect(handlers.onSignedIn).toHaveBeenCalledWith(session));
    expect(verifyTwoFactorMock).toHaveBeenCalledWith("mim_tfc_sign_in", "ab3c0-9xyz1");
  });

  it("shows recovery codes before finishing enrollment", async () => {
    enrollTwoFactorMock.mockResolvedValue({
      session,
      recoveryCodes: ["ab3c0-9xyz1", "kq7mn-2wv4p"],
    });
    const handlers = renderSignIn({ challenge: enrollmentChallenge });

    expect(screen.getByTitle("Authenticator QR code")).toBeInTheDocument();
    expect(screen.getByLabelText("Setup key")).toHaveValue(
      "GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ"
    );
    expect(screen.queryByRole("button", { name: "Use a recovery code" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Authentication code"), {
      target: { value: "123456" },
    });

    const codes = await screen.findByRole("list", { name: "Recovery codes" });
    expect(
      within(codes)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual(["ab3c0-9xyz1", "kq7mn-2wv4p"]);
    expect(handlers.onChallengeUsed).toHaveBeenCalledOnce();
    expect(handlers.onSignedIn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(handlers.onSignedIn).toHaveBeenCalledWith(session);
  });

  it("returns to the password step when the challenge has ended", async () => {
    verifyTwoFactorMock.mockRejectedValue(new ApiError(410, "Sign-in expired. Sign in again."));
    const handlers = renderSignIn();

    fireEvent.change(screen.getByLabelText("Authentication code"), {
      target: { value: "000000" },
    });

    await waitFor(() =>
      expect(handlers.onRestart).toHaveBeenCalledWith("Sign-in expired. Sign in again.")
    );
  });

  it("clears an incorrect authenticator code so the next one can be typed", async () => {
    verifyTwoFactorMock.mockRejectedValue(new ApiError(403, "Code is incorrect"));
    renderSignIn();

    fireEvent.change(screen.getByLabelText("Authentication code"), {
      target: { value: "000000" },
    });

    expect(await screen.findByText("Code is incorrect")).toBeVisible();
    expect(screen.getByLabelText("Authentication code")).toHaveValue("");
  });
});
