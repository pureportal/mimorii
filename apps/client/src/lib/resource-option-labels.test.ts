import type { ResourceSummary } from "@mimorii/contracts";
import { describe, expect, it } from "vitest";
import { resourceOptionLabels } from "./resource-option-labels";

describe("resourceOptionLabels", () => {
  it("keeps unique resource names concise", () => {
    const resource = createResource({ id: "host-1", name: "Database" });

    expect(resourceOptionLabels([resource]).get(resource.id)).toBe("Database");
  });

  it("uses the platform to distinguish resources with the same name", () => {
    const linux = createResource({
      id: "host-1",
      name: "Application server",
      agent: { platform: "Linux" },
    });
    const windows = createResource({
      id: "host-2",
      name: "Application server",
      agent: { platform: "Windows 11" },
    });

    const labels = resourceOptionLabels([linux, windows]);

    expect(labels.get(linux.id)).toBe("Application server · Linux");
    expect(labels.get(windows.id)).toBe("Application server · Windows 11");
  });

  it("numbers otherwise identical choices in creation order", () => {
    const newer = createResource({
      id: "host-2",
      name: "Archive server",
      createdAt: "2026-08-26T12:00:00.000Z",
    });
    const older = createResource({
      id: "host-1",
      name: "Archive server",
      createdAt: "2026-08-25T12:00:00.000Z",
    });

    const labels = resourceOptionLabels([newer, older]);

    expect(labels.get(older.id)).toBe("Archive server · Host 1");
    expect(labels.get(newer.id)).toBe("Archive server · Host 2");
  });
});

function createResource(
  overrides: Pick<ResourceSummary, "id" | "name"> & {
    agent?: { platform: string };
    createdAt?: string;
  }
): ResourceSummary {
  return {
    id: overrides.id,
    teamId: "team-1",
    name: overrides.name,
    kind: "host",
    description: null,
    tags: [],
    agent: overrides.agent
      ? {
          id: `agent-${overrides.id}`,
          kind: "desktop",
          status: "online",
          platform: overrides.agent.platform,
          version: null,
          lastSeenAt: null,
        }
      : null,
    status: "up",
    checksPassing: 1,
    checksTotal: 1,
    lastCheckedAt: null,
    inMaintenance: false,
    imageUpdatedAt: null,
    createdAt: overrides.createdAt ?? "2026-08-25T12:00:00.000Z",
  };
}
