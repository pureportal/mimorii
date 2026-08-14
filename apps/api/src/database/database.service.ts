import { MikroORM } from "@mikro-orm/core";
import type { QueryResult, Transaction } from "@mikro-orm/core";
import { Injectable } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";
import type { PostgreSqlConnection } from "@mikro-orm/postgresql";

export interface RunResult {
  changes: number;
}

@Injectable()
export class DatabaseService {
  private readonly transactionContext = new AsyncLocalStorage<Transaction>();

  constructor(private readonly orm: MikroORM) {}

  async get<T>(sql: string, ...parameters: unknown[]): Promise<T | undefined> {
    return this.execute<T>(sql, parameters, "get");
  }

  async all<T>(sql: string, ...parameters: unknown[]): Promise<T[]> {
    return (await this.execute<T[]>(sql, parameters, "all")) ?? [];
  }

  async run(sql: string, ...parameters: unknown[]): Promise<RunResult> {
    const result = await this.execute<QueryResult>(sql, parameters, "run");
    return { changes: result?.affectedRows ?? 0 };
  }

  async transaction<T>(action: () => T | Promise<T>): Promise<T> {
    const parent = this.transactionContext.getStore();
    return this.connection.transactional(
      async (transaction) => this.transactionContext.run(transaction, action),
      parent ? { ctx: parent } : undefined
    );
  }

  private async execute<T>(
    sql: string,
    parameters: unknown[],
    method: "all" | "get" | "run"
  ): Promise<T> {
    return this.connection.execute(
      sql,
      parameters,
      method,
      this.transactionContext.getStore()
    ) as Promise<T>;
  }

  private get connection(): PostgreSqlConnection {
    return this.orm.em.getConnection() as PostgreSqlConnection;
  }
}
