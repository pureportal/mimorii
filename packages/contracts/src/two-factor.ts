import type { AuthSession } from "./index.js";

export interface TwoFactorSetup {
  secret: string;
  uri: string;
}

export type SignInChallenge =
  | { purpose: "sign-in"; challengeToken: string; expiresAt: string }
  | { purpose: "enrollment"; challengeToken: string; expiresAt: string; setup: TwoFactorSetup };

export interface TwoFactorEnrollment {
  session: AuthSession;
  recoveryCodes: string[];
}

export interface TwoFactorStatus {
  recoveryCodesRemaining: number;
}

export interface RecoveryCodes {
  recoveryCodes: string[];
}

export interface TwoFactorReplacement {
  challengeToken: string;
  expiresAt: string;
  setup: TwoFactorSetup;
}
