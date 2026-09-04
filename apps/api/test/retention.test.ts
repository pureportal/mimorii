import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseInitService } from "../src/database/database-init.service.js";
import type { DatabaseService } from "../src/database/database.service.js";
import type { PlatformSettingsService } from "../src/platform-settings/platform-settings.service.js";
import { RetentionService } from "../src/retention/retention.service.js";

describe("retention", () => {
  const run = vi.fn(() => Promise.resolve({ changes: 0 }));
  const database = {
    run,
    transaction: vi.fn(async (action: () => Promise<void>) => action()),
  } as unknown as DatabaseService;
  const databaseInit = {
    waitUntilReady: vi.fn(() => Promise.resolve()),
  } as unknown as DatabaseInitService;
  const sponsorshipApplicationRetentionDays = vi.fn(() => Promise.resolve(45));
  const platformSettings = {
    sponsorshipApplicationRetentionDays,
  } as unknown as PlatformSettingsService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T00:00:00.000Z"));
    vi.clearAllMocks();
    delete process.env.MIMORII_RETENTION_ENABLED;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the current platform setting for sponsorship application retention", async () => {
    const service = new RetentionService(database, databaseInit, platformSettings);

    await service.prune();

    expect(sponsorshipApplicationRetentionDays).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith(
      "DELETE FROM sponsorship_applications WHERE submitted_at < ?",
      "2026-06-29T00:00:00.000Z"
    );
    expect(run).toHaveBeenCalledWith(
      `DELETE FROM notification_endpoints
         WHERE (status = 'invalid' AND invalidated_at < ?) OR last_seen_at < ?`,
      "2026-02-14T00:00:00.000Z",
      "2025-11-16T00:00:00.000Z"
    );
    expect(run).toHaveBeenCalledWith(
      "DELETE FROM mobile_device_statuses WHERE received_at < ?",
      "2026-05-15T00:00:00.000Z"
    );
    expect(run).toHaveBeenCalledWith(
      "DELETE FROM user_sessions WHERE expires_at < CURRENT_TIMESTAMP"
    );
  });

  it("does not read settings or delete data when retention is disabled", async () => {
    process.env.MIMORII_RETENTION_ENABLED = "false";
    const service = new RetentionService(database, databaseInit, platformSettings);

    await service.prune();

    expect(sponsorshipApplicationRetentionDays).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
});
