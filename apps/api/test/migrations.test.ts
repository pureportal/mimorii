import { describe, expect, it } from "vitest";

const databaseConfigured = [
  "MIMORII_DB_HOST",
  "MIMORII_DB_PORT",
  "MIMORII_DB_NAME",
  "MIMORII_DB_USER",
  "MIMORII_DB_PASSWORD",
].every((name) => Boolean(process.env[name]));

describe.skipIf(!databaseConfigured)("PostgreSQL migrations", () => {
  it("creates the current application schema", async () => {
    const [{ MikroORM }, { default: databaseConfig }, { DatabaseService }] = await Promise.all([
      import("@mikro-orm/core"),
      import("../src/mikro-orm.config.js"),
      import("../src/database/database.service.js"),
    ]);
    const orm = await MikroORM.init(databaseConfig);
    try {
      await orm.getMigrator().up();
      const database = new DatabaseService(orm);
      const tables = await database.all<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
      );
      const tableNames = tables.map((table) => table.table_name);
      expect(tableNames).toEqual(
        expect.arrayContaining([
          "users",
          "teams",
          "resources",
          "checks",
          "heartbeat_monitors",
          "incidents",
          "notification_channels",
          "notification_endpoints",
          "notification_endpoint_deliveries",
          "dashboards",
          "dashboard_items",
          "status_pages",
          "service_level_objectives",
          "sponsors",
          "sponsorship_applications",
          "platform_settings",
        ])
      );

      const notificationColumns = await database.all<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'notification_channels'`
      );
      expect(notificationColumns.map((column) => column.column_name)).not.toContain("events_json");

      const notificationRuleColumns = await database.all<{
        table_name: string;
        column_name: string;
      }>(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'public'
         AND ((table_name = 'notification_policies'
           AND column_name IN ('condition_json', 'minimum_impact', 'resource_tags_json'))
          OR (table_name = 'notification_deliveries' AND column_name = 'claimed_at'))`
      );
      expect(notificationRuleColumns).toEqual(
        expect.arrayContaining([
          { table_name: "notification_policies", column_name: "condition_json" },
          { table_name: "notification_deliveries", column_name: "claimed_at" },
        ])
      );
      expect(notificationRuleColumns).not.toEqual(
        expect.arrayContaining([
          { table_name: "notification_policies", column_name: "minimum_impact" },
          { table_name: "notification_policies", column_name: "resource_tags_json" },
        ])
      );

      const channelConstraint = await database.get<{ definition: string }>(
        `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
         WHERE conname = 'notification_channels_type_check'`
      );
      expect(channelConstraint?.definition).toContain("'push'::text");

      const timestampColumns = await database.all<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'check_results'
           AND column_name = 'checked_at'`
      );
      expect(timestampColumns).toEqual([
        { column_name: "checked_at", data_type: "timestamp with time zone" },
      ]);

      const agentColumns = await database.all<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'agents'
           AND column_name IN ('collection_interval_seconds', 'kind')
         ORDER BY column_name`
      );
      expect(agentColumns).toEqual([
        { column_name: "collection_interval_seconds" },
        { column_name: "kind" },
      ]);

      const mobileStatusColumns = await database.all<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'mobile_device_statuses'
         ORDER BY column_name`
      );
      expect(mobileStatusColumns.map((column) => column.column_name)).toEqual([
        "agent_id",
        "id",
        "observed_at",
        "received_at",
        "status_json",
      ]);

      const mobileStatusIndexes = await database.all<{ indexname: string; indexdef: string }>(
        `SELECT indexname, indexdef FROM pg_indexes
         WHERE schemaname = 'public'
           AND indexname IN ('idx_mobile_device_statuses_agent_time', 'idx_mobile_device_statuses_time')
         ORDER BY indexname`
      );
      expect(mobileStatusIndexes).toHaveLength(2);
      expect(mobileStatusIndexes[0]?.indexdef).toContain("(agent_id, received_at DESC)");
      expect(mobileStatusIndexes[1]?.indexdef).toContain("(received_at)");

      const sponsorFaviconColumns = await database.all<{
        column_name: string;
        data_type: string;
      }>(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'sponsors'
           AND column_name IN ('favicon_data', 'favicon_updated_at')
         ORDER BY column_name`
      );
      expect(sponsorFaviconColumns).toEqual([
        { column_name: "favicon_data", data_type: "bytea" },
        { column_name: "favicon_updated_at", data_type: "timestamp with time zone" },
      ]);

      const privacyColumns = await database.all<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'public'
         AND ((table_name = 'users' AND column_name IN ('terms_version', 'terms_accepted_at'))
          OR (table_name = 'status_subscribers' AND column_name = 'verification_expires_at'))`
      );
      expect(privacyColumns).toEqual(
        expect.arrayContaining([
          { table_name: "users", column_name: "terms_version" },
          { table_name: "users", column_name: "terms_accepted_at" },
          { table_name: "status_subscribers", column_name: "verification_expires_at" },
        ])
      );

      const administratorColumns = await database.all<{
        table_name: string;
        column_name: string;
      }>(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'public'
         AND ((table_name = 'users'
           AND column_name IN ('is_global_admin', 'disabled_at', 'last_signed_in_at'))
          OR (table_name = 'sponsorship_applications'
           AND column_name IN ('status', 'reviewed_by', 'reviewed_at')))`
      );
      expect(administratorColumns).toEqual(
        expect.arrayContaining([
          { table_name: "users", column_name: "is_global_admin" },
          { table_name: "users", column_name: "disabled_at" },
          { table_name: "users", column_name: "last_signed_in_at" },
          { table_name: "sponsorship_applications", column_name: "status" },
          { table_name: "sponsorship_applications", column_name: "reviewed_by" },
          { table_name: "sponsorship_applications", column_name: "reviewed_at" },
        ])
      );

      const tourProfileColumns = await database.all<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'users'
         AND column_name = 'acknowledged_tour_ids'`
      );
      expect(tourProfileColumns).toEqual([
        { column_name: "acknowledged_tour_ids", data_type: "jsonb" },
      ]);

      const removedColumns = await database.all<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'public'
         AND ((table_name = 'team_invites' AND column_name = 'accepted_at')
          OR (table_name = 'status_subscribers' AND column_name = 'unsubscribed_at')
          OR (table_name = 'api_tokens' AND column_name = 'revoked_at'))`
      );
      expect(removedColumns).toEqual([]);

      const migration = await database.get<{ name: string }>(
        "SELECT name FROM mikro_orm_migrations ORDER BY id DESC LIMIT 1"
      );
      expect(migration?.name).toBe("Migration20260822000000");
    } finally {
      await orm.close(true);
    }
  });
});
