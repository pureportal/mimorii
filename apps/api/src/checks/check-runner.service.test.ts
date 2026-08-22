import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TargetSafetyService } from "../common/target-safety.service.js";
import { CheckRunnerService } from "./check-runner.service.js";

describe("check runner", () => {
  let server: Server;
  let port: number;
  const receivedMethods: string[] = [];
  const targets = new TargetSafetyService();
  vi.spyOn(targets, "validateHttpUrl").mockImplementation((value) => new URL(value));
  vi.spyOn(targets, "resolvePublicHost").mockResolvedValue(["127.0.0.1"]);

  beforeEach(async () => {
    receivedMethods.length = 0;
    server = createServer((request, response) => {
      receivedMethods.push(request.method ?? "");
      response.writeHead(204);
      response.end();
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
      const runner = new CheckRunnerService(targets);
      const result = await runner.run({
        id: `check-${method}`,
        type: "http",
        timeoutMs: 2_000,
        config: {
          url: `http://monitor.test:${port}/health`,
          method,
          expectedStatuses: [204],
          followRedirects: false,
          validateTls: true,
        },
      });

      expect(result.status).toBe("up");
      expect(result.statusCode).toBe(204);
      expect(receivedMethods).toEqual([method]);
    }
  );
});
