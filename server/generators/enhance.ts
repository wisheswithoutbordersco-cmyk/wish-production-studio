/**
 * Enhance Tools
 * Image enhancement: upscale, restyle, and reimagine.
 * Uses the built-in image generation API with originalImages for editing.
 *
 * Key fix: uploaded images arrive as relative /manus-storage/ URLs.
 * The Forge API requires either an absolute URL or base64 data.
 * We fetch the image buffer first and pass it as b64Json to avoid URL resolution issues.
 */
import { generateImage } from "../_core/imageGeneration";
import { storagePut } from "../storage";
import { fetchImageBuffer } from "../pdfAssembly";

export interface UpscaleOptions {
  imageUrl: string;
  customPrompt?: string;
}

export interface RestyleOptions {
  imageUrl: string;
  customPrompt?: string;
  style: string;
}

export interface ReimagineOptions {
  imageUrl: string;
  customPrompt?: string;
  prompt: string;
}

/**
 * Detect MIME type from a URL string.
 */
function detectMimeType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".jpg") || lower.includes(".jpeg")) return "image/jpeg";
  if (lower.includes(".webp")) return "image/webp";
  if (lower.includes(".gif")) return "image/gif";
  return "image/png"; // default
}

/**
 * Fetch an image (relative or absolute URL) and return as base64 string + mimeType.
 * This resolves the relative /manus-storage/ URL issue when calling the Forge API.
 */
async function fetchImageAsBase64(imageUrl: string): Promise<{ b64Json: string; mimeType: string }> {
  const buffer = await fetchImageBuffer(imageUrl);
  const b64Json = buffer.toString("base64");
  const mimeType = detectMimeType(imageUrl);
  return { b64Json, mimeType };
}

/**
 * Upscale an image to higher resolution.
 */
export async function enhanceUpscale(options: UpscaleOptions): Promise<{ imageUrl: string }> {
  const { b64Json, mimeType } = await fetchImageAsBase64(options.imageUrl);
  const result = await generateImage({
    prompt: options.customPrompt?.trim() || "enhance this image to higher resolution, sharper details, improved clarity, same composition and content exactly preserved",
    originalImages: [{ b64Json, mimeType }],
  });
  if (!result.url) throw new Error("Upscale failed");

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
  const { b64Json, mimeType } = await fetchImageAsBase64(options.imageUrl);
  const result = await generateImage({
    prompt: options.customPrompt?.trim() || `recreate this image in ${options.style} art style, maintaining the same subject and composition but transforming the visual style completely to ${options.style}`,
    originalImages: [{ b64Json, mimeType }],
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
  const { b64Json, mimeType } = await fetchImageAsBase64(options.imageUrl);
  const result = await generateImage({
    prompt: options.customPrompt?.trim() || options.prompt,
    originalImages: [{ b64Json, mimeType }],
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
