import { Migration } from "@mikro-orm/migrations";

export class Migration20261127020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      DELETE FROM resource_alert_rules rule
      WHERE rule.metric NOT IN (
        'batteryPercent', 'batteryTemperatureCelsius', 'memoryPercent', 'storagePercent',
        'internetAvailable', 'lowMemory', 'backgroundRestricted'
      )
      OR NOT EXISTS (
        SELECT 1 FROM agents agent
        WHERE agent.resource_id = rule.resource_id AND agent.kind = 'mobile' AND agent.revoked_at IS NULL
      );
      ALTER TABLE resource_alert_rules DROP CONSTRAINT resource_alert_rules_metric_check;
      ALTER TABLE resource_alert_rules ADD CONSTRAINT resource_alert_rules_metric_check CHECK (metric IN (
        'batteryPercent', 'batteryTemperatureCelsius', 'memoryPercent', 'storagePercent',
        'internetAvailable', 'lowMemory', 'backgroundRestricted'
      ));
    `);
  }

  override async down(): Promise<void> {
    throw new Error("Resource alert rules cannot be restored for desktop metrics");
  }
}
