import { Migration } from "@mikro-orm/migrations";

export class Migration20261114000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE heartbeat_monitors
        ADD COLUMN last_success_at TIMESTAMPTZ,
        ADD COLUMN status_changed_at TIMESTAMPTZ;

      UPDATE heartbeat_monitors hm SET last_success_at = (
        SELECT MAX(e.occurred_at) FROM heartbeat_events e
        WHERE e.heartbeat_id = hm.id AND e.type = 'succeeded'
      );

      UPDATE heartbeat_monitors hm SET status_changed_at = CASE
        WHEN hm.current_status IN ('up', 'down') THEN COALESCE((
          SELECT MIN(e.occurred_at) FROM heartbeat_events e
          WHERE e.heartbeat_id = hm.id AND e.type != 'started'
            AND (e.type = 'succeeded') = (hm.current_status = 'up')
            AND e.occurred_at > COALESCE((
              SELECT MAX(x.occurred_at) FROM heartbeat_events x
              WHERE x.heartbeat_id = hm.id AND x.type != 'started'
                AND (x.type = 'succeeded') != (hm.current_status = 'up')
            ), '-infinity'::timestamptz)
        ), hm.updated_at)
        ELSE hm.updated_at
      END;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE heartbeat_monitors
        DROP COLUMN status_changed_at,
        DROP COLUMN last_success_at;
    `);
  }
}
