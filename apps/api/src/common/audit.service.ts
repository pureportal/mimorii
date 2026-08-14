import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service.js";

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  async record(input: {
    teamId?: string;
    userId?: string;
    action: string;
    subjectType: string;
    subjectId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.database.run(
      `INSERT INTO audit_events
       (id, team_id, user_id, action, subject_type, subject_id, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      input.teamId ?? null,
      input.userId ?? null,
      input.action,
      input.subjectType,
      input.subjectId ?? null,
      JSON.stringify(input.metadata ?? {}),
      new Date().toISOString()
    );
  }
}
