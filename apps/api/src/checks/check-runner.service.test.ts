import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TargetSafetyService } from "../common/target-safety.service.js";
import { CheckRunnerService } from "./check-runner.service.js";

describe("check runner", () => {
  let server: Server;
  let port: number;
  const receivedMethods: string[] = [];
  const receivedBodies: string[] = [];
  const receivedAuthorization: string[] = [];
  const targets = new TargetSafetyService();
  vi.spyOn(targets, "validateHttpUrl").mockImplementation((value) => new URL(value));
  vi.spyOn(targets, "resolvePublicHost").mockResolvedValue(["127.0.0.1"]);

  beforeEach(async () => {
    receivedMethods.length = 0;
    receivedBodies.length = 0;
    receivedAuthorization.length = 0;
    server = createServer((request, response) => {
      receivedMethods.push(request.method ?? "");
      receivedAuthorization.push(String(request.headers.authorization ?? ""));
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        receivedBodies.push(Buffer.concat(chunks).toString("utf8"));
        if (request.url === "/json") {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ services: { api: "up", queue: "ready" }, errors: 0 }));
          return;
        }
        response.writeHead(204);
        response.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("HTTP fixture did not start");
    port = address.port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const)(
    "sends %s HTTP requests",
    async (method) => {
      const runner = new CheckRunnerService(targets, {} as never, {} as never);
      const result = await runner.run({
        id: `check-${method}`,
        type: "http",
        timeoutMs: 2_000,
        config: {
          target: { url: `http://monitor.test:${port}/health`, method },
          expectedStatuses: [204],
          followRedirects: false,
          validateTls: true,
        },
        secret: null,
      });

      expect(result.status).toBe("up");
      expect(result.statusCode).toBe(204);
      expect(receivedMethods).toEqual([method]);
    }
  );

  it("sends configured headers and body and evaluates grouped JSON conditions", async () => {
    const runner = new CheckRunnerService(targets, {} as never, {} as never);
    const result = await runner.run({
      id: "check-json",
      type: "http",
      timeoutMs: 2_000,
      config: {
        target: {
          url: `http://monitor.test:${port}/json`,
          method: "POST",
          secretHeaderName: "authorization",
          body: '{"probe":true}',
        },
        expectedStatuses: [200],
        jsonAssertions: {
          kind: "group",
          operator: "and",
          conditions: [
            {
              kind: "assertion",
              name: "API",
              pointer: "/services/api",
              operator: "equals",
              expectedValue: "up",
            },
            {
              kind: "group",
              operator: "or",
              conditions: [
                {
                  kind: "assertion",
                  name: "Queue",
                  pointer: "/services/queue",
                  operator: "equals",
                  expectedValue: "ready",
                },
                {
                  kind: "assertion",
                  name: "No errors",
                  pointer: "/errors",
                  operator: "lessThan",
                  expectedValue: 0,
                },
              ],
            },
          ],
        },
        followRedirects: false,
        validateTls: true,
      },
      secret: "Bearer test",
    });

    expect(result.status).toBe("up");
    expect(result.metrics).toMatchObject({
      "assertion.api.matched": true,
      "assertion.queue.matched": true,
      "assertion.no.errors.matched": false,
    });
    expect(receivedAuthorization).toEqual(["Bearer test"]);
    expect(receivedBodies).toEqual(['{"probe":true}']);
  });

  it("maps direct ICMP and database probe outcomes", async () => {
    const icmp = {
      probe: vi.fn(async () => ({
        sent: 3,
        received: 3,
        lossPercent: 0,
        minimumLatencyMs: 10,
        averageLatencyMs: 20,
        maximumLatencyMs: 30,
      })),
    };
    const database = {
      probe: vi.fn(async () => ({
        latencyMs: 8,
        degraded: true,
        message: "Database connection usage reached the warning threshold",
        metrics: { connectionUtilizationPercent: 90 },
      })),
    };
    const runner = new CheckRunnerService(targets, icmp as never, database as never);

    await expect(
      runner.run({
        id: "check-icmp",
        type: "icmp",
        timeoutMs: 1_000,
        config: {
          target: { host: "example.com" },
          packetCount: 3,
          minimumSuccessPercent: 100,
          latencyWarningMs: 25,
        },
        secret: null,
      })
    ).resolves.toMatchObject({ status: "up", latencyMs: 20 });

    await expect(
      runner.run({
        id: "check-db",
        type: "database",
        timeoutMs: 1_000,
        config: {
          target: {
            engine: "postgresql",
            host: "database.example.com",
            port: 5432,
            database: "app",
            username: "monitor",
            tls: true,
          },
          connectionWarningPercent: 80,
        },
        secret: "password",
      })
    ).resolves.toMatchObject({ status: "degraded", latencyMs: 8 });
    expect(database.probe).toHaveBeenCalledWith(expect.any(Object), "password", "127.0.0.1", 1_000);
  });
});
