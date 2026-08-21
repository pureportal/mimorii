import { imageAssetMaxBytes, imageAssetMaxDimension } from "@mimorii/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateImageAsset } from "./image-asset";

describe("image asset validation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accepts a supported image within the size and dimension limits", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.resolve({ width: 1200, height: 800, close }))
    );

    await expect(
      validateImageAsset(new File(["image"], "logo.png", { type: "image/png" }))
    ).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects unsupported file types", async () => {
    await expect(
      validateImageAsset(new File(["image"], "logo.svg", { type: "image/svg+xml" }))
    ).rejects.toThrow("Choose a PNG, JPEG, WebP, or GIF image");
  });

  it("rejects corrupt files with a supported type", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.reject(new Error("decode failed")))
    );

    await expect(
      validateImageAsset(new File(["not an image"], "logo.png", { type: "image/png" }))
    ).rejects.toThrow("Choose a valid PNG, JPEG, WebP, or GIF image");
  });

  it("rejects files above the backend upload limit", async () => {
    const file = new File([new Uint8Array(imageAssetMaxBytes + 1)], "large.png", {
      type: "image/png",
    });
    await expect(validateImageAsset(file)).rejects.toThrow(
      "Choose an image that is 5 MB or smaller"
    );
  });

  it("rejects images above the backend dimension limit", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() =>
        Promise.resolve({
          width: imageAssetMaxDimension + 1,
          height: 100,
          close,
        })
      )
    );

    await expect(
      validateImageAsset(new File(["image"], "wide.webp", { type: "image/webp" }))
    ).rejects.toThrow(
      `Choose an image no larger than ${imageAssetMaxDimension} × ${imageAssetMaxDimension} px`
    );
    expect(close).toHaveBeenCalledOnce();
  });
});
