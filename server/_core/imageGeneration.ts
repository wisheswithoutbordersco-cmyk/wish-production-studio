/**
 * Image generation helper using fal.ai's FLUX Pro endpoint.
 *
 * Text-to-image page illustrations use the official fal.ai client and return
 * one 1024x1024 PNG. Existing source-image workflows retain their dedicated
 * image-input request path so enhancement tools keep their current behavior.
 */
import { fal } from "@fal-ai/client";
import { ENV } from "./env";

export type GenerateImageOptions = {
  prompt: string;
  aspectRatio?: string;
  originalImages?: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
  }>;
};

export type GenerateImageResponse = {
  url?: string;
};

const FAL_TEXT_TO_IMAGE_MODEL = "fal-ai/flux-pro/v1.1";
const FAL_SOURCE_IMAGE_ENDPOINT = "https://fal.run/fal-ai/flux-pro/v1.1-ultra";
const IMAGE_SIZE = { width: 1024, height: 1024 } as const;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 15_000;
const PRINT_QUALITY_SUFFIX =
  "ultra detailed, professional quality, print-ready, high resolution, masterful composition";

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

const parseRetryAfter = (value: string | null): number | undefined => {
  if (!value) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

  const retryAt = Date.parse(value);
  return Number.isNaN(retryAt)
    ? undefined
    : Math.max(0, retryAt - Date.now());
};

const computeBackoffDelay = (
  attempt: number,
  retryAfterMs?: number,
): number => {
  const exponentialDelay = Math.min(
    BASE_RETRY_DELAY_MS * 2 ** attempt,
    MAX_RETRY_DELAY_MS,
  );
  const jitteredDelay =
    exponentialDelay / 2 + Math.random() * (exponentialDelay / 2);

  return Math.min(
    Math.max(jitteredDelay, retryAfterMs ?? 0),
    MAX_RETRY_DELAY_MS,
  );
};

function getSourceImageUrl(options: GenerateImageOptions): string | undefined {
  const sourceImage = options.originalImages?.[0];
  if (!sourceImage) return undefined;
  if (sourceImage.url) return sourceImage.url;
  if (!sourceImage.b64Json) return undefined;

  return `data:${sourceImage.mimeType ?? "image/png"};base64,${sourceImage.b64Json}`;
}

async function generateTextToImage(prompt: string): Promise<GenerateImageResponse> {
  fal.config({ credentials: ENV.falKey });

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await fal.subscribe(FAL_TEXT_TO_IMAGE_MODEL, {
        input: {
          prompt,
          image_size: IMAGE_SIZE,
          num_images: 1,
          output_format: "png",
        },
      });
      const url = result.data.images?.[0]?.url;

      if (!url) {
        throw new Error("Image generation succeeded but returned no image URL");
      }

      return { url };
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RETRIES) throw error;

      console.warn(
        `Image generation retry ${attempt + 1}/${MAX_RETRIES} after fal.ai client error`,
      );
      await sleep(computeBackoffDelay(attempt));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Image generation failed after exhausting retries");
}

async function generateFromSourceImage(
  prompt: string,
  imageUrl: string,
  aspectRatio?: string,
): Promise<GenerateImageResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(FAL_SOURCE_IMAGE_ENDPOINT, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          Authorization: `Key ${ENV.falKey}`,
        },
        body: JSON.stringify({
          prompt,
          num_images: 1,
          aspect_ratio: aspectRatio || "1:1",
          output_format: "png",
          enhance_prompt: true,
          raw: false,
          image_url: imageUrl,
          image_prompt_strength: 0.85,
        }),
      });

      if (response.ok) {
        const result = (await response.json()) as {
          images?: Array<{
            url?: string;
            content_type?: string;
          }>;
        };
        const url = result.images?.[0]?.url;

        if (!url) {
          throw new Error("Image generation succeeded but returned no image URL");
        }

        return { url };
      }

      if (attempt === MAX_RETRIES) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `Image generation request failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`,
        );
      }

      const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
      try {
        await response.body?.cancel();
      } catch {
        // The response body may already be settled.
      }

      console.warn(
        `Image generation retry ${attempt + 1}/${MAX_RETRIES} after status ${response.status}`,
      );
      await sleep(computeBackoffDelay(attempt, retryAfterMs));
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RETRIES) throw error;

      console.warn(
        `Image generation retry ${attempt + 1}/${MAX_RETRIES} after network error`,
      );
      await sleep(computeBackoffDelay(attempt));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Image generation failed after exhausting retries");
}

export async function generateImage(
  options: GenerateImageOptions,
): Promise<GenerateImageResponse> {
  if (!ENV.falKey) {
    throw new Error("FAL_KEY is not configured");
  }

  const prompt = `${options.prompt.trim()}\n\nQuality requirements: ${PRINT_QUALITY_SUFFIX}.`;
  const sourceImageUrl = getSourceImageUrl(options);

  return sourceImageUrl
    ? generateFromSourceImage(prompt, sourceImageUrl, options.aspectRatio)
    : generateTextToImage(prompt);
}
