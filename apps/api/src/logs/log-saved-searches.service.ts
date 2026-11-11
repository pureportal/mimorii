import { logSavedSearchLimits, type LogSavedSearch } from "@mimorii/contracts";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service.js";
import { parseLogQueryInput } from "./log-query-sql.js";
import { LogSearchService } from "./log-search.service.js";
import { LogsAccessService } from "./logs-access.service.js";

interface SavedSearchRow {
  id: string;
  name: string;
  query: string;
  created_by_name: string | null;
  created_at: string;
}

const uniqueViolationCode = "23505";
const nameTakenMessage = "A saved search with this name exists";
const savedSearchSelect = `SELECT ss.id, ss.name, ss.query, u.name AS created_by_name, ss.created_at
  FROM log_saved_searches ss LEFT JOIN users u ON u.id = ss.created_by`;

@Injectable()
export class LogSavedSearchesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: LogsAccessService,
    private readonly search: LogSearchService
  ) {}

  async list(userId: string, teamId: string): Promise<LogSavedSearch[]> {
    await this.access.require(userId, teamId, "viewer");
    const rows = await this.database.all<SavedSearchRow>(
      `${savedSearchSelect} WHERE ss.team_id = ? ORDER BY LOWER(ss.name)`,
      teamId
    );
    return rows.map(mapSavedSearch);
  }

  async create(
    userId: string,
    teamId: string,
    input: { name: string; query: string }
  ): Promise<LogSavedSearch> {
    await this.access.require(userId, teamId, "member");
    const name = input.name.trim();
    if (!name) throw new BadRequestException("Enter a name");
    const query = input.query.trim();
    await this.search.validate(parseLogQueryInput(query));
    const id = randomUUID();
    await this.insert(teamId, userId, id, name, query);
    const row = await this.database.get<SavedSearchRow>(`${savedSearchSelect} WHERE ss.id = ?`, id);
    return mapSavedSearch(row!);
  }

  async remove(userId: string, teamId: string, id: string): Promise<void> {
    await this.access.require(userId, teamId, "member");
    const result = await this.database.run(
      "DELETE FROM log_saved_searches WHERE id = ? AND team_id = ?",
      id,
      teamId
    );
    if (result.changes === 0) throw new NotFoundException("Saved search not found");
  }

  private async insert(
    teamId: string,
    userId: string,
    id: string,
    name: string,
    query: string
  ): Promise<void> {
    try {
      await this.database.transaction(async () => {
        const existing = await this.database.get<{ count: number; taken: boolean }>(
          `SELECT COUNT(*) AS count, COALESCE(BOOL_OR(LOWER(name) = LOWER(?)), FALSE) AS taken
         FROM log_saved_searches WHERE team_id = ?`,
          name,
          teamId
        );
        if (existing?.taken) throw new ConflictException(nameTakenMessage);
        if ((existing?.count ?? 0) >= logSavedSearchLimits.perTeam) {
          throw new BadRequestException(
            `Teams can save up to ${logSavedSearchLimits.perTeam} searches`
          );
        }
        await this.database.run(
          `INSERT INTO log_saved_searches (id, team_id, name, query, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
          id,
          teamId,
          name,
          query,
          userId,
          new Date().toISOString()
        );
      });
    } catch (error) {
      if ((error as { code?: unknown }).code === uniqueViolationCode) {
        throw new ConflictException(nameTakenMessage);
      }
      throw error;
    }
  }
}

function mapSavedSearch(row: SavedSearchRow): LogSavedSearch {
  return {
    id: row.id,
    name: row.name,
    query: row.query,
    createdByName: row.created_by_name,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
