import type {
  AuthSession,
  RecoveryCodes,
  SignInChallenge,
  TwoFactorEnrollment,
  TwoFactorReplacement,
  TwoFactorStatus,
} from "@mimorii/contracts";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError, jsonBody } from "./api";

export const twoFactorStatusQueryKey = ["auth", "two-factor"] as const;

const PENDING_SIGN_IN_KEY = "mimorii.pending-sign-in";

export interface PendingSignIn {
  challenge: SignInChallenge;
  email: string;
}

export function useTwoFactorStatus() {
  return useQuery({
    queryKey: twoFactorStatusQueryKey,
    queryFn: () => api<TwoFactorStatus>("/auth/two-factor"),
  });
}

export function verifyTwoFactor(challengeToken: string, code: string): Promise<AuthSession> {
  return api<AuthSession>("/auth/two-factor/verify", {
    method: "POST",
    ...jsonBody({ challengeToken, code }),
  });
}

export function enrollTwoFactor(
  challengeToken: string,
  code: string
): Promise<TwoFactorEnrollment> {
  return api<TwoFactorEnrollment>("/auth/two-factor/enroll", {
    method: "POST",
    ...jsonBody({ challengeToken, code }),
  });
}

export function regenerateRecoveryCodes(password: string, code: string): Promise<RecoveryCodes> {
  return api<RecoveryCodes>("/auth/two-factor/recovery-codes", {
    method: "POST",
    ...jsonBody({ password, code }),
  });
}

export function startAuthenticatorReplacement(
  password: string,
  code: string
): Promise<TwoFactorReplacement> {
  return api<TwoFactorReplacement>("/auth/two-factor/replacement", {
    method: "POST",
    ...jsonBody({ password, code }),
  });
}

export function confirmAuthenticatorReplacement(
  challengeToken: string,
  code: string
): Promise<void> {
  return api<void>("/auth/two-factor/replacement/confirm", {
    method: "POST",
    ...jsonBody({ challengeToken, code }),
  });
}

export function isEndedChallenge(error: unknown): boolean {
  return error instanceof ApiError && error.status === 410;
}

export function loadPendingSignIn(): PendingSignIn | null {
  try {
    const stored = sessionStorage.getItem(PENDING_SIGN_IN_KEY);
    if (!stored) return null;
    const pending: unknown = JSON.parse(stored);
    if (isPendingSignIn(pending) && new Date(pending.challenge.expiresAt).getTime() > Date.now()) {
      return pending;
    }
  } catch {
    sessionStorage.removeItem(PENDING_SIGN_IN_KEY);
    return null;
  }
  sessionStorage.removeItem(PENDING_SIGN_IN_KEY);
  return null;
}

export function storePendingSignIn(pending: PendingSignIn | null): void {
  if (pending) sessionStorage.setItem(PENDING_SIGN_IN_KEY, JSON.stringify(pending));
  else sessionStorage.removeItem(PENDING_SIGN_IN_KEY);
}

function isPendingSignIn(value: unknown): value is PendingSignIn {
  if (!isRecord(value) || typeof value.email !== "string" || !isRecord(value.challenge)) {
    return false;
  }
  const { challenge } = value;
  if (typeof challenge.challengeToken !== "string" || typeof challenge.expiresAt !== "string") {
    return false;
  }
  if (challenge.purpose === "sign-in") return true;
  return (
    challenge.purpose === "enrollment" &&
    isRecord(challenge.setup) &&
    typeof challenge.setup.secret === "string" &&
    typeof challenge.setup.uri === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
