import type { AdminPasswordReset, PasswordResetInspection } from "@mimorii/contracts";
import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { createSecret, hashPassword, hashSecret } from "../common/crypto.js";
import { MailService } from "../common/mail.service.js";
import { publicBaseUrl } from "../common/public-url.js";
import { DatabaseService } from "../database/database.service.js";
import { TwoFactorService, unwrapVerification, type Verification } from "./two-factor.service.js";

interface ResetTokenRow {
  id: string;
  user_id: string;
  email: string;
  disabled_at: string | null;
  expires_at: string;
  used_at: string | null;
  two_factor_enabled: boolean;
}

const selfServiceLifetimeMinutes = 30;
const administratorLifetimeMinutes = 24 * 60;
const requestIntervalSeconds = 60;
const tokenPrefix = "mim_pwr";

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly twoFactor: TwoFactorService
  ) {}

  async request(emailInput: string): Promise<void> {
    if (!this.mail.available()) {
      throw new ServiceUnavailableException(
        "Password reset by email isn't available. Ask an administrator for a reset link."
      );
    }
    const email = emailInput.trim().toLowerCase();
    const user = await this.database.get<{ id: string; email: string; recent: boolean }>(
      `SELECT u.id, u.email, EXISTS (
         SELECT 1 FROM password_reset_tokens prt
         WHERE prt.user_id = u.id AND prt.created_at > ?
       ) AS recent
       FROM users u WHERE u.email = ? AND u.disabled_at IS NULL`,
      new Date(Date.now() - requestIntervalSeconds * 1_000).toISOString(),
      email
    );
    if (!user || user.recent) return;
    const issued = await this.issue(user.id, null, selfServiceLifetimeMinutes);
    this.mail
      .send(user.email, "[Mimorii] Reset your password", resetEmail(issued.url))
      .catch((error: unknown) =>
        this.logger.warn(
          `Password reset email failed: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    await this.audit.record({
      userId: user.id,
      action: "account.password_reset_requested",
      subjectType: "user",
      subjectId: user.id,
    });
  }

  async inspect(token: string): Promise<PasswordResetInspection> {
    const row = await this.tokenRow(token, false);
    if (!usable(row)) throw new GoneException(expiredMessage);
    return {
      email: row.email,
      twoFactorRequired: row.two_factor_enabled,
      expiresAt: new Date(row.expires_at).toISOString(),
    };
  }

  async complete(input: { token: string; password: string; code?: string }): Promise<void> {
    const passwordHash = await hashPassword(input.password);
    const outcome = await this.database.transaction(async (): Promise<Verification<string>> => {
      const row = await this.tokenRow(input.token, true);
      if (!usable(row)) return { status: "expired" };
      if (row.two_factor_enabled) {
        if (!input.code) {
          throw new BadRequestException(
            "Enter a code from your authenticator app or a recovery code"
          );
        }
        const factor = await this.twoFactor.verifyFactor(row.user_id, input.code);
        if (factor.status !== "verified") return factor;
      }
      const now = new Date().toISOString();
      await this.database.run(
        `UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = ?
           WHERE id = ?`,
        passwordHash,
        now,
        row.user_id
      );
      await this.database.run(
        "UPDATE password_reset_tokens SET used_at = ? WHERE id = ?",
        now,
        row.id
      );
      await this.database.run(
        "DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL",
        row.user_id
      );
      await this.database.run("DELETE FROM user_sessions WHERE user_id = ?", row.user_id);
      await this.database.run("DELETE FROM api_tokens WHERE user_id = ?", row.user_id);
      await this.database.run("DELETE FROM two_factor_challenges WHERE user_id = ?", row.user_id);
      await this.audit.record({
        userId: row.user_id,
        action: "account.password_reset",
        subjectType: "user",
        subjectId: row.user_id,
      });
      return { status: "verified", value: row.user_id };
    });
    if (outcome.status === "expired") throw new GoneException(expiredMessage);
    unwrapVerification(outcome, "sign-in");
  }

  async issueByAdministrator(
    actorId: string,
    userId: string,
    sendEmail: boolean
  ): Promise<AdminPasswordReset> {
    if (actorId === userId) {
      throw new ForbiddenException("Change your own password in account settings");
    }
    const user = await this.database.get<{ id: string; email: string }>(
      "SELECT id, email FROM users WHERE id = ?",
      userId
    );
    if (!user) throw new NotFoundException("User not found");
    if (sendEmail && !this.mail.available()) {
      throw new ServiceUnavailableException("Email isn't configured on this server");
    }
    const issued = await this.issue(user.id, actorId, administratorLifetimeMinutes);
    if (sendEmail) {
      await this.mail.send(user.email, "[Mimorii] Reset your password", resetEmail(issued.url));
    }
    await this.audit.record({
      userId: actorId,
      action: "global_admin.user_password_reset_issued",
      subjectType: "user",
      subjectId: user.id,
      metadata: { emailed: sendEmail },
    });
    return { ...issued, emailed: sendEmail };
  }

  private async issue(
    userId: string,
    issuedBy: string | null,
    lifetimeMinutes: number
  ): Promise<{ url: string; expiresAt: string }> {
    const token = createSecret(tokenPrefix);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + lifetimeMinutes * 60_000).toISOString();
    await this.database.transaction(async () => {
      await this.database.run(
        "DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL",
        userId
      );
      await this.database.run(
        `INSERT INTO password_reset_tokens
         (id, user_id, token_hash, issued_by, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        userId,
        hashSecret(token),
        issuedBy,
        expiresAt,
        now.toISOString()
      );
    });
    return { url: `${publicBaseUrl()}/reset-password#token=${token}`, expiresAt };
  }

  private tokenRow(token: string, lock: boolean): Promise<ResetTokenRow | undefined> {
    if (!token.startsWith(`${tokenPrefix}_`)) return Promise.resolve(undefined);
    return this.database.get<ResetTokenRow>(
      `SELECT prt.id, prt.user_id, u.email, u.disabled_at, prt.expires_at, prt.used_at,
         EXISTS (SELECT 1 FROM user_two_factor tf WHERE tf.user_id = u.id) AS two_factor_enabled
       FROM password_reset_tokens prt JOIN users u ON u.id = prt.user_id
       WHERE prt.token_hash = ?${lock ? " FOR UPDATE OF prt" : ""}`,
      hashSecret(token)
    );
  }
}

const expiredMessage = "This reset link has expired or was already used. Request a new one.";

function usable(row: ResetTokenRow | undefined): row is ResetTokenRow {
  return Boolean(
    row && !row.used_at && !row.disabled_at && new Date(row.expires_at).getTime() > Date.now()
  );
}

function resetEmail(url: string): string {
  return [
    "Someone asked to reset the password for your Mimorii account.",
    `Open this link to choose a new password:\n${url}`,
    "If you didn't ask for this, you can ignore this email. Your password stays the same.",
  ].join("\n\n");
}
