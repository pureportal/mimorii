import type { SignInChallenge } from "@mimorii/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../lib/auth";
import { storePendingSignIn } from "../lib/two-factor";
import { AuthPage } from "./auth-page";

vi.mock("../lib/auth", () => ({ useAuth: vi.fn() }));

const loginMock = vi.fn();
const registerMock = vi.fn();
const enrollmentChallenge: SignInChallenge = {
  purpose: "enrollment",
  challengeToken: "mim_tfc_enrollment",
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  setup: {
    secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    uri: "otpauth://totp/Mimorii:aiko%40example.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
  },
};

function renderAuth(path: "/login" | "/register") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("authentication page two-factor steps", () => {
  beforeEach(() => {
    sessionStorage.clear();
    loginMock.mockReset();
    registerMock.mockReset();
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      login: loginMock,
      register: registerMock,
      completeSignIn: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);
  });

  afterEach(cleanup);

  it("moves from the password to the code step and resumes it after a reload", async () => {
    loginMock.mockResolvedValue({
      purpose: "sign-in",
      challengeToken: "mim_tfc_sign_in",
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    } satisfies SignInChallenge);
    renderAuth("/login");

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "Aiko@Example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "SecurePassword123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Two-factor authentication" })).toBeVisible();
    expect(screen.getByText("aiko@example.com")).toBeVisible();

    cleanup();
    renderAuth("/login");
    expect(screen.getByRole("heading", { name: "Two-factor authentication" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Email")).toHaveValue("aiko@example.com");
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });

  it("sends a newly registered account back to sign-in instead of registration", () => {
    storePendingSignIn({ challenge: enrollmentChallenge, email: "aiko@example.com" });
    renderAuth("/register");

    expect(screen.getByRole("heading", { name: "Set up two-factor authentication" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
    expect(screen.getByLabelText("Email")).toHaveValue("aiko@example.com");
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("drops an expired pending sign-in", () => {
    storePendingSignIn({
      challenge: { ...enrollmentChallenge, expiresAt: new Date(Date.now() - 1_000).toISOString() },
      email: "aiko@example.com",
    });
    renderAuth("/login");

    expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
    expect(sessionStorage.length).toBe(0);
  });
});
