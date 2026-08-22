import { Migration } from "@mikro-orm/migrations";

export class Migration20260825000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      UPDATE mobile_device_statuses
      SET status_json = (status_json - 'collector') || jsonb_build_object('agent', status_json->'collector')
      WHERE status_json ? 'collector';
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      UPDATE mobile_device_statuses
      SET status_json = (status_json - 'agent') || jsonb_build_object('collector', status_json->'agent')
      WHERE status_json ? 'agent';
    `);
  }
}
