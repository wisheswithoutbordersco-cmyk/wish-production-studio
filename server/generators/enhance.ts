/**
 * Enhance Tools
 * Image enhancement: upscale, restyle, and reimagine.
 * Uses the built-in image generation API with originalImages for editing.
 */
import { generateImage } from "../_core/imageGeneration";
import { storagePut } from "../storage";
import { fetchImageBuffer } from "../pdfAssembly";

export interface UpscaleOptions {
  imageUrl: string;
}

export interface RestyleOptions {
  imageUrl: string;
  style: string;
}

export interface ReimagineOptions {
  imageUrl: string;
  prompt: string;
}

/**
 * Upscale an image to higher resolution.
 * Uses the image generation API with an enhancement prompt.
 */
export async function enhanceUpscale(options: UpscaleOptions): Promise<{ imageUrl: string }> {
  const result = await generateImage({
    prompt: "enhance this image to higher resolution, sharper details, improved clarity, same composition and content exactly preserved",
    originalImages: [{ url: options.imageUrl, mimeType: "image/png" }],
  });
  if (!result.url) throw new Error("Upscale failed");

  // Store the result
  const buffer = await fetchImageBuffer(result.url);
  const { url } = await storagePut(
    `products/enhance/upscaled-${Date.now()}.png`,
    buffer,
    "image/png"
  );
  return { imageUrl: url };
}

/**
 * Restyle an image with a new art style.
 */
export async function enhanceRestyle(options: RestyleOptions): Promise<{ imageUrl: string }> {
  const result = await generateImage({
    prompt: `recreate this image in ${options.style} art style, maintaining the same subject and composition but transforming the visual style completely to ${options.style}`,
    originalImages: [{ url: options.imageUrl, mimeType: "image/png" }],
  });
  if (!result.url) throw new Error("Restyle failed");

  const buffer = await fetchImageBuffer(result.url);
  const { url } = await storagePut(
    `products/enhance/restyled-${options.style.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.png`,
    buffer,
    "image/png"
  );
  return { imageUrl: url };
}

/**
 * Reimagine an image with a custom prompt.
 */
export async function enhanceReimagine(options: ReimagineOptions): Promise<{ imageUrl: string }> {
  const result = await generateImage({
    prompt: options.prompt,
    originalImages: [{ url: options.imageUrl, mimeType: "image/png" }],
  });
  if (!result.url) throw new Error("Reimagine failed");

  const buffer = await fetchImageBuffer(result.url);
  const { url } = await storagePut(
    `products/enhance/reimagined-${Date.now()}.png`,
    buffer,
    "image/png"
  );
  return { imageUrl: url };
}
