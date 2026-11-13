import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFavicon, faviconFormats } from "../common/image-asset.fixtures.js";
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
            <title>Pricing · Website   Labs</title>
            <meta name="description" content="  Uptime for   every team ">
            <base href="/assets/">
            <link rel="icon" href="small.png" sizes="16x16">
            <link rel="shortcut icon" href="large.png" sizes="192x192">
          </head></html>
        `);
        return;
      }
      if (request.url === "/large") {
        response.writeHead(200, { "content-type": "text/html" });
        response.end(
          `<html><head><title>Large Website</title></head><body>${"x".repeat(700_000)}</body></html>`
        );
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

  it("reads the brand, description and final address of a website", async () => {
    const inspection = await new FaviconFetcherService(targets).inspect(
      `http://website.test:${port}/tracked`
    );

    expect(inspection).toMatchObject({
      reachable: true,
      name: "Website Labs",
      description: "Uptime for every team",
    });
    expect(inspection.finalUrl.pathname).toBe("/home");
    expect(inspection.requestedUrl.pathname).toBe("/tracked");
    expect(inspection.icon).toBeInstanceOf(Buffer);
  });

  it("reads the brand from the start of a large page", async () => {
    const inspection = await new FaviconFetcherService(targets).inspect(
      `http://website.test:${port}/large`
    );

    expect(inspection).toMatchObject({ reachable: true, name: "Large Website" });
  });

  it("reports an address that answers with an error as reachable", async () => {
    const inspection = await new FaviconFetcherService(targets).inspect(
      `http://website.test:${port}/missing`
    );

    expect(inspection).toMatchObject({ reachable: true, name: null, description: null });
  });

  it("reports an address that cannot be resolved as unreachable", async () => {
    resolveStrictPublicHost.mockRejectedValueOnce(new Error("unresolved"));
    resolveStrictPublicHost.mockRejectedValueOnce(new Error("unresolved"));

    const inspection = await new FaviconFetcherService(targets).inspect(
      `http://offline.test:${port}/`
    );

    expect(inspection).toMatchObject({ reachable: false, name: null, icon: null });
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

  it.each(faviconFormats)("discovers and processes a linked %s favicon", async (format) => {
    const favicon = await createFavicon(format);
    const paths: string[] = [];
    server.removeAllListeners("request");
    server.on("request", (request, response) => {
      paths.push(request.url!);
      if (request.url === "/") {
        response.writeHead(200, { "content-type": "text/html" });
        response.end(`<head>
          <base href="/assets/">
          <link rel="icon" href="small.png" sizes="16x16">
          <link rel="icon" type="image/${format === "svg" ? "svg+xml" : format}" href="icon?v=2" sizes="any">
        </head>`);
        return;
      }
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.end(favicon);
    });

    const image = await new FaviconFetcherService(targets).retrieve(`http://website.test:${port}/`);

    expect(paths).toEqual(["/", "/assets/icon?v=2"]);
    expect(await sharp(image).metadata()).toMatchObject({ format: "png", width: 128, height: 128 });
  });

  it("continues to another icon after an invalid SVG", async () => {
    server.removeAllListeners("request");
    server.on("request", (request, response) => {
      if (request.url === "/") {
        response.writeHead(200, { "content-type": "text/html" });
        response.end(
          '<link rel="icon" href="/broken.svg" sizes="any"><link rel="icon" href="/valid.png">'
        );
      } else if (request.url === "/broken.svg") {
        response.writeHead(200, { "content-type": "image/svg+xml" });
        response.end("<svg><path");
      } else {
        response.writeHead(200, { "content-type": "image/png" });
        response.end(largeIcon);
      }
    });

    const image = await new FaviconFetcherService(targets).retrieve(`http://website.test:${port}/`);

    expect(await sharp(image).metadata()).toMatchObject({ format: "png", width: 128, height: 128 });
    expect(resolveStrictPublicHost).toHaveBeenCalledTimes(3);
  });
});
