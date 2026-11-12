import { once } from "node:events";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { pinnedRequest, RequestTimeoutError, ResponseTooLargeError } from "./pinned-request.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    })
  );
});

async function listen(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handler);
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return (server.address() as AddressInfo).port;
}

describe("pinnedRequest", () => {
  it("connects to the resolved address while keeping the requested host", async () => {
    const received: Array<{ host?: string; body: string }> = [];
    const port = await listen((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        received.push({ host: request.headers.host, body: Buffer.concat(chunks).toString() });
        response.writeHead(202, { "retry-after": "5" }).end("accepted");
      });
    });

    const response = await pinnedRequest(
      new URL(`http://hooks.mimorii.invalid:${port}/deliver`),
      "127.0.0.1",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"ok":true}',
        timeoutMs: 2_000,
        maximumBytes: 1_024,
      }
    );

    expect(response.status).toBe(202);
    expect(response.headers["retry-after"]).toBe("5");
    expect(response.body.toString()).toBe("accepted");
    expect(received).toEqual([{ host: `hooks.mimorii.invalid:${port}`, body: '{"ok":true}' }]);
  });

  it("rejects oversized and slow responses", async () => {
    const port = await listen((request, response) => {
      if (request.url === "/large") response.end("x".repeat(2_048));
      else setTimeout(() => response.end("late"), 1_000);
    });
    const options = { method: "GET" as const, headers: {}, timeoutMs: 100, maximumBytes: 1_024 };

    await expect(
      pinnedRequest(new URL(`http://127.0.0.1:${port}/large`), "127.0.0.1", options)
    ).rejects.toBeInstanceOf(ResponseTooLargeError);
    await expect(
      pinnedRequest(new URL(`http://127.0.0.1:${port}/slow`), "127.0.0.1", options)
    ).rejects.toBeInstanceOf(RequestTimeoutError);
  });
});
