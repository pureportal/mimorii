import { BadRequestException } from "@nestjs/common";
import { encodeIco } from "icojs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { optimizeImageAsset } from "../src/common/image-asset.js";
import { createFavicon, faviconFormats } from "../src/common/image-asset.fixtures.js";

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

  it.each(faviconFormats)("normalizes a %s favicon to PNG", async (format) => {
    const output = await optimizeImageAsset(await createFavicon(format), 128, true);

    expect(await sharp(output).metadata()).toMatchObject({
      format: "png",
      width: 128,
      height: 128,
    });
    const pixel = await sharp(output)
      .extract({ left: 64, top: 64, width: 1, height: 1 })
      .removeAlpha()
      .raw()
      .toBuffer();
    for (const [channel, expected] of [40, 120, 220].entries()) {
      expect(pixel[channel]).toBeGreaterThanOrEqual(expected - 3);
      expect(pixel[channel]).toBeLessThanOrEqual(expected + 3);
    }
  });

  it.each([16, 512, 2048, 4096])("renders an SVG with a %s-unit viewBox", async (size) => {
    const input =
      Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size / 2}" fill="red"/>
    </svg>`);

    const output = await optimizeImageAsset(input, 128, true);
    const { data, info } = await sharp(output)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect(info).toMatchObject({ width: 128, height: 128, channels: 4 });
    expect([...data.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect(data[(127 * 128 + 64) * 4 + 3]).toBe(0);
  });

  it.each(["svg", "avif"] as const)("keeps %s limited to favicon retrieval", async (format) => {
    await expect(optimizeImageAsset(await createFavicon(format), 128)).rejects.toEqual(
      new BadRequestException("Choose a PNG, JPEG, WebP, or GIF image")
    );
  });

  it("rejects malformed SVG before storing it", async () => {
    const input = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path');

    await expect(optimizeImageAsset(input, 128, true)).rejects.toEqual(
      new BadRequestException("Choose a valid image")
    );
  });

  it("rejects truncated AVIF data", async () => {
    const input = await createFavicon("avif");

    await expect(optimizeImageAsset(input.subarray(0, 32), 128, true)).rejects.toEqual(
      new BadRequestException("Choose a valid image")
    );
  });
});
