import { imageAssetMaxDimension, imageAssetMimeTypes } from "@mimorii/contracts";
import { BadRequestException } from "@nestjs/common";
import { decodeIco, isIco } from "icojs";
import sharp, { type Metadata } from "sharp";

const supportedFormats = new Set(imageAssetMimeTypes.map((type) => type.replace("image/", "")));
const maximumIcoImages = 32;

export async function optimizeImageAsset(
  input: Buffer,
  dimension: number,
  allowFaviconFormats = false
): Promise<Buffer> {
  if (input.length === 0) throw new BadRequestException("Choose a valid image");

  const decoded = allowFaviconFormats ? await decodeIcoImage(input) : input;
  let metadata: Metadata;

  try {
    metadata = await sharp(decoded, {
      failOn: "warning",
      limitInputPixels: false,
      sequentialRead: true,
    }).metadata();
  } catch {
    throw new BadRequestException("Choose a valid image");
  }

  if (
    !metadata.format ||
    (!supportedFormats.has(metadata.format) && !(allowFaviconFormats && metadata.format === "svg"))
  ) {
    throw new BadRequestException("Choose a PNG, JPEG, WebP, or GIF image");
  }
  if (!metadata.width || !metadata.height) {
    throw new BadRequestException("Choose a valid image");
  }
  if (metadata.width > imageAssetMaxDimension || metadata.height > imageAssetMaxDimension) {
    throw new BadRequestException(
      `Image dimensions must not exceed ${imageAssetMaxDimension} × ${imageAssetMaxDimension} pixels`
    );
  }

  try {
    return await sharp(decoded, {
      density: allowFaviconFormats ? 256 : 72,
      failOn: "warning",
      limitInputPixels: imageAssetMaxDimension * imageAssetMaxDimension,
      sequentialRead: true,
    })
      .rotate()
      .resize(dimension, dimension, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9, palette: true, quality: 90 })
      .toBuffer();
  } catch {
    throw new BadRequestException("Choose a valid image");
  }
}

async function decodeIcoImage(input: Buffer): Promise<Buffer> {
  if (!isIco(input)) return input;
  if (input.length < 6) throw new BadRequestException("Choose a valid image");
  const imageCount = input.readUInt16LE(4);
  if (imageCount < 1 || imageCount > maximumIcoImages || input.length < 6 + imageCount * 16) {
    throw new BadRequestException("Choose a valid image");
  }
  try {
    const images = await decodeIco(input, "image/png");
    const image = images.toSorted(
      (left, right) => right.width * right.height - left.width * left.height
    )[0];
    if (!image) throw new Error("ICO contains no images");
    return Buffer.from(image.buffer);
  } catch {
    throw new BadRequestException("Choose a valid image");
  }
}
