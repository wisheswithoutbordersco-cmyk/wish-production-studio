import sharp from "sharp";
import { ENV } from "../_core/env";
import { generateImage } from "../_core/imageGeneration";
import { invokeLLM } from "../_core/llm";
import {
  addPageResult,
  createJob,
  getJob,
  updateJob,
  type GenerationJob,
  type PageResult,
} from "../jobs";
import { storagePut } from "../storage";
import {
  SCRIPTORIUM_SYSTEM_PROMPT,
  buildScriptoriumFallbackPrompt,
  buildScriptoriumImageRequest,
  buildScriptoriumUserPrompt,
} from "./scriptoriumPolicy";
import { finalizePdf } from "./shared";

const PAGES_PER_CHUNK = 1;
const PAGE_WIDTH = 2550;
const PAGE_HEIGHT = 3300;
const MAX_PAGE_COUNT = 30;
const IMAGE_GENERATION_ATTEMPTS = 3;

const COLORING_NEGATIVE_PROMPT =
  "no text, no words, no letters, no numbers, no writing, no captions, no labels, no watermark, no signature, no blur, no distortion, no artifacts";

// ─── Types ───────────────────────────────────────────────────────────────────

type PageType = "coloring-page" | "text-heavy";

interface PageComposition {
  pageType: PageType;
  imagePrompt: string;
}

export interface QuickCreateOptions {
  prompt?: string;
  customPrompt?: string;
  pageCount: number;
}

interface NormalizedOptions {
  prompt: string;
  pageCount: number;
}

interface ImageApiResponse {
  data?: Array<{
    b64_json?: string;
  }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeOptions(options: QuickCreateOptions): NormalizedOptions {
  const prompt = (options.prompt || options.customPrompt || "").trim();
  const pageCount = Number(options.pageCount);

  if (!prompt) throw new Error("Prompt is required");
  if (
    !Number.isInteger(pageCount) ||
    pageCount < 1 ||
    pageCount > MAX_PAGE_COUNT
  ) {
    throw new Error(`Page count must be between 1 and ${MAX_PAGE_COUNT}`);
  }

  return {
    prompt: prompt.slice(0, 2000),
    pageCount,
  };
}

function extractLlmText(result: Awaited<ReturnType<typeof invokeLLM>>): string {
  const content = result.choices[0]?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map(part =>
      part.type === "text" && typeof part.text === "string" ? part.text : ""
    )
    .join("")
    .trim();
}

function isColoringRequest(prompt: string): boolean {
  return /\b(?:coloring|colouring|line art|colour-in|color-in|coloring book|coloring page)\b/i.test(
    prompt
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

// ─── Composition Prompt Generation (LLM) ─────────────────────────────────────

async function generatePageComposition(
  options: NormalizedOptions,
  pageIndex: number,
  totalPages: number
): Promise<PageComposition> {
  if (isColoringRequest(options.prompt)) {
    return {
      pageType: "coloring-page",
      imagePrompt: `Create a black-and-white line-art coloring page based exactly on this request: ${options.prompt}. Infer the intended audience, maturity, complexity, detail, and visual sophistication solely from the user's words. Use thick, clean, crisp outlines, no shading, no color, and no background clutter. Center the unique scene on the page with strong contrast and professional vector-like edges. This is page ${pageIndex + 1} of ${totalPages}.`,
    };
  }

  const systemPrompt = SCRIPTORIUM_SYSTEM_PROMPT;
  const userPrompt = buildScriptoriumUserPrompt({
    prompt: options.prompt,
    pageIndex,
    totalPages,
  });

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "page_composition_prompt",
          strict: true,
          schema: {
            type: "object",
            properties: {
              imagePrompt: { type: "string" },
            },
            required: ["imagePrompt"],
            additionalProperties: false,
          },
        },
      },
    });

    const parsed = JSON.parse(extractLlmText(result)) as {
      imagePrompt?: unknown;
    };
    const imagePrompt =
      typeof parsed.imagePrompt === "string" ? parsed.imagePrompt.trim() : "";

    if (!imagePrompt) {
      throw new Error("LLM returned an empty image composition prompt");
    }

    return {
      pageType: "text-heavy",
      imagePrompt,
    };
  } catch (error) {
    console.warn(
      `Composition prompt generation failed for page ${pageIndex + 1}, using fallback:`,
      error
    );
    return buildFallbackComposition(options, pageIndex, totalPages);
  }
}

function buildFallbackComposition(
  options: NormalizedOptions,
  pageIndex: number,
  totalPages: number
): PageComposition {
  return {
    pageType: "text-heavy",
    imagePrompt: buildScriptoriumFallbackPrompt({
      prompt: options.prompt,
      pageIndex,
      totalPages,
    }),
  };
}

// ─── Image Generation ─────────────────────────────────────────────────────────

