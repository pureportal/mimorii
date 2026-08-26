import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../database/database.service.js";
import { reconcileAgentRelationships } from "./agent-relationships.js";

describe("agent relationship reconciliation", () => {
  it("reassigns replacements, suspends invalid routes, resumes valid routes, and expires stale tasks", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ changes: 3 })
      .mockResolvedValueOnce({ changes: 1 })
      .mockResolvedValueOnce({ changes: 2 })
      .mockResolvedValueOnce({ changes: 4 })
      .mockResolvedValueOnce({ changes: 5 });
    const database = {
      run,
      transaction: async <T>(action: () => Promise<T>) => action(),
    } as unknown as DatabaseService;

    await expect(reconcileAgentRelationships(database, "resource-1")).resolves.toEqual({
      reassignedChecks: 3,
      correctedResourceChecks: 1,
      suspendedChecks: 2,
      resumedChecks: 4,
      expiredTasks: 5,
    });
    expect(run).toHaveBeenCalledTimes(5);
    expect(run.mock.calls[0]?.[0]).toContain("active.resource_id = retired.resource_id");
    expect(run.mock.calls[0]?.slice(1, 2)).toEqual(["resource-1"]);
    expect(run.mock.calls[1]?.[0]).toContain("owner.resource_id = c.resource_id");
    expect(run.mock.calls[2]?.[0]).toContain("next_check_at = NULL");
    expect(run.mock.calls[3]?.[0]).toContain("c.next_check_at IS NULL");
    expect(run.mock.calls[4]?.[0]).toContain("task.agent_id <> c.agent_id");
  });
});
