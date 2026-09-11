import { encodeIco } from "icojs";
import sharp from "sharp";

export const faviconFormats = ["png", "jpeg", "webp", "gif", "ico", "svg", "avif"] as const;

export async function createFavicon(format: (typeof faviconFormats)[number]): Promise<Buffer> {
  if (format === "svg") {
    return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
      <!-- Website icon -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048">
        <rect x="256" y="256" width="1536" height="1536" fill="#2878dc"/>
      </svg>`);
  }
  const image = sharp({
    create: {
      width: 48,
      height: 48,
      channels: 4,
      background: { r: 40, g: 120, b: 220, alpha: 1 },
    },
  });
  if (format === "ico") {
    return Buffer.from(await encodeIco([{ buffer: await image.png().toBuffer() }]));
  }
  return image.toFormat(format).toBuffer();
}
