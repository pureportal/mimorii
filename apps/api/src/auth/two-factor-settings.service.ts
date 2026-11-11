import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { RecoveryCodes, TwoFactorReplacement, TwoFactorStatus } from "@mimorii/contracts";
import { AuditService } from "../common/audit.service.js";
import { verifyPassword } from "../common/crypto.js";
import type { AuthenticatedUser } from "../common/rows.js";
import { DatabaseService } from "../database/database.service.js";
import { createRecoveryCodes } from "./recovery-codes.js";
import { createTotpSecret, totpSetup } from "./totp.js";
import type { TwoFactorChallengeDto, TwoFactorStepUpDto } from "./two-factor.dto.js";
import { TwoFactorService, unwrapVerification, type Verification } from "./two-factor.service.js";

interface StatusRow {
  recovery_codes_remaining: number;
}

@Injectable()
export class TwoFactorSettingsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly twoFactor: TwoFactorService
  ) {}

  async status(userId: string): Promise<TwoFactorStatus> {
    const row = await this.database.get<StatusRow>(
      `SELECT (SELECT COUNT(*) FROM user_recovery_codes rc
        WHERE rc.user_id = tf.user_id AND rc.used_at IS NULL) AS recovery_codes_remaining
       FROM user_two_factor tf WHERE tf.user_id = ?`,
      userId
    );
    if (!row) throw new NotFoundException("Two-factor authentication is not set up");
    return { recoveryCodesRemaining: row.recovery_codes_remaining };
  }

  async regenerateRecoveryCodes(
    user: AuthenticatedUser,
    input: TwoFactorStepUpDto
  ): Promise<RecoveryCodes> {
    await this.verifyPassword(user.id, input.password);
    const recoveryCodes = createRecoveryCodes();
    const outcome = await this.database.transaction(
      async (): Promise<Verification<RecoveryCodes>> => {
        const verification = await this.twoFactor.verifyFactor(user.id, input.code);
        if (verification.status !== "verified") return verification;
        await this.twoFactor.replaceRecoveryCodes(user.id, recoveryCodes);
        await this.audit.record({
          userId: user.id,
          action: "account.recovery_codes_regenerated",
          subjectType: "user",
          subjectId: user.id,
        });
        return { status: "verified", value: { recoveryCodes } };
      }
    );
    return unwrapVerification(outcome, "setup");
  }

  async startReplacement(
    user: AuthenticatedUser,
    input: TwoFactorStepUpDto
  ): Promise<TwoFactorReplacement> {
    await this.verifyPassword(user.id, input.password);
    const secret = createTotpSecret();
    const outcome = await this.database.transaction(
      async (): Promise<Verification<TwoFactorReplacement>> => {
        const verification = await this.twoFactor.verifyFactor(user.id, input.code);
        if (verification.status !== "verified") return verification;
        const challenge = await this.twoFactor.issueChallenge(user, "replacement", secret);
        return {
          status: "verified",
          value: { ...challenge, setup: totpSetup(secret, user.email) },
        };
      }
    );
    return unwrapVerification(outcome, "setup");
  }

  async confirmReplacement(
    user: AuthenticatedUser,
    sessionId: string,
    input: TwoFactorChallengeDto
  ): Promise<void> {
    const outcome = await this.database.transaction(async (): Promise<Verification<void>> => {
      const challenge = await this.twoFactor.lockChallenge(input.challengeToken, "replacement");
      if (!challenge || challenge.user.id !== user.id) return { status: "expired" };
      const step = this.twoFactor.matchChallengeCode(challenge, input.code);
      if (step === null) return { status: "incorrect" };
      await this.database.run(
        `UPDATE user_two_factor
         SET totp_secret = ?, last_used_step = ?, failed_attempts = 0, locked_until = NULL,
         updated_at = ? WHERE user_id = ?`,
        challenge.encryptedSecret,
        step,
        new Date().toISOString(),
        user.id
      );
      await this.twoFactor.deleteChallenge(challenge.id);
      await this.database.run(
        "DELETE FROM user_sessions WHERE user_id = ? AND id <> ?",
        user.id,
        sessionId
      );
      await this.audit.record({
        userId: user.id,
        action: "account.two_factor_replaced",
        subjectType: "user",
        subjectId: user.id,
      });
      return { status: "verified", value: undefined };
    });
    unwrapVerification(outcome, "setup");
  }

  private async verifyPassword(userId: string, password: string): Promise<void> {
    const row = await this.database.get<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = ?",
      userId
    );
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      throw new ForbiddenException("Password is incorrect");
    }
  }
}
