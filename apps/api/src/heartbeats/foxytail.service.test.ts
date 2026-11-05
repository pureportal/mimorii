import { describe, expect, it, vi } from "vitest";
import { FoxytailService } from "./foxytail.service.js";
import type { DatabaseService } from "../database/database.service.js";
import type { ResourcesService } from "../resources/resources.service.js";
import type { HeartbeatsService } from "./heartbeats.service.js";

function fixture() {
  const transaction = vi.fn(async (action: () => Promise<unknown>) => action());
  const resource = vi.fn().mockResolvedValue({ id: "resource" });
  const heartbeat = vi.fn().mockResolvedValue({ pingToken: "scoped-token" });
  const service = new FoxytailService(
    { transaction } as unknown as DatabaseService,
    { create: resource } as unknown as ResourcesService,
    { create: heartbeat } as unknown as HeartbeatsService
  );
  return { service, transaction, resource, heartbeat };
}

describe("Foxytail enrollment", () => {
  it("creates a service and a one-minute monitor in one transaction", async () => {
    const { service, transaction, resource, heartbeat } = fixture();
    await expect(service.enroll("user", "team", " Living room ")).resolves.toEqual({
      pingToken: "scoped-token",
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(resource).toHaveBeenCalledWith("user", "team", {
      name: "Living room",
      kind: "service",
      tags: ["foxytail"],
    });
    expect(heartbeat).toHaveBeenCalledWith("user", "team", {
      resourceId: "resource",
      name: "Living room",
      intervalSeconds: 60,
      graceSeconds: 120,
      enabled: false,
    });
  });

  it("propagates permission failures without creating a monitor", async () => {
    const { service, resource, heartbeat } = fixture();
    resource.mockRejectedValue(new Error("Forbidden"));
    await expect(service.enroll("viewer", "team", "Foxytail")).rejects.toThrow("Forbidden");
    expect(heartbeat).not.toHaveBeenCalled();
  });

  it("propagates monitor failures to roll back the transaction", async () => {
    const { service, heartbeat, transaction } = fixture();
    heartbeat.mockRejectedValue(new Error("Monitor limit reached"));
    await expect(service.enroll("user", "team", "Foxytail")).rejects.toThrow(
      "Monitor limit reached"
    );
    await expect(transaction.mock.results[0]!.value).rejects.toThrow("Monitor limit reached");
  });

  it("rejects blank names before creating a resource", async () => {
    const { service, resource } = fixture();
    await expect(service.enroll("user", "team", "  ")).rejects.toThrow("Enter a server name");
    expect(resource).not.toHaveBeenCalled();
  });
});
