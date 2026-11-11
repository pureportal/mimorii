import { MikroORM } from "@mikro-orm/core";
import type { PostgreSqlConnection } from "@mikro-orm/postgresql";
import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { DatabaseError, Pool, type PoolClient, type PoolConfig } from "pg";
import { DatabaseService } from "../database/database.service.js";
import { withLogQueryErrors } from "./log-query-sql.js";

interface SearchClient extends PoolClient {
  processID: number;
}

const searchConnections = 8;
const searchTimeoutMilliseconds = 15_000;

@Injectable()
export class LogSearchDatabase implements OnModuleDestroy {
  private readonly logger = new Logger(LogSearchDatabase.name);
  private readonly pool: Pool;

  constructor(
    private readonly orm: MikroORM,
    private readonly database: DatabaseService
  ) {
    const connection = orm.em.getConnection() as PostgreSqlConnection;
    this.pool = new Pool({
      ...(connection.getConnectionOptions() as PoolConfig),
      max: searchConnections,
      idleTimeoutMillis: 30_000,
      statement_timeout: searchTimeoutMilliseconds,
      application_name: "mimorii-log-search",
    });
    this.pool.on("error", (error) => {
      this.logger.warn(`Idle log search connection failed: ${error.message}`);
    });
  }

  async all<T>(sql: string, parameters: unknown[], signal?: AbortSignal): Promise<T[]> {
    signal?.throwIfAborted();
    const text = this.orm.em.getPlatform().formatQuery(sql, parameters);
    const client = (await this.pool.connect()) as SearchClient;
    let cancellation: Promise<unknown> | undefined;
    const cancel = () => {
      cancellation = this.database
        .run("SELECT pg_cancel_backend(?)", client.processID)
        .catch((error: unknown) => {
          this.logger.warn(
            `Log search cancellation failed: ${error instanceof Error ? error.message : String(error)}`
          );
        });
    };
    signal?.addEventListener("abort", cancel, { once: true });
    let broken: Error | undefined;
    try {
      return await withLogQueryErrors(async () => {
        try {
          return (await client.query(text)).rows as T[];
        } catch (error) {
          if (!(error instanceof DatabaseError)) broken = error as Error;
          throw error;
        }
      });
    } finally {
      signal?.removeEventListener("abort", cancel);
      await cancellation;
      client.release(broken);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
