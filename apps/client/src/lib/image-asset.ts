import {
  imageAssetMaxBytes,
  imageAssetMaxDimension,
  imageAssetMimeTypes,
} from "@mimorii/contracts";

export const imageAssetAccept = imageAssetMimeTypes.join(",");
const imageAssetMaxMegabytes = imageAssetMaxBytes / (1024 * 1024);
export const imageAssetRequirements = `PNG, JPEG, WebP, or GIF · up to ${imageAssetMaxMegabytes} MB · max ${imageAssetMaxDimension} × ${imageAssetMaxDimension} px`;

export async function validateImageAsset(file: File): Promise<void> {
  if (!imageAssetMimeTypes.some((type) => type === file.type)) {
    throw new Error("Choose a PNG, JPEG, WebP, or GIF image");
  }
  if (file.size > imageAssetMaxBytes) {
    throw new Error(`Choose an image that is ${imageAssetMaxMegabytes} MB or smaller`);
  }

  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw new Error("Choose a valid PNG, JPEG, WebP, or GIF image");
  }

  try {
    if (image.width > imageAssetMaxDimension || image.height > imageAssetMaxDimension) {
      throw new Error(
        `Choose an image no larger than ${imageAssetMaxDimension} × ${imageAssetMaxDimension} px`
      );
    }
  } finally {
    image.close();
  }
}
