import { BadGatewayException, BadRequestException } from "@nestjs/common";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../common/audit.service.js";
import type { DatabaseService } from "../database/database.service.js";
import type { TeamAccessService } from "../teams/team-access.service.js";
import type { FaviconFetcherService } from "./favicon-fetcher.service.js";
import { ResourceImagesService } from "./resource-images.service.js";

function setup(options: { favicon?: Buffer; faviconError?: Error } = {}) {
  const database = {
    get: vi.fn(),
    transaction: vi.fn(async (action: () => Promise<unknown>) => action()),
  };
  const access = { require: vi.fn(async () => ({})) };
  const audit = { record: vi.fn(async () => undefined) };
  const favicons = {
    retrieve: options.faviconError
      ? vi.fn().mockRejectedValue(options.faviconError)
      : vi.fn().mockResolvedValue(options.favicon ?? Buffer.from("favicon")),
  };
  const images = new ResourceImagesService(
    database as unknown as DatabaseService,
    access as unknown as TeamAccessService,
    audit as unknown as AuditService,
    favicons as unknown as FaviconFetcherService
  );
  return { access, audit, database, favicons, images };
}

async function inputImage(color: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({
    create: { width: 320, height: 180, channels: 4, background: { ...color, alpha: 1 } },
  })
    .jpeg()
    .toBuffer();
}

describe("resource images", () => {
  it("normalizes and stores a manually selected image", async () => {
    const { access, audit, database, images } = setup();
    database.get
      .mockResolvedValueOnce({ id: "resource-1", kind: "server", target: "server.local" })
      .mockResolvedValueOnce({ updated_at: "2026-08-21T12:00:00.000Z" });

    const updatedAt = await images.replace(
      "user-1",
      "team-1",
      "resource-1",
      await inputImage({ r: 20, g: 80, b: 160 })
    );

    expect(updatedAt).toBe("2026-08-21T12:00:00.000Z");
    expect(access.require).toHaveBeenCalledWith("user-1", "team-1", "member");
    const storedImage = database.get.mock.calls[1]?.[2];
    expect(Buffer.isBuffer(storedImage)).toBe(true);
    expect(await sharp(storedImage as Buffer).metadata()).toMatchObject({
      format: "png",
      width: 128,
      height: 128,
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "resource.image_updated", subjectId: "resource-1" })
    );
  });

  it("replaces the stored image with a newly retrieved website favicon", async () => {
    const favicon = await sharp({
      create: {
        width: 128,
        height: 128,
        channels: 4,
        background: { r: 230, g: 90, b: 120, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const { audit, database, favicons, images } = setup({ favicon });
    database.get
      .mockResolvedValueOnce({
        id: "resource-1",
        kind: "endpoint",
        target: "https://example.com/status",
      })
      .mockResolvedValueOnce({ updated_at: "2026-08-21T12:01:00.000Z" });

    await expect(images.refreshFavicon("user-1", "team-1", "resource-1")).resolves.toBe(
      "2026-08-21T12:01:00.000Z"
    );
    expect(favicons.retrieve).toHaveBeenCalledWith("https://example.com/status");
    expect(database.get.mock.calls[1]?.[2]).toEqual(favicon);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "resource.favicon_updated" })
    );
  });

  it("does not offer favicon updates for non-website resources", async () => {
    const { database, images } = setup();
    database.get.mockResolvedValueOnce({ id: "resource-1", kind: "server", target: "host" });

    await expect(images.refreshFavicon("user-1", "team-1", "resource-1")).rejects.toEqual(
      new BadRequestException("Resource is not a website")
    );
  });

  it("reports refresh failures without replacing the current image", async () => {
    const { database, images } = setup({ faviconError: new Error("network failed") });
    database.get.mockResolvedValueOnce({
      id: "resource-1",
      kind: "endpoint",
      target: "https://example.com/",
    });

    await expect(images.refreshFavicon("user-1", "team-1", "resource-1")).rejects.toEqual(
      new BadGatewayException("Favicon could not be retrieved")
    );
    expect(database.get).toHaveBeenCalledOnce();
  });

  it("keeps website creation successful when automatic favicon retrieval fails", async () => {
    const { audit, database, images } = setup({ faviconError: new Error("network failed") });

    await expect(
      images.tryAssignFavicon("user-1", "team-1", "resource-1", "endpoint", "https://example.com/")
    ).resolves.toBe(false);
    expect(database.get).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("stores a successfully retrieved favicon during website creation", async () => {
    const favicon = await sharp({
      create: {
        width: 128,
        height: 128,
        channels: 4,
        background: { r: 70, g: 150, b: 120, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const { audit, database, images } = setup({ favicon });
    database.get.mockResolvedValueOnce({ updated_at: "2026-08-21T12:00:00.000Z" });

    await expect(
      images.tryAssignFavicon("user-1", "team-1", "resource-1", "endpoint", "https://example.com/")
    ).resolves.toBe(true);
    expect(database.get.mock.calls[0]?.[2]).toEqual(favicon);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "resource.favicon_updated",
        metadata: { automatic: true },
      })
    );
  });
});
