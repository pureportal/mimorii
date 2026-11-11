import {
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type { SignInChallenge } from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import {
  createSecret,
  decryptConfiguration,
  encryptConfiguration,
  hashRecoveryCode,
  hashSecret,
  verifyRecoveryCode,
} from "../common/crypto.js";
import type { AuthenticatedUser, UserRow } from "../common/rows.js";
import { DatabaseService } from "../database/database.service.js";
import { createRecoveryCodes, normalizeRecoveryCode } from "./recovery-codes.js";
import { createTotpSecret, matchTotpStep, totpCodePattern, totpSetup } from "./totp.js";

const SIGN_IN_CHALLENGE_LIFETIME_MS = 5 * 60_000;
const SETUP_CHALLENGE_LIFETIME_MS = 15 * 60_000;
const LOCKOUT_THRESHOLD = 5;
const MAX_LOCKOUT_MINUTES = 24 * 60;

export type ChallengePurpose = "sign-in" | "enrollment" | "replacement";

export interface IssuedChallenge {
  challengeToken: string;
  expiresAt: string;
}

export interface LockedChallenge {
  id: string;
  secret: Buffer | null;
  encryptedSecret: string | null;
  user: AuthenticatedUser;
}

export type Verification<T> =
  | { status: "verified"; value: T }
  | { status: "incorrect" }
  | { status: "expired" }
  | { status: "locked"; lockedUntil: string };

type FactorVerification =
  | { status: "verified" }
  | { status: "incorrect" }
  | { status: "locked"; lockedUntil: string };

export type VerificationFlow = "sign-in" | "setup";

const expiredMessages: Record<VerificationFlow, string> = {
  "sign-in": "Sign-in expired. Sign in again.",
  setup: "Setup expired. Start again.",
};

interface ChallengeUserRow extends UserRow {
  challenge_id: string;
  challenge_purpose: ChallengePurpose;
  challenge_secret: string | null;
  challenge_token_version: number;
  challenge_expires_at: string;
}

interface FactorRow {
  totp_secret: string;
  last_used_step: number | null;
  failed_attempts: number;
  locked_until: string | null;
}

type FactorMatch =
  | { method: "authenticator"; step: number }
  | { method: "recovery-code"; recoveryCodeId: string };

@Injectable()
export class TwoFactorService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService
  ) {}

  async createSignInChallenge(
    user: Pick<AuthenticatedUser, "id" | "email" | "tokenVersion">
  ): Promise<SignInChallenge> {
    const enrolled = await this.database.get(
      "SELECT 1 FROM user_two_factor WHERE user_id = ?",
      user.id
    );
    if (enrolled) {
      return { purpose: "sign-in", ...(await this.issueChallenge(user, "sign-in", null)) };
    }
    const secret = createTotpSecret();
    return {
      purpose: "enrollment",
      ...(await this.issueChallenge(user, "enrollment", secret)),
      setup: totpSetup(secret, user.email),
    };
  }

  async verifySignIn(challengeToken: string, code: string): Promise<AuthenticatedUser> {
    const outcome = await this.database.transaction(
      async (): Promise<Verification<AuthenticatedUser>> => {
        const challenge = await this.lockChallenge(challengeToken, "sign-in");
        if (!challenge) return { status: "expired" };
        const verification = await this.verifyFactor(challenge.user.id, code);
        if (verification.status !== "verified") return verification;
        await this.deleteChallenge(challenge.id);
        return { status: "verified", value: challenge.user };
      }
    );
    return unwrapVerification(outcome, "sign-in");
  }

  async enroll(
    challengeToken: string,
    code: string
  ): Promise<{ user: AuthenticatedUser; recoveryCodes: string[] }> {
    const recoveryCodes = createRecoveryCodes();
    const outcome = await this.database.transaction(
      async (): Promise<Verification<AuthenticatedUser>> => {
        const challenge = await this.lockChallenge(challengeToken, "enrollment");
        if (!challenge) return { status: "expired" };
        const step = this.matchChallengeCode(challenge, code);
        if (step === null) return { status: "incorrect" };
        const now = new Date().toISOString();
        const inserted = await this.database.run(
          `INSERT INTO user_two_factor (user_id, totp_secret, last_used_step, enabled_at, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT DO NOTHING`,
          challenge.user.id,
          challenge.encryptedSecret,
          step,
          now,
          now
        );
        await this.deleteChallenge(challenge.id);
        if (inserted.changes === 0) return { status: "expired" };
        await this.replaceRecoveryCodes(challenge.user.id, recoveryCodes);
        await this.audit.record({
          userId: challenge.user.id,
          action: "account.two_factor_enabled",
          subjectType: "user",
          subjectId: challenge.user.id,
        });
        return { status: "verified", value: challenge.user };
      }
    );
    return {
      user: unwrapVerification(outcome, "sign-in"),
      recoveryCodes,
    };
  }

  async issueChallenge(
    user: Pick<AuthenticatedUser, "id" | "tokenVersion">,
    purpose: ChallengePurpose,
    secret: Buffer | null
  ): Promise<IssuedChallenge> {
    const challengeToken = createSecret("mim_tfc");
    const createdAt = new Date();
    const lifetime =
      purpose === "sign-in" ? SIGN_IN_CHALLENGE_LIFETIME_MS : SETUP_CHALLENGE_LIFETIME_MS;
    const expiresAt = new Date(createdAt.getTime() + lifetime).toISOString();
    await this.database.run(
      `INSERT INTO two_factor_challenges
       (id, token_hash, user_id, user_token_version, purpose, totp_secret, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      hashSecret(challengeToken),
      user.id,
      user.tokenVersion,
      purpose,
      secret ? encryptConfiguration(secret.toString("base64url")) : null,
      expiresAt,
      createdAt.toISOString()
    );
    return { challengeToken, expiresAt };
  }

  async lockChallenge(
    challengeToken: string,
    purpose: ChallengePurpose
  ): Promise<LockedChallenge | null> {
    const row = await this.database.get<ChallengeUserRow>(
      `SELECT u.*, c.id AS challenge_id, c.purpose AS challenge_purpose,
       c.totp_secret AS challenge_secret, c.user_token_version AS challenge_token_version, c.expires_at AS challenge_expires_at
       FROM two_factor_challenges c
       JOIN users u ON u.id = c.user_id
       WHERE c.token_hash = ?
       FOR UPDATE OF c`,
      hashSecret(challengeToken)
    );
    if (
      !row ||
      row.challenge_purpose !== purpose ||
      row.disabled_at ||
      row.challenge_token_version !== row.token_version ||
      new Date(row.challenge_expires_at).getTime() <= Date.now()
    ) {
      return null;
    }
    return {
      id: row.challenge_id,
      secret: row.challenge_secret ? decryptTotpSecret(row.challenge_secret) : null,
      encryptedSecret: row.challenge_secret,
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        tokenVersion: row.token_version,
        isGlobalAdmin: row.is_global_admin,
        authMethod: "session",
      },
    };
  }

  matchChallengeCode(challenge: LockedChallenge, code: string): number | null {
    const compact = code.replace(/\s/g, "");
    if (!challenge.secret || !totpCodePattern.test(compact)) return null;
    return matchTotpStep(challenge.secret, compact, Date.now(), null);
  }

  async deleteChallenge(id: string): Promise<void> {
    await this.database.run("DELETE FROM two_factor_challenges WHERE id = ?", id);
  }

  async verifyFactor(userId: string, code: string): Promise<FactorVerification> {
    const factor = await this.database.get<FactorRow>(
      `SELECT totp_secret, last_used_step, failed_attempts, locked_until
       FROM user_two_factor WHERE user_id = ? FOR UPDATE`,
      userId
    );
    if (!factor) return { status: "incorrect" };
    const now = new Date();
    if (factor.locked_until && new Date(factor.locked_until).getTime() > now.getTime()) {
      return { status: "locked", lockedUntil: new Date(factor.locked_until).toISOString() };
    }

    const match = await this.matchFactor(userId, factor, code, now);
    if (!match) return this.recordFactorFailure(userId, factor.failed_attempts + 1, now);

    if (match.method === "recovery-code") {
      await this.database.run(
        "UPDATE user_recovery_codes SET used_at = ? WHERE id = ?",
        now.toISOString(),
        match.recoveryCodeId
      );
      await this.audit.record({
        userId,
        action: "account.recovery_code_used",
        subjectType: "user",
        subjectId: userId,
      });
    }
    await this.database.run(
      `UPDATE user_two_factor
       SET failed_attempts = 0, locked_until = NULL,
       last_used_step = COALESCE(?, last_used_step), updated_at = ?
       WHERE user_id = ?`,
      match.method === "authenticator" ? match.step : null,
      now.toISOString(),
      userId
    );
    return { status: "verified" };
  }

  async replaceRecoveryCodes(userId: string, recoveryCodes: string[]): Promise<void> {
    const createdAt = new Date().toISOString();
    const hashes = await Promise.all(
      recoveryCodes.map((code) => hashRecoveryCode(normalizeRecoveryCode(code)!))
    );
    await this.database.run("DELETE FROM user_recovery_codes WHERE user_id = ?", userId);
    await this.database.run(
      `INSERT INTO user_recovery_codes (id, user_id, code_hash, created_at)
       VALUES ${hashes.map(() => "(?, ?, ?, ?)").join(", ")}`,
      ...hashes.flatMap((hash) => [randomUUID(), userId, hash, createdAt])
    );
  }

  private async matchFactor(
    userId: string,
    factor: FactorRow,
    code: string,
    now: Date
  ): Promise<FactorMatch | null> {
    const compact = code.replace(/\s/g, "");
    if (totpCodePattern.test(compact)) {
      const step = matchTotpStep(
        decryptTotpSecret(factor.totp_secret),
        compact,
        now.getTime(),
        factor.last_used_step
      );
      return step === null ? null : { method: "authenticator", step };
    }
    const recoveryCode = normalizeRecoveryCode(compact);
    if (!recoveryCode) return null;
    const candidates = await this.database.all<{ id: string; code_hash: string }>(
      "SELECT id, code_hash FROM user_recovery_codes WHERE user_id = ? AND used_at IS NULL",
      userId
    );
    const matches = await Promise.all(
      candidates.map((candidate) => verifyRecoveryCode(recoveryCode, candidate.code_hash))
    );
    const matched = candidates[matches.indexOf(true)];
    return matched ? { method: "recovery-code", recoveryCodeId: matched.id } : null;
  }

  private async recordFactorFailure(
    userId: string,
    failedAttempts: number,
    now: Date
  ): Promise<FactorVerification> {
    const lockoutMinutes =
      failedAttempts >= LOCKOUT_THRESHOLD
        ? Math.min(2 ** (failedAttempts - LOCKOUT_THRESHOLD), MAX_LOCKOUT_MINUTES)
        : 0;
    const lockedUntil = lockoutMinutes
      ? new Date(now.getTime() + lockoutMinutes * 60_000).toISOString()
      : null;
    await this.database.run(
      `UPDATE user_two_factor SET failed_attempts = ?, locked_until = ?, updated_at = ?
       WHERE user_id = ?`,
      failedAttempts,
      lockedUntil,
      now.toISOString(),
      userId
    );
    if (!lockedUntil) return { status: "incorrect" };
    await this.audit.record({
      userId,
      action: "account.two_factor_locked",
      subjectType: "user",
      subjectId: userId,
      metadata: { failedAttempts, lockedUntil },
    });
    return { status: "locked", lockedUntil };
  }
}

export function unwrapVerification<T>(outcome: Verification<T>, flow: VerificationFlow): T {
  if (outcome.status === "verified") return outcome.value;
  if (outcome.status === "incorrect") throw new ForbiddenException("Code is incorrect");
  if (outcome.status === "locked") {
    const minutes = Math.max(
      1,
      Math.ceil((new Date(outcome.lockedUntil).getTime() - Date.now()) / 60_000)
    );
    throw new HttpException(
      `Too many incorrect codes. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      HttpStatus.TOO_MANY_REQUESTS
    );
  }
  throw new GoneException(expiredMessages[flow]);
}

function decryptTotpSecret(encrypted: string): Buffer {
  return Buffer.from(decryptConfiguration<string>(encrypted), "base64url");
}
