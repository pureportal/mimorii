import { describe, expect, it, vi } from "vitest";
import { HeartbeatsService } from "./heartbeats.service.js";
import type { DatabaseService } from "../database/database.service.js";
import type { TeamAccessService } from "../teams/team-access.service.js";
import type { IncidentsService } from "../incidents/incidents.service.js";
import type { AuditService } from "../common/audit.service.js";

function fixture() {
  const row = {
    id: "heartbeat",
    enabled: 1,
    interval_seconds: 60,
    current_status: "up",
    running_since: null,
  };
  const run = vi.fn().mockResolvedValue({ changes: 1 });
  const incidents = { openForHeartbeat: vi.fn(), resolveForHeartbeat: vi.fn() };
  const database = {
    all: vi.fn().mockResolvedValue([row]),
    get: vi.fn().mockResolvedValue(row),
    run,
    transaction: vi.fn(async (action: () => Promise<void>) => action()),
  };
  const service = new HeartbeatsService(
    database as unknown as DatabaseService,
    {} as TeamAccessService,
    incidents as unknown as IncidentsService,
    {} as AuditService
  );
  return { service, run, incidents, row, database };
}

describe("Foxytail heartbeat telemetry", () => {
  it("stores up to 64 flat values and opens and resolves an incident", async () => {
    const { service, run, incidents, row } = fixture();
    const metadata = {
      application: "foxytail",
      downloadsFailed: 2,
      ...Object.fromEntries(Array.from({ length: 62 }, (_, index) => [`metric${index}`, index])),
    };
    await expect(
      service.signal("token", "failed", { message: "2 downloads failed", metadata })
    ).resolves.toMatchObject({ accepted: true, status: "down" });
    const insert = run.mock.calls.find(([sql]) => sql.includes("INSERT INTO heartbeat_events"))!;
    expect(JSON.parse(insert[6])).toEqual(metadata);
    expect(incidents.openForHeartbeat).toHaveBeenCalledWith(
      "heartbeat",
      "2 downloads failed",
      expect.any(String)
    );
    row.current_status = "down";
    await service.signal("token", "succeeded", {
      metadata: { application: "foxytail", downloadsFailed: 0 },
    });
    expect(incidents.resolveForHeartbeat).toHaveBeenCalledOnce();
  });

  it("rejects excessive, nested and oversized metadata before writing events", async () => {
    const { service, run } = fixture();
    for (const metadata of [
      Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`metric${index}`, index])),
      { downloads: { active: 1 } },
      Object.fromEntries(
        Array.from({ length: 32 }, (_, index) => [`metric${index}`, "a".repeat(500)])
      ),
    ])
      await expect(service.signal("token", "succeeded", { metadata })).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });

  it("pauses a monitor, resolves its incident, and resumes without resetting enabled monitors", async () => {
    const { service, run, row, incidents, database } = fixture();
    row.current_status = "down";
    await expect(service.setReporting("token", false)).resolves.toEqual({ accepted: true });
    expect(incidents.resolveForHeartbeat).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE heartbeat_monitors"),
      0,
      "paused",
      null,
      expect.any(String),
      "heartbeat"
    );
    row.enabled = 0;
    row.current_status = "paused";
    await service.setReporting("token", true);
    expect(run).toHaveBeenLastCalledWith(
      expect.any(String),
      1,
      "pending",
      expect.any(String),
      expect.any(String),
      "heartbeat"
    );
    run.mockClear();
    row.enabled = 1;
    await service.setReporting("token", true);
    expect(run).not.toHaveBeenCalled();
    database.get.mockResolvedValueOnce(undefined);
    await expect(service.setReporting("invalid", false)).rejects.toThrow(
      "Heartbeat monitor not found"
    );
  });
});
