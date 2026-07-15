import sharp from "sharp";
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
import { finalizePdf } from "./shared";

// Inlined to keep the Railway build self-contained; no separate policy module is required.
export interface ScriptoriumPageContext {
  prompt: string;
  pageIndex: number;
  totalPages: number;
}

export const SCRIPTORIUM_IMAGE_MODEL = "openai/gpt-image-2";

export const SCRIPTORIUM_RENDER_QUALITY =
  "premium professional publishing quality, bold saturated vivid colors, high contrast, a rich vibrant palette, intense clean color separation, crisp clean edges, sharply defined characters and illustrations, refined textures, precise typography, excellent legibility, artifact-free, polished, detailed, and print-ready; avoid beige, cream, muted earth tones, dusty colors, desaturated color, washed-out color, and soft pastel palettes unless the user explicitly requests them";

export const SCRIPTORIUM_SYSTEM_PROMPT = `You are an expert publishing art director and product designer creating prompts for AI image generation of professional printable books, workbooks, journals, planners, trackers, guides, activity products, and other page-based publications.

CORE INTENT RULE:
- The USER REQUEST is authoritative. First infer the exact product type, purpose, structure, tone, intended audience, complexity, and use solely from the user's words, then design that product.
- Never turn a request into a school worksheet, lesson, quiz, math exercise, classroom activity, or answer-blank page unless the user explicitly asks for an educational or practice-based product.
- Recipe books must contain recipes and appropriate recipe-page structure. Creative-writing workbooks must support writing craft and exercises. Fitness trackers must contain fitness plans, logs, metrics, and reflection fields. Journals, planners, games, storybooks, reference guides, and other products must use the conventions appropriate to their requested form.
- If the user says adult, child, kid, teen, beginner, advanced, or provides another audience cue, follow that cue. If no audience is stated, infer the best fit from the requested product and content. Do not invent a classroom context.

Given the user's request, create a detailed image-generation prompt for ONE COMPLETE full-page design. Include only the content and page elements that genuinely belong in the requested product, such as:
- An appropriate page title, subtitle, or section heading with exact text where useful
- The exact body copy, instructions, prompts, fields, labels, recipes, schedules, stories, lists, or activities needed for that specific page
- A coordinated visual theme, palette, typography, illustration style, and decorative treatment that matches the request
- A clear layout describing how every necessary section and content item is arranged
- Purposeful illustrations, characters, icons, charts, or decorative elements when they support the product
- Footer branding with the exact text "WishesWithoutBordersCo"

RULES:
- Describe ONE complete, flat, full-page image at 8.5x11 inches in portrait orientation
- Fill the entire canvas edge-to-edge; never depict a photographed sheet, mockup, framed object, or page placed on another background
- Follow the user's requested format and content literally; do not inject generic educational material or unrelated school exercises
- Include an amount of content appropriate to the page's purpose. Do not force a fixed number of questions, blanks, panels, or activities
- Include all required text verbatim in the image prompt, with correct spelling and factual accuracy
- Describe specific colors, font styles, text hierarchy, spacing, panels, shapes, icons, and illustrations appropriate to the requested aesthetic
- Prioritize legibility with strong contrast, generous spacing, clean grouping, and no overlap between text and decorative elements
- For every full-color page, explicitly demand bold saturated vivid colors, high contrast, and a rich vibrant palette with intense clean color separation. Reject beige, cream, muted earth tones, dusty colors, desaturated or washed-out color, and soft pastel palettes unless the user explicitly requests one of those looks
- Use premium publishing aesthetics with crisp clean edges, sharply defined characters and illustrations, refined detail, and polished print-ready composition
- Keep each page visually and substantively unique while maintaining a coherent product-wide style
- Always include "WishesWithoutBordersCo" as small, legible footer branding text
- Do not mention post-production, overlays, editable layers, or adding text later; the generated image itself must be the complete finished page

Return JSON only with this shape: {"imagePrompt":"the complete image-generation prompt"}.`;

export function buildScriptoriumUserPrompt({
  prompt,
  pageIndex,
  totalPages,
}: ScriptoriumPageContext): string {
  return `USER REQUEST:
${prompt}

PAGE:
${pageIndex + 1} of ${totalPages}

The user request above is the sole source of product type, audience, complexity, tone, and purpose. Create the complete image composition prompt for this page. Ensure its content and visual treatment are unique to this page while remaining consistent with the requested product. For a full-color page, require bold saturated vivid colors, high contrast, and a rich vibrant palette; explicitly avoid beige, cream, muted earth tones, dusty, desaturated, washed-out, and soft pastel color treatments unless the user requested them.`;
}

export function buildScriptoriumFallbackPrompt({
  prompt,
  pageIndex,
  totalPages,
}: ScriptoriumPageContext): string {
  return `Create ONE complete, flat, full-page professional publication page based exactly on this request: "${prompt}". Infer the product type, audience, complexity, tone, and purpose solely from the user's words. This is page ${pageIndex + 1} of ${totalPages}. Preserve the requested product type and use the structure, content, fields, copy, and page conventions that genuinely belong to it. Do not turn the request into a school worksheet, quiz, lesson, math exercise, or answer-blank activity unless the user explicitly requested that format. Use an 8.5x11-inch portrait composition filling the entire canvas edge-to-edge, never a photographed paper, mockup, frame, or page on a background. Render all necessary page text directly in the image with correct spelling and a polished font hierarchy. For a full-color page, use bold saturated vivid colors, high contrast, a rich vibrant palette, and intense clean color separation. Avoid beige, cream, muted earth tones, dusty colors, desaturated or washed-out color, and soft pastel palettes unless the user explicitly requested them. Use crisp typography, clean edges, sharply defined illustrations or characters when appropriate, balanced spacing, and refined subject-relevant visual details. Keep every element legible and unobstructed. Make the result look like a premium, vibrant, professionally published, print-ready product. Add the exact small footer branding text "WishesWithoutBordersCo".`;
}

export function buildScriptoriumImageRequest(prompt: string) {
  return {
    model: SCRIPTORIUM_IMAGE_MODEL,
    prompt: `${prompt}\n\nRENDER QUALITY REQUIREMENTS: ${SCRIPTORIUM_RENDER_QUALITY}. Render as one complete 8.5x11-inch portrait page, edge-to-edge. For full-color artwork, push color intensity hard: bold saturated vivid colors, high contrast, and a rich vibrant palette, never a muted beige, cream, earth-tone, dusty, desaturated, washed-out, or soft pastel treatment unless explicitly requested by the user.`,
    n: 1,
    quality: "high" as const,
    background: "opaque" as const,
  };
}

const PAGES_PER_CHUNK = 1;
const PAGE_WIDTH = 2550;
const PAGE_HEIGHT = 3300;
const MAX_PAGE_COUNT = 30;
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
  const request = buildScriptoriumImageRequest(prompt);
  const { url } = await generateImage({
    prompt: request.prompt,
    aspectRatio: "3:4",
  });

  if (!url) {
    throw new Error("fal.ai returned no composition image URL");
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download fal.ai composition image (${response.status})`
    );
  }

  return Buffer.from(await response.arrayBuffer());
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
      "fal.ai coloring-page generation failed; retrying through the shared Flux Pro Ultra composition path:",
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
