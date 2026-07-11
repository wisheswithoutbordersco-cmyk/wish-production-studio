/**
 * Enhance Tools
 * Image enhancement: upscale, restyle, and reimagine.
 * Uses GPT-5 Image Mini via OpenRouter chat completions with image input.
 */
import { ENV } from "../_core/env";
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
 * Fetch an image (relative or absolute URL) and return as base64 data URL.
 */
async function fetchImageAsDataUrl(imageUrl: string): Promise<string> {
  const buffer = await fetchImageBuffer(imageUrl);
  const b64 = buffer.toString("base64");
  const mimeType = detectMimeType(imageUrl);
  return `data:${mimeType};base64,${b64}`;
}

interface OpenRouterImageResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type: string; text?: string }>;
      images?: Array<{ image_url: { url: string } }>;
    };
  }>;
}

/**
 * Edit an image using GPT-5 Image Mini via OpenRouter chat completions.
 * Sends the image as a data URL in the message content and asks the model to modify it.
 */
async function editImageViaOpenRouter(imageDataUrl: string, editPrompt: string): Promise<Buffer> {
  const MAX_RETRIES = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ENV.openRouterApiKey}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-5-image-mini",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url: imageDataUrl },
                },
                {
                  type: "text",
                  text: editPrompt,
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Image edit failed (${response.status}): ${detail}`);
      }

      const result = (await response.json()) as OpenRouterImageResponse;
      const images = result.choices?.[0]?.message?.images;
      if (!images || images.length === 0) {
        throw new Error("No image returned from edit request");
      }

      const imgUrl = images[0].image_url.url;
      // The response is a base64 data URL
      const b64Match = imgUrl.match(/^data:[^;]+;base64,(.+)$/);
      if (b64Match) {
        return Buffer.from(b64Match[1], "base64");
      }

      // If it's a regular URL, fetch it
      const imgResponse = await fetch(imgUrl);
      if (!imgResponse.ok) throw new Error(`Failed to fetch edited image: ${imgResponse.status}`);
      return Buffer.from(await imgResponse.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RETRIES) break;
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`Image edit attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`);
      await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Image edit failed after retries");
}

/**
 * Upscale an image to higher resolution.
 */
export async function enhanceUpscale(options: UpscaleOptions): Promise<{ imageUrl: string }> {
  const imageDataUrl = await fetchImageAsDataUrl(options.imageUrl);
  const prompt = options.customPrompt?.trim() ||
    "Enhance this image to higher resolution with sharper details, improved clarity, and better quality. Preserve the exact same composition, content, and style.";

  const buffer = await editImageViaOpenRouter(imageDataUrl, prompt);
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
  const imageDataUrl = await fetchImageAsDataUrl(options.imageUrl);
  const prompt = options.customPrompt?.trim() ||
    `Recreate this image in ${options.style} art style. Maintain the same subject and composition but transform the visual style completely to ${options.style}.`;

  const buffer = await editImageViaOpenRouter(imageDataUrl, prompt);
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
  const imageDataUrl = await fetchImageAsDataUrl(options.imageUrl);
  const prompt = options.customPrompt?.trim() || options.prompt;

  const buffer = await editImageViaOpenRouter(imageDataUrl, prompt);
  const { url } = await storagePut(
    `products/enhance/reimagined-${Date.now()}.png`,
    buffer,
    "image/png"
  );
  return { imageUrl: url };
}
