import type { CheckConfig, CheckType } from "@mimorii/contracts";
import { describe, expect, it, vi } from "vitest";
import { CheckConfigService } from "../src/checks/check-config.service.js";
import type { DatabaseService } from "../src/database/database.service.js";
import {
  developmentSeedConfiguration,
  developmentSeedDefaults,
  seedAccount,
} from "../src/database/seed/account.js";
import { seedDevelopmentData } from "../src/database/seed/index.js";
import type { DevelopmentSeedSummary } from "../src/database/seed/verification.js";
import { verifyDevelopmentSeed } from "../src/database/seed/verification.js";

interface RunCall {
  sql: string;
  parameters: unknown[];
}

const completeSummary: DevelopmentSeedSummary = {
  owns_team: true,
  configured_agent: true,
  resources: 12,
  checks: 35,
  direct_checks: 10,
  agent_checks: 25,
  mapped_direct_checks: 3,
  port_checks: 11,
  check_types: 5,
  check_results: 282,
  agents: 5,
  heartbeats: 5,
  status_pages: 2,
};

describe("development seed", () => {
  it("targets the t4ggno development account and resets its credentials", async () => {
    const configuration = developmentSeedConfiguration({ NODE_ENV: "development" });
    expect(configuration).toMatchObject(developmentSeedDefaults);
    expect(configuration.password).toBe("password");

    const run = vi.fn(async (_sql: string, ..._parameters: unknown[]) => ({ changes: 1 }));
    const get = vi.fn(async (sql: string) => {
      if (sql.includes("FROM users WHERE email")) return { id: "user-t4ggno" };
      if (sql.includes("FROM teams WHERE created_by")) return { id: "team-t4ggno" };
      if (sql.includes("FROM agents WHERE team_id")) return { id: "agent-local" };
      return undefined;
    });
    const database = { get, run } as unknown as DatabaseService;

    const result = await seedAccount(database, configuration);

    expect(get).toHaveBeenCalledWith("SELECT id FROM users WHERE email = ?", "t4ggno@example.com");
    expect(result).toMatchObject({
      userId: "user-t4ggno",
      teamId: "team-t4ggno",
      agentId: "agent-local",
    });
    expect(run).toHaveBeenCalledWith(
      "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
      expect.stringMatching(/^scrypt\$/),
      expect.any(String),
      "user-t4ggno"
    );
    expect(run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE agents SET key_hash"),
      expect.any(String),
      JSON.stringify(["http", "tcp", "dns", "host", "disk"]),
      developmentSeedDefaults.agentIntervalSeconds,
      expect.any(String),
      "agent-local",
      "team-t4ggno"
    );
  });

  it("persists a comprehensive configuration in the selected account team", async () => {
    const runs: RunCall[] = [];
    const database = {
      get: async (sql: string) => {
        if (sql.includes("SELECT slug FROM teams")) return { slug: "t4ggno" };
        if (sql.includes("AS owns_team")) return completeSummary;
        return undefined;
      },
      run: async (sql: string, ...parameters: unknown[]) => {
        runs.push({ sql, parameters });
        return { changes: 1 };
      },
      transaction: async <T>(action: () => T | Promise<T>) => action(),
    } as unknown as DatabaseService;

    await seedDevelopmentData(database, {
      userId: "user-t4ggno",
      teamId: "team-t4ggno",
      agentId: "agent-local",
      password: "password",
    });

    const resources = inserts(runs, "resources");
    const checks = inserts(runs, "checks");
    const results = inserts(runs, "check_results");
    expect(resources).toHaveLength(12);
    expect(checks).toHaveLength(35);
    expect(results.length).toBeGreaterThanOrEqual(280);
    expect(resources.every((call) => call.parameters[1] === "team-t4ggno")).toBe(true);
    expect(checks.every((call) => call.parameters[1] === "team-t4ggno")).toBe(true);

    const resourceAgents = new Map(
      resources.map((call) => [String(call.parameters[0]), call.parameters[7]])
    );
    const agentChecks = checks.filter(
      (call) => resourceAgents.get(String(call.parameters[2])) !== null
    );
    const directChecks = checks.filter(
      (call) => resourceAgents.get(String(call.parameters[2])) === null
    );
    expect(agentChecks.length).toBeGreaterThanOrEqual(20);
    expect(directChecks.length).toBeGreaterThanOrEqual(8);
    expect(new Set(checks.map((call) => call.parameters[4]))).toEqual(
      new Set<CheckType>(["http", "tcp", "dns", "host", "disk"])
    );
    const validator = new CheckConfigService();
    for (const check of checks) {
      expect(() =>
        validator.validate(
          check.parameters[4] as CheckType,
          JSON.parse(String(check.parameters[5])) as Record<string, unknown>
        )
      ).not.toThrow();
    }

    const simple = namedCheck(checks, "Website availability");
    expect(resourceAgents.get(String(simple.parameters[2]))).toBeNull();
    expect(checkConfig(simple)).toEqual({
      url: "https://example.com/",
      method: "GET",
      expectedStatuses: [200],
      followRedirects: true,
      validateTls: true,
    });

    const health = namedCheck(checks, "Customer API health");
    const status = namedCheck(checks, "Public service status mapping");
    expect(resourceAgents.get(String(health.parameters[2]))).toBeNull();
    expect(resourceAgents.get(String(status.parameters[2]))).toBeNull();
    expect(checkConfig(health)).toMatchObject({
      jsonPointer: "/status",
      expectedJsonValue: "healthy",
      expectedHeaders: { "content-type": "application/json" },
    });
    expect(checkConfig(status)).toMatchObject({
      jsonPointer: "/page/status",
      expectedJsonValue: "operational",
    });

    const portChecks = checks.filter((call) => call.parameters[4] === "tcp");
    expect(portChecks.length).toBeGreaterThanOrEqual(8);
    expect(portChecks.some((call) => resourceAgents.get(String(call.parameters[2])) === null)).toBe(
      true
    );
    expect(portChecks.some((call) => resourceAgents.get(String(call.parameters[2])) !== null)).toBe(
      true
    );

    const statusHistory = results.filter((call) => call.parameters[1] === status.parameters[0]);
    expect(new Set(statusHistory.map((call) => call.parameters[2]))).toEqual(
      new Set(["up", "degraded", "down"])
    );
  });

  it("rejects a seed that was not persisted comprehensively", async () => {
    const database = {
      get: async () => ({ ...completeSummary, checks: 0 }),
    } as unknown as DatabaseService;

    await expect(
      verifyDevelopmentSeed(database, {
        userId: "user-t4ggno",
        teamId: "team-t4ggno",
        agentId: "agent-local",
      })
    ).rejects.toThrow(/Development seed is incomplete/);
  });
});

function inserts(calls: RunCall[], table: string): RunCall[] {
  return calls.filter((call) => new RegExp(`INSERT INTO ${table}\\b`).test(call.sql));
}

function namedCheck(checks: RunCall[], name: string): RunCall {
  return checks.find((call) => call.parameters[3] === name)!;
}

function checkConfig(check: RunCall): CheckConfig {
  return JSON.parse(String(check.parameters[5])) as CheckConfig;
}
