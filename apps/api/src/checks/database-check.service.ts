import { Injectable } from "@nestjs/common";
import type { DatabaseCheckConfig } from "@mimorii/contracts";
import net from "node:net";
import mysql from "mysql2/promise";
import { Client, type QueryResult } from "pg";
import { createClient } from "redis";

export interface DatabaseProbeResult {
  latencyMs: number;
  degraded: boolean;
  message: string | null;
  metrics: Record<string, number | string | boolean | null>;
}

@Injectable()
export class DatabaseCheckService {
  async probe(
    config: DatabaseCheckConfig,
    password: string | null,
    address: string,
    timeoutMs: number
  ): Promise<DatabaseProbeResult> {
    switch (config.target.engine) {
      case "postgresql":
        return this.postgresql(config, password, address, timeoutMs);
      case "mysql":
        return this.mysql(config, password, address, timeoutMs);
      case "redis":
        return this.redis(config, password, address, timeoutMs);
    }
  }

  private async postgresql(
    config: DatabaseCheckConfig,
    password: string | null,
    address: string,
    timeoutMs: number
  ): Promise<DatabaseProbeResult> {
    const started = performance.now();
    const client = new Client({
      host: address,
      port: config.target.port,
      database: config.target.database,
      user: config.target.username,
      password: password ?? undefined,
      connectionTimeoutMillis: timeoutMs,
      query_timeout: timeoutMs,
      statement_timeout: timeoutMs,
      ssl: config.target.tls
        ? { rejectUnauthorized: true, servername: config.target.host }
        : undefined,
    });
    try {
      await client.connect();
      const result = await client.query<{
        version: string;
        connections: string;
        max_connections: string;
        database_size_bytes: string;
        transactions_committed: string;
        transactions_rolled_back: string;
        cache_hit_percent: string | null;
        deadlocks: string;
        slow_queries: string;
        replication_lag_seconds: string;
      }>(`
        SELECT
          current_setting('server_version') AS version,
          (SELECT COUNT(*) FROM pg_stat_activity)::text AS connections,
          current_setting('max_connections') AS max_connections,
          pg_database_size(current_database())::text AS database_size_bytes,
          xact_commit::text AS transactions_committed,
          xact_rollback::text AS transactions_rolled_back,
          CASE WHEN blks_hit + blks_read = 0 THEN NULL
            ELSE ROUND(blks_hit * 100.0 / (blks_hit + blks_read), 2)::text END AS cache_hit_percent,
          deadlocks::text,
          (SELECT COUNT(*) FROM pg_stat_activity
           WHERE state = 'active' AND query_start < CURRENT_TIMESTAMP - INTERVAL '5 seconds')::text
            AS slow_queries,
          COALESCE(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP - pg_last_xact_replay_timestamp()), 0)::text
            AS replication_lag_seconds
        FROM pg_stat_database WHERE datname = current_database()
      `);
      const row = result.rows[0];
      if (!row) throw new Error("Database statistics are unavailable");
      const metrics = {
        engine: "postgresql",
        version: row.version,
        connections: Number(row.connections),
        maxConnections: Number(row.max_connections),
        connectionUtilizationPercent: ratio(row.connections, row.max_connections),
        databaseSizeBytes: Number(row.database_size_bytes),
        transactionsCommitted: Number(row.transactions_committed),
        transactionsRolledBack: Number(row.transactions_rolled_back),
        cacheHitPercent: row.cache_hit_percent === null ? null : Number(row.cache_hit_percent),
        deadlocks: Number(row.deadlocks),
        slowQueries: Number(row.slow_queries),
        replicationLagSeconds: Number(row.replication_lag_seconds),
      };
      await this.assertQuery(client, config);
      return outcome(config, started, metrics);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  private async assertQuery(client: Client, config: DatabaseCheckConfig): Promise<void> {
    if (!config.query) return;
    await client.query("BEGIN TRANSACTION READ ONLY");
    let result: QueryResult<Record<string, unknown>>;
    try {
      result = await client.query<Record<string, unknown>>(config.query.statement);
    } finally {
      await client.query("ROLLBACK");
    }
    if (!Object.hasOwn(config.query, "expectedValue")) return;
    const actual = result.rows[0] ? Object.values(result.rows[0])[0] : undefined;
    if (!sameScalar(actual, config.query.expectedValue)) {
      throw new Error("Database query value did not match");
    }
  }

  private async mysql(
    config: DatabaseCheckConfig,
    password: string | null,
    address: string,
    timeoutMs: number
  ): Promise<DatabaseProbeResult> {
    const started = performance.now();
    const connection = await mysql.createConnection({
      host: config.target.host,
      port: config.target.port,
      database: config.target.database,
      user: config.target.username,
      password: password ?? undefined,
      connectTimeout: timeoutMs,
      stream: () => net.connect(config.target.port, address),
      ssl: config.target.tls ? { rejectUnauthorized: true, verifyIdentity: true } : undefined,
    });
    try {
      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT @@version AS version,
          @@max_connections AS maxConnections,
          (SELECT VARIABLE_VALUE FROM performance_schema.global_status
            WHERE VARIABLE_NAME = 'Threads_connected') AS connections,
          (SELECT VARIABLE_VALUE FROM performance_schema.global_status
            WHERE VARIABLE_NAME = 'Questions') AS questions,
          (SELECT VARIABLE_VALUE FROM performance_schema.global_status
            WHERE VARIABLE_NAME = 'Slow_queries') AS slowQueries,
          (SELECT VARIABLE_VALUE FROM performance_schema.global_status
            WHERE VARIABLE_NAME = 'Aborted_connects') AS abortedConnects,
          (SELECT VARIABLE_VALUE FROM performance_schema.global_status
            WHERE VARIABLE_NAME = 'Bytes_received') AS bytesReceived,
          (SELECT VARIABLE_VALUE FROM performance_schema.global_status
            WHERE VARIABLE_NAME = 'Bytes_sent') AS bytesSent,
          (SELECT VARIABLE_VALUE FROM performance_schema.global_status
            WHERE VARIABLE_NAME = 'Uptime') AS uptimeSeconds`
      );
      const row = rows[0];
      if (!row) throw new Error("Database statistics are unavailable");
      const metrics = {
        engine: "mysql",
        version: String(row.version),
        connections: Number(row.connections),
        maxConnections: Number(row.maxConnections),
        connectionUtilizationPercent: ratio(row.connections, row.maxConnections),
        questions: Number(row.questions),
        slowQueries: Number(row.slowQueries),
        abortedConnects: Number(row.abortedConnects),
        bytesReceived: Number(row.bytesReceived),
        bytesSent: Number(row.bytesSent),
        uptimeSeconds: Number(row.uptimeSeconds),
        replicationLagSeconds: 0,
      };
      if (config.query) {
        await connection.query("START TRANSACTION READ ONLY");
        let queryRows: mysql.RowDataPacket[];
        try {
          [queryRows] = await connection.query<mysql.RowDataPacket[]>(config.query.statement);
        } finally {
          await connection.query("ROLLBACK");
        }
        if (Object.hasOwn(config.query, "expectedValue")) {
          const actual = queryRows[0] ? Object.values(queryRows[0])[0] : undefined;
          if (!sameScalar(actual, config.query.expectedValue)) {
            throw new Error("Database query value did not match");
          }
        }
      }
      return outcome(config, started, metrics);
    } finally {
      await connection.end();
    }
  }

  private async redis(
    config: DatabaseCheckConfig,
    password: string | null,
    address: string,
    timeoutMs: number
  ): Promise<DatabaseProbeResult> {
    const started = performance.now();
    const client = createClient({
      username: config.target.username,
      password: password ?? undefined,
      database: config.target.database ? Number(config.target.database) : undefined,
      socket: config.target.tls
        ? {
            host: address,
            port: config.target.port,
            connectTimeout: timeoutMs,
            tls: true,
            servername: config.target.host,
          }
        : { host: address, port: config.target.port, connectTimeout: timeoutMs },
    });
    client.on("error", () => undefined);
    try {
      await client.connect();
      const values = parseRedisInfo(await client.info());
      const connections = Number(values.connected_clients ?? 0);
      const maxConnections = Number(values.maxclients ?? 0);
      const hits = Number(values.keyspace_hits ?? 0);
      const misses = Number(values.keyspace_misses ?? 0);
      const metrics = {
        engine: "redis",
        version: values.redis_version ?? "unknown",
        connections,
        maxConnections,
        connectionUtilizationPercent: maxConnections ? (connections / maxConnections) * 100 : 0,
        memoryUsedBytes: Number(values.used_memory ?? 0),
        memoryPeakBytes: Number(values.used_memory_peak ?? 0),
        cacheHitPercent: hits + misses ? (hits / (hits + misses)) * 100 : null,
        rejectedConnections: Number(values.rejected_connections ?? 0),
        evictedKeys: Number(values.evicted_keys ?? 0),
        uptimeSeconds: Number(values.uptime_in_seconds ?? 0),
        replicationLagSeconds: 0,
        slowQueries: 0,
      };
      return outcome(config, started, metrics);
    } finally {
      if (client.isOpen) await client.quit().catch(() => client.disconnect());
    }
  }
}

function outcome(
  config: DatabaseCheckConfig,
  started: number,
  metrics: Record<string, number | string | boolean | null>
): DatabaseProbeResult {
  const connectionWarning =
    Number(metrics.connectionUtilizationPercent ?? 0) >= config.connectionWarningPercent;
  const replicationWarning =
    config.replicationLagWarningSeconds !== undefined &&
    Number(metrics.replicationLagSeconds ?? 0) >= config.replicationLagWarningSeconds;
  const slowQueryWarning =
    config.slowQueryWarningCount !== undefined &&
    Number(metrics.slowQueries ?? 0) >= config.slowQueryWarningCount;
  return {
    latencyMs: Math.round((performance.now() - started) * 10) / 10,
    degraded: connectionWarning || replicationWarning || slowQueryWarning,
    message: connectionWarning
      ? "Database connection usage reached the warning threshold"
      : replicationWarning
        ? "Database replication lag reached the warning threshold"
        : slowQueryWarning
          ? "Database slow queries reached the warning threshold"
          : null,
    metrics,
  };
}

function ratio(value: unknown, maximum: unknown): number {
  const denominator = Number(maximum);
  return denominator ? (Number(value) / denominator) * 100 : 0;
}

function sameScalar(actual: unknown, expected: unknown): boolean {
  if (actual instanceof Date) return actual.toISOString() === expected;
  if (typeof expected === "number") return Number(actual) === expected;
  if (typeof expected === "boolean") return booleanScalar(actual) === expected;
  if (expected === null) return actual === null;
  return String(actual) === expected;
}

function booleanScalar(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true" || value === "t") return true;
  if (value === 0 || value === "0" || value === "false" || value === "f") return false;
  return undefined;
}

function parseRedisInfo(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes(":"))
      .map((line) => {
        const separator = line.indexOf(":");
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
}