async function generateCompositionImage(prompt: string): Promise<Buffer> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= IMAGE_GENERATION_ATTEMPTS; attempt++) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/images", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ENV.openRouterApiKey}`,
        },
        body: JSON.stringify(buildScriptoriumImageRequest(prompt)),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `Image generation failed (${response.status}): ${detail}`
        );
      }

      const result = (await response.json()) as ImageApiResponse;
      const b64 = result.data?.[0]?.b64_json;
      if (!b64) throw new Error("No image data in response");

      return Buffer.from(b64, "base64");
    } catch (error) {
      lastError = error;
      if (attempt === IMAGE_GENERATION_ATTEMPTS) break;

      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `Composition image attempt ${attempt} of ${IMAGE_GENERATION_ATTEMPTS} failed: ${message}`
      );
      await wait(1000 * 2 ** (attempt - 1));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Image generation failed after 3 attempts");
}

async function generateColoringPage(imagePrompt: string): Promise<Buffer> {
  const coloringPrompt = `${imagePrompt}. Style requirements: pure black-and-white line art coloring page, thick clean outlines only, no shading, no gray tones, no color fills, no background textures, high-contrast black lines on a pure white background, exceptionally crisp vector-like edges, sharply defined subjects, premium professional coloring-book quality suitable for high-resolution printing. Negative requirements: ${COLORING_NEGATIVE_PROMPT}.`;

  let rawBuffer: Buffer;
  try {
    const { url } = await generateImage({
      prompt: coloringPrompt,
      aspectRatio: "3:4",
    });
    if (!url) throw new Error("fal.ai returned no coloring-page image URL");

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to download fal.ai coloring page (${response.status})`
      );
    }
    rawBuffer = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.warn(
      "fal.ai coloring-page generation failed; using the high-quality OpenRouter fallback:",
      error
    );
    rawBuffer = await generateCompositionImage(coloringPrompt);
  }

  // Post-process to ensure clean B&W output
  const cleaned = await sharp(rawBuffer)
    .flatten({ background: "#ffffff" })
    .grayscale()
    .threshold(128)
    .sharpen()
    .png()
    .toBuffer();

  // Resize to print dimensions
  return sharp(cleaned)
    .resize(PAGE_WIDTH, PAGE_HEIGHT, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function generateTextHeavyPage(imagePrompt: string): Promise<Buffer> {
  const rawBuffer = await generateCompositionImage(imagePrompt);

  return sharp(rawBuffer)
    .resize(PAGE_WIDTH, PAGE_HEIGHT, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// ─── Page Generation ─────────────────────────────────────────────────────────

async function generateQuickCreatePage(
  pageIndex: number,
  job: GenerationJob
): Promise<PageResult> {
  const options = job.options as unknown as NormalizedOptions;
  const pageNumber = pageIndex + 1;

  const composition = await generatePageComposition(
    options,
    pageIndex,
    job.totalPages
  );

  const finalBuffer =
    composition.pageType === "coloring-page"
      ? await generateColoringPage(composition.imagePrompt)
      : await generateTextHeavyPage(composition.imagePrompt);

  const { url: imageUrl } = await storagePut(
    `pages/quick-create/${job.id}/page-${String(pageNumber).padStart(3, "0")}.png`,
    finalBuffer,
    "image/png"
  );

  return {
    pageNumber,
    imageUrl,
    status: "success",
    metadata: { pageType: composition.pageType },
  };
}

// ─── Chunk Processing & Job Creation ─────────────────────────────────────────

async function processQuickCreateChunkInternal(
  job: GenerationJob
): Promise<void> {
  const startIndex = job.nextPageIndex;
  const endIndex = Math.min(startIndex + PAGES_PER_CHUNK, job.totalPages);

  updateJob(job.id, {
    status: "generating",
    statusMessage: `Generating page ${startIndex + 1} of ${job.totalPages}...`,
  });

  for (let pageIndex = startIndex; pageIndex < endIndex; pageIndex++) {
    try {
      const result = await generateQuickCreatePage(pageIndex, job);
      addPageResult(job.id, result);
      updateJob(job.id, {
        nextPageIndex: pageIndex + 1,
        statusMessage: `Generated page ${pageIndex + 1} of ${job.totalPages}`,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`Quick Create page ${pageIndex + 1} failed:`, errorMessage);
      addPageResult(job.id, {
        pageNumber: pageIndex + 1,
        imageUrl: "",
        status: "error",
        error: errorMessage,
      });
      updateJob(job.id, {
        nextPageIndex: pageIndex + 1,
        statusMessage: `Page ${pageIndex + 1} failed; continuing...`,
      });
    }
  }

  const updatedJob = getJob(job.id);
  if (updatedJob && updatedJob.nextPageIndex >= updatedJob.totalPages) {
    await finalizePdf(updatedJob);
  }
}

export function createQuickCreateJob(options: QuickCreateOptions): string {
  const normalizedOptions = normalizeOptions(options);
  const job = createJob(
    "quick-create",
    normalizedOptions.pageCount,
    normalizedOptions,
    `quick-create-${Date.now()}.pdf`
  );
  return job.id;
}

export async function processQuickCreateChunk(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");
  await processQuickCreateChunkInternal(job);
}
