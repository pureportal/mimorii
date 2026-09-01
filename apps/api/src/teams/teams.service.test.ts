import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../common/audit.service.js";
import type { DatabaseService } from "../database/database.service.js";
import { defaultNotificationPolicyName } from "../notifications/default-notification-policy.js";
import type { TeamAccessService } from "./team-access.service.js";
import type { TeamLogosService } from "./team-logos.service.js";
import { TeamsService } from "./teams.service.js";

function setup() {
  const database = {
    all: vi.fn(),
    get: vi.fn(),
    run: vi.fn(async (..._parameters: unknown[]) => ({ changes: 1 })),
    transaction: vi.fn(async (action: () => Promise<unknown>) => action()),
  };
  const access = { require: vi.fn(async () => ({ role: "owner" })) };
  const audit = { record: vi.fn(async () => undefined) };
  const logos = {
    prepare: vi.fn(async (input: Buffer) => Buffer.concat([Buffer.from("prepared:"), input])),
    store: vi.fn(async () => "2026-08-26T12:00:00.000Z"),
  };
  const teams = new TeamsService(
    database as unknown as DatabaseService,
    access as unknown as TeamAccessService,
    audit as unknown as AuditService,
    logos as unknown as TeamLogosService
  );
  return { access, audit, database, logos, teams };
}

describe("TeamsService", () => {
  it("returns logo revisions with team summaries", async () => {
    const { database, teams } = setup();
    database.all.mockResolvedValueOnce([
      {
        id: "team-1",
        name: "Operations",
        role: "admin",
        logo_updated_at: "2026-08-26T10:00:00.000Z",
        created_at: "2026-08-20T10:00:00.000Z",
      },
      {
        id: "team-2",
        name: "Platform",
        role: "viewer",
        logo_updated_at: null,
        created_at: "2026-08-21T10:00:00.000Z",
      },
    ]);

    await expect(teams.list("user-1")).resolves.toEqual([
      {
        id: "team-1",
        name: "Operations",
        role: "admin",
        logoUpdatedAt: "2026-08-26T10:00:00.000Z",
        createdAt: "2026-08-20T10:00:00.000Z",
      },
      {
        id: "team-2",
        name: "Platform",
        role: "viewer",
        logoUpdatedAt: null,
        createdAt: "2026-08-21T10:00:00.000Z",
      },
    ]);
    expect(database.all.mock.calls[0]?.[0]).toContain("LEFT JOIN team_logos");
  });

  it("stores a prepared logo in the team creation transaction", async () => {
    const { audit, database, logos, teams } = setup();
    const input = Buffer.from("logo");

    await expect(teams.create("user-1", { name: " Operations " }, input)).resolves.toMatchObject({
      name: "Operations",
      role: "owner",
      logoUpdatedAt: "2026-08-26T12:00:00.000Z",
    });

    expect(logos.prepare).toHaveBeenCalledWith(input);
    expect(logos.store).toHaveBeenCalledWith(expect.any(String), Buffer.from("prepared:logo"));
    expect(database.transaction).toHaveBeenCalledOnce();
    const defaultRule = database.run.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO notification_policies")
    );
    expect(defaultRule?.[3]).toBe(defaultNotificationPolicyName);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "team.created" }));
  });

  it("replaces a team logo while updating team details", async () => {
    const { access, audit, database, logos, teams } = setup();
    database.get.mockResolvedValueOnce({
      id: "team-1",
      name: "Platform",
      role: "owner",
      logo_updated_at: "2026-08-26T12:00:00.000Z",
      created_at: "2026-08-20T10:00:00.000Z",
    });

    await expect(
      teams.update("user-1", "team-1", { name: " Platform " }, Buffer.from("logo"))
    ).resolves.toMatchObject({
      name: "Platform",
      logoUpdatedAt: "2026-08-26T12:00:00.000Z",
    });

    expect(access.require).toHaveBeenCalledWith("user-1", "team-1", "admin");
    expect(logos.store).toHaveBeenCalledWith("team-1", Buffer.from("prepared:logo"));
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "team.logo_updated", subjectId: "team-1" })
    );
  });
});
