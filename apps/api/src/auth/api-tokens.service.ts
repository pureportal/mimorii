import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { ApiTokenSummary, CreatedApiToken } from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { createSecret, hashSecret } from "../common/crypto.js";
import { DatabaseService } from "../database/database.service.js";
import type { CreateApiTokenDto } from "./auth.dto.js";

interface ApiTokenRow {
  id: string;
  user_id: string;
  name: string;
  token_prefix: string;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

@Injectable()
export class ApiTokensService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService
  ) {}

  async list(userId: string): Promise<ApiTokenSummary[]> {
    const rows = await this.database.all<ApiTokenRow>(
      "SELECT * FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC",
      userId
    );
    return rows.map((row) => this.map(row));
  }

  async create(userId: string, input: CreateApiTokenDto): Promise<CreatedApiToken> {
    const count = (await this.database.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM api_tokens WHERE user_id = ?",
      userId
    ))!.count;
    if (count >= 50) throw new BadRequestException("API token limit reached");
    const token = createSecret("mim_pat");
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const expiresInDays = input.expiresInDays === undefined ? 90 : input.expiresInDays;
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
      : null;
    await this.database.run(
      `INSERT INTO api_tokens
       (id, user_id, name, token_prefix, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      userId,
      input.name.trim(),
      token.slice(0, 16),
      hashSecret(token),
      expiresAt,
      createdAt
    );
    await this.audit.record({
      userId,
      action: "api_token.created",
      subjectType: "api_token",
      subjectId: id,
    });
    return {
      apiToken: this.map(await this.require(userId, id)),
      token,
    };
  }

  async revoke(userId: string, id: string): Promise<void> {
    const result = await this.database.run(
      "DELETE FROM api_tokens WHERE id = ? AND user_id = ?",
      id,
      userId
    );
    if (result.changes === 0) throw new NotFoundException("API token not found");
    await this.audit.record({
      userId,
      action: "api_token.revoked",
      subjectType: "api_token",
      subjectId: id,
    });
  }

  private async require(userId: string, id: string): Promise<ApiTokenRow> {
    const row = await this.database.get<ApiTokenRow>(
      "SELECT * FROM api_tokens WHERE id = ? AND user_id = ?",
      id,
      userId
    );
    if (!row) throw new NotFoundException("API token not found");
    return row;
  }

  private map(row: ApiTokenRow): ApiTokenSummary {
    return {
      id: row.id,
      name: row.name,
      prefix: row.token_prefix,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
    };
  }
}
