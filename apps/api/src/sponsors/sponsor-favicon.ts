import { sponsorImageMaxDimension, sponsorImageMimeTypes } from "@mimorii/contracts";
import { BadRequestException } from "@nestjs/common";
import sharp, { type Metadata } from "sharp";

const faviconSize = 64;
const supportedFormats = new Set(sponsorImageMimeTypes.map((type) => type.replace("image/", "")));

export async function optimizeSponsorFavicon(input: Buffer): Promise<Buffer> {
  if (input.length === 0) throw new BadRequestException("Choose a valid sponsor image");

  let metadata: Metadata;

  try {
    metadata = await sharp(input, {
      failOn: "warning",
      limitInputPixels: false,
      sequentialRead: true,
    }).metadata();
  } catch {
    throw new BadRequestException("Choose a valid sponsor image");
  }

  if (!metadata.format || !supportedFormats.has(metadata.format)) {
    throw new BadRequestException("Choose a PNG, JPEG, WebP, or GIF image");
  }
  if (!metadata.width || !metadata.height) {
    throw new BadRequestException("Choose a valid sponsor image");
  }
  if (metadata.width > sponsorImageMaxDimension || metadata.height > sponsorImageMaxDimension) {
    throw new BadRequestException(
      `Image dimensions must not exceed ${sponsorImageMaxDimension} × ${sponsorImageMaxDimension} pixels`
    );
  }

  try {
    return await sharp(input, {
      failOn: "warning",
      limitInputPixels: sponsorImageMaxDimension * sponsorImageMaxDimension,
      sequentialRead: true,
    })
      .rotate()
      .resize(faviconSize, faviconSize, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();
  } catch {
    throw new BadRequestException("Choose a valid sponsor image");
  }
}
