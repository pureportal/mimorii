import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TargetSafetyService } from "../common/target-safety.service.js";
import { FaviconFetcherService, FaviconRetrievalError } from "./favicon-fetcher.service.js";

describe("favicon retrieval", () => {
  let server: Server;
  let port: number;
  let largeIcon: Buffer;
  const resolveStrictPublicHost = vi.fn(async () => [{ address: "127.0.0.1", family: 4 as const }]);
  const targets = {
    validateHttpUrl(value: string) {
      const url = new URL(value);
      if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("invalid URL");
      return url;
    },
    resolveStrictPublicHost,
  } as unknown as TargetSafetyService;

  beforeEach(async () => {
    largeIcon = await sharp({
      create: {
        width: 192,
        height: 192,
        channels: 4,
        background: { r: 240, g: 80, b: 100, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    server = createServer((request, response) => {
      if (request.url === "/tracked") {
        response.writeHead(302, { location: "/home" });
        response.end();
        return;
      }
      if (request.url === "/home") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(`
          <html><head>
            <base href="/assets/">
            <link rel="icon" href="small.png" sizes="16x16">
            <link rel="shortcut icon" href="large.png" sizes="192x192">
          </head></html>
        `);
        return;
      }
      if (request.url === "/assets/large.png") {
        response.writeHead(200, { "content-type": "image/png" });
        response.end(largeIcon);
        return;
      }
      if (request.url === "/assets/small.png") {
        response.writeHead(200, { "content-type": "image/png" });
        response.end(Buffer.from("invalid"));
        return;
      }
      response.writeHead(404);
      response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
    resolveStrictPublicHost.mockClear();
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });

  it("follows validated redirects and chooses the largest declared icon", async () => {
    const image = await new FaviconFetcherService(targets).retrieve(
      `http://website.test:${port}/tracked`
    );

    expect(await sharp(image).metadata()).toMatchObject({ format: "png", width: 128, height: 128 });
    const pixel = await sharp(image).removeAlpha().raw().toBuffer();
    expect([...pixel.subarray(0, 3)]).toEqual([240, 80, 100]);
    expect(resolveStrictPublicHost).toHaveBeenCalledTimes(3);
    expect(resolveStrictPublicHost).toHaveBeenCalledWith("website.test");
  });

  it("falls back to the conventional root favicon", async () => {
    server.removeAllListeners("request");
    server.on("request", (request, response) => {
      if (request.url === "/") {
        response.writeHead(200, { "content-type": "text/html" });
        response.end("<html><head><title>Site</title></head></html>");
        return;
      }
      if (request.url === "/favicon.ico") {
        response.writeHead(200, { "content-type": "image/png" });
        response.end(largeIcon);
        return;
      }
      response.writeHead(404);
      response.end();
    });

    const image = await new FaviconFetcherService(targets).retrieve(`http://website.test:${port}/`);

    expect(await sharp(image).metadata()).toMatchObject({ width: 128, height: 128 });
  });

  it("returns a controlled failure when no candidate can be processed", async () => {
    server.removeAllListeners("request");
    server.on("request", (_request, response) => {
      response.writeHead(404);
      response.end();
    });

    await expect(
      new FaviconFetcherService(targets).retrieve(`http://website.test:${port}/missing`)
    ).rejects.toBeInstanceOf(FaviconRetrievalError);
  });
});
