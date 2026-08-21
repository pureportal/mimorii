import { BadRequestException } from "@nestjs/common";
import { encodeIco } from "icojs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { optimizeImageAsset } from "../src/common/image-asset.js";

describe("image asset processing", () => {
  it("validates and converts an image to an optimized square PNG", async () => {
    const input = await sharp({
      create: {
        width: 320,
        height: 180,
        channels: 4,
        background: { r: 83, g: 67, b: 178, alpha: 0.8 },
      },
    })
      .jpeg()
      .toBuffer();

    const output = await optimizeImageAsset(input, 64);
    const metadata = await sharp(output).metadata();

    expect(metadata).toMatchObject({ format: "png", width: 64, height: 64 });
    expect(metadata.hasAlpha).toBe(true);
  });

  it("rejects bytes that are not a valid image", async () => {
    await expect(optimizeImageAsset(Buffer.from("not an image"), 64)).rejects.toEqual(
      new BadRequestException("Choose a valid image")
    );
  });

  it("rejects unsupported image formats", async () => {
    const input = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .tiff()
      .toBuffer();

    await expect(optimizeImageAsset(input, 64)).rejects.toEqual(
      new BadRequestException("Choose a PNG, JPEG, WebP, or GIF image")
    );
  });

  it("rejects images above the supported dimensions", async () => {
    const input = await sharp({
      create: {
        width: 4097,
        height: 1,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    await expect(optimizeImageAsset(input, 64)).rejects.toEqual(
      new BadRequestException("Image dimensions must not exceed 4096 × 4096 pixels")
    );
  });

  it("decodes an ICO image before normalization", async () => {
    const png = await sharp({
      create: {
        width: 48,
        height: 48,
        channels: 4,
        background: { r: 42, g: 120, b: 210, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const ico = Buffer.from(await encodeIco([{ buffer: png }]));

    const output = await optimizeImageAsset(ico, 128, true);

    expect(await sharp(output).metadata()).toMatchObject({
      format: "png",
      width: 128,
      height: 128,
    });
  });
});
