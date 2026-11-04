import { Migration } from "@mikro-orm/migrations";

export class Migration20261104000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE check_result_hourly (
        check_id TEXT NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
        bucket_start TIMESTAMPTZ NOT NULL,
        up_count INTEGER NOT NULL,
        degraded_count INTEGER NOT NULL,
        down_count INTEGER NOT NULL,
        latency_sum DOUBLE PRECISION NOT NULL,
        latency_count INTEGER NOT NULL,
        PRIMARY KEY (check_id, bucket_start)
      ) WITH (fillfactor = 70);

      INSERT INTO check_result_hourly
        (check_id, bucket_start, up_count, degraded_count, down_count, latency_sum, latency_count)
      SELECT check_id, date_trunc('hour', checked_at, 'UTC'),
        COUNT(*) FILTER (WHERE status = 'up'),
        COUNT(*) FILTER (WHERE status = 'degraded'),
        COUNT(*) FILTER (WHERE status = 'down'),
        COALESCE(SUM(latency_ms::double precision) FILTER (WHERE status != 'down'), 0),
        COUNT(latency_ms) FILTER (WHERE status != 'down')
      FROM check_results
      GROUP BY check_id, date_trunc('hour', checked_at, 'UTC')
      ORDER BY check_id, date_trunc('hour', checked_at, 'UTC');
    `);
  }

  override async down(): Promise<void> {
    this.addSql("DROP TABLE check_result_hourly;");
  }
}
