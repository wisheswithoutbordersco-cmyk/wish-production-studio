import sharp from "sharp";
import { ENV } from "../_core/env";
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
import { finalizePdf, generatePageImage } from "./shared";

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
  gradeLevel: string;
}

interface NormalizedOptions {
  prompt: string;
  pageCount: number;
  gradeLevel: string;
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
  const gradeLevel = String(options.gradeLevel || "").trim();

  if (!prompt) throw new Error("Prompt is required");
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > MAX_PAGE_COUNT) {
    throw new Error(`Page count must be between 1 and ${MAX_PAGE_COUNT}`);
  }
  if (!gradeLevel) throw new Error("Grade level is required");

  return {
    prompt: prompt.slice(0, 2000),
    pageCount,
    gradeLevel: gradeLevel.slice(0, 100),
  };
}

function extractLlmText(result: Awaited<ReturnType<typeof invokeLLM>>): string {
  const content = result.choices[0]?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part.type === "text" && typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function isColoringRequest(prompt: string): boolean {
  return /\b(?:coloring|colouring|line art|colour-in|color-in|coloring book|coloring page)\b/i.test(prompt);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
      imagePrompt: `Simple black-and-white line art coloring page illustration based on: ${options.prompt}. Thick clean outlines, no shading, no color, no background clutter. Kid-friendly for ${options.gradeLevel}. Centered on the page, high contrast, printable, vector-like. Page ${pageIndex + 1} of ${totalPages} with a unique scene.`,
    };
  }

  const systemPrompt = `You are an expert graphic designer creating prompts for AI image generation of professional printable educational products.

Given a user's request, create a detailed image generation prompt that describes a COMPLETE full-page design including:
- Page title and subtitle with the exact text to render
- All content text, including questions, answers, instructions, activities, labels, and answer blanks, with exact wording
- Visual theme, including a coordinated color palette, illustration style, and decorative elements
- Layout structure describing exactly how every section and content item is arranged on the page
- Decorative illustrations and icons relevant to the subject and audience
- Footer branding with the exact text "WishesWithoutBordersCo"

RULES:
- The prompt must describe ONE complete, flat, full-page image at 8.5x11 inches in portrait orientation
- The image must fill the entire canvas edge-to-edge and must not look like a photographed sheet, mockup, framed object, or page placed on a background
- ALL text must be included verbatim in the prompt, spelled correctly, factually accurate, and age-appropriate for the stated grade level
- Include 5-8 substantive content items per page, such as questions, activities, prompts, facts, matching items, or game elements
- Describe specific colors, font styles, text hierarchy, spacing, panels, shapes, icons, and illustrations
- Prioritize legibility: strong contrast, generous spacing, clean grouping, and no overlapping text or decorative elements
- The finished design should look like a professional Canva template: colorful, layered, polished, balanced, and print-ready, with integrated typography and themed illustrations
- Make this page visually and substantively unique when the product contains multiple pages
- Always include "WishesWithoutBordersCo" as small, legible footer branding text
- Do not mention post-production, overlays, editable layers, or adding text later; the generated image itself must be the complete finished page

Return JSON only with this shape: {"imagePrompt":"the complete image-generation prompt"}.`;

  const userPrompt = `USER REQUEST:
${options.prompt}

GRADE LEVEL:
${options.gradeLevel}

PAGE:
${pageIndex + 1} of ${totalPages}

Create the complete image composition prompt for this page. Ensure its content and visual treatment are unique to this page while remaining consistent with the requested product.`;

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

    const parsed = JSON.parse(extractLlmText(result)) as { imagePrompt?: unknown };
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
    imagePrompt: `Create ONE complete, flat, full-page professional printable based on this request: "${options.prompt}". Audience: ${options.gradeLevel}. This is page ${pageIndex + 1} of ${totalPages}. Use an 8.5x11-inch portrait composition filling the entire canvas edge-to-edge, never a photographed paper, mockup, frame, or page on a background. Include a clear title and subtitle with correctly spelled exact wording, concise instructions, and 5-8 substantive age-appropriate content items with all questions, activities, labels, answer choices, and answer blanks rendered directly in the image. Use a cohesive colorful palette, polished font hierarchy, high-contrast readable typography, layered panels and shapes, balanced spacing, subject-relevant icons, and charming themed illustrations. Keep all text unobstructed and prevent decorative elements from overlapping the content. Make the page look like a premium professional Canva template and a finished print-ready educational product. Add the exact small footer branding text "WishesWithoutBordersCo".`,
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
        body: JSON.stringify({
          model: "openai/gpt-5-image-mini",
          prompt,
          aspect_ratio: "3:4",
          quality: "high",
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Image generation failed (${response.status}): ${detail}`);
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

async function generateColoringPage(prompt: string): Promise<Buffer> {
  const fullPrompt = `${prompt}\n\nNegative prompt: ${COLORING_NEGATIVE_PROMPT}`;
  const { buffer } = await generatePageImage(fullPrompt, {
    aspectRatio: "3:4",
    raw: true,
  });

  const cleaned = await sharp(buffer)
    .rotate()
    .flatten({ background: "#ffffff" })
    .grayscale()
    .threshold(128)
    .sharpen()
    .median(2)
    .png()
    .toBuffer();

  const metadata = await sharp(cleaned).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Image dimensions unavailable");
  }

  const scale = Math.min(PAGE_WIDTH / metadata.width, PAGE_HEIGHT / metadata.height);
  const width = Math.round(metadata.width * scale);
  const height = Math.round(metadata.height * scale);
  const left = Math.floor((PAGE_WIDTH - width) / 2);
  const top = Math.floor((PAGE_HEIGHT - height) / 2);

  return sharp(cleaned)
    .resize(width, height, { fit: "fill", kernel: sharp.kernel.nearest })
    .extend({
      top,
      bottom: PAGE_HEIGHT - height - top,
      left,
      right: PAGE_WIDTH - width - left,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
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

async function processQuickCreateChunkInternal(job: GenerationJob): Promise<void> {
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
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
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
