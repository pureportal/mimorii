import {
  sponsorImageMaxBytes,
  sponsorImageMaxDimension,
  sponsorImageMimeTypes,
} from "@mimorii/contracts";

export const sponsorImageAccept = sponsorImageMimeTypes.join(",");
const sponsorImageMaxMegabytes = sponsorImageMaxBytes / (1024 * 1024);
export const sponsorImageRequirements = `PNG, JPEG, WebP, or GIF · up to ${sponsorImageMaxMegabytes} MB · max ${sponsorImageMaxDimension} × ${sponsorImageMaxDimension} px`;

export async function validateSponsorImage(file: File): Promise<void> {
  if (!sponsorImageMimeTypes.some((type) => type === file.type)) {
    throw new Error("Choose a PNG, JPEG, WebP, or GIF image");
  }
  if (file.size > sponsorImageMaxBytes) {
    throw new Error(`Choose an image that is ${sponsorImageMaxMegabytes} MB or smaller`);
  }

  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw new Error("Choose a valid PNG, JPEG, WebP, or GIF image");
  }

  try {
    if (image.width > sponsorImageMaxDimension || image.height > sponsorImageMaxDimension) {
      throw new Error(
        `Choose an image no larger than ${sponsorImageMaxDimension} × ${sponsorImageMaxDimension} px`
      );
    }
  } finally {
    image.close();
  }
}
