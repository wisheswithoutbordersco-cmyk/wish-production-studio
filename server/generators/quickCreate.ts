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
import {
  buildQuickCreateTextOverlaySvg,
  type QuickCreatePageCopy,
} from "./quickCreateTextOverlay";

// Inlined to keep the Railway build self-contained; no separate policy module is required.
export interface ScriptoriumPageContext {
  prompt: string;
  pageIndex: number;
  totalPages: number;
}

export const SCRIPTORIUM_IMAGE_MODEL = "fal-ai/flux-pro/v1.1-ultra";

export const SCRIPTORIUM_RENDER_QUALITY =
  "premium professional publishing quality, bold saturated vivid colors, high contrast, a rich vibrant palette, intense clean color separation, crisp clean edges, sharply defined characters and illustrations, refined textures, precise typography, excellent legibility, artifact-free, polished, detailed, and print-ready; avoid beige, cream, muted earth tones, dusty colors, desaturated color, washed-out color, and soft pastel palettes unless the user explicitly requests them";

export const SCRIPTORIUM_SYSTEM_PROMPT = `You are an expert publishing content editor and art director for professional printable books, workbooks, journals, planners, trackers, guides, activity products, and other page-based publications.

The USER REQUEST is authoritative. Infer the product type, purpose, structure, tone, audience, complexity, and use solely from the user's words. Never turn a request into a school worksheet, lesson, quiz, math exercise, classroom activity, or answer-blank page unless the user explicitly requests that format.

Create the exact visible copy and a coordinated artwork brief for ONE complete 8.5x11-inch portrait page. The visible copy will be typeset deterministically after the artwork is generated, so spelling, facts, labels, and sentences must be publication-ready.

CONTENT RULES:
- Write a concise page title and optional subtitle.
- Provide between 1 and 10 content sections appropriate to the requested product. Each section needs a short heading and accurate body copy.
- Keep section headings under 7 words and body copy concise enough to fit a printable page.
- For fact or reference requests, supply real, accurate information rather than placeholders.
- For multi-page products, make this page substantively unique while preserving a coherent product-wide style.
- Put any user-requested exact footer phrase in footerNote. Do not include WishesWithoutBordersCo there; branding is added automatically.

ARTWORK RULES:
- artPrompt describes ONLY the edge-to-edge background artwork, illustrations, palette, decorations, and visual theme.
- artPrompt must explicitly request NO visible words, letters, numbers, captions, labels, logos, signatures, or watermarks.
- Keep the central page calm enough for dark translucent content panels, while retaining vivid subject-relevant illustrations around the edges and between panels.
- Demand bold saturated vivid colors, high contrast, rich vibrant color, crisp clean edges, sharply defined subjects, refined detail, and polished print-ready quality.
- Avoid beige, cream, muted earth tones, dusty, desaturated, washed-out, and soft pastel treatments unless the user explicitly requests them.
- Fill the canvas edge-to-edge; never depict a photographed sheet, mockup, frame, or page placed on another background.

Return strict JSON with title, subtitle, sections, footerNote, and artPrompt. All visible wording belongs in the text fields; artPrompt must contain no requested page copy.`;

export function buildScriptoriumUserPrompt({
  prompt,
  pageIndex,
  totalPages,
}: ScriptoriumPageContext): string {
  return `USER REQUEST:
${prompt}

PAGE:
${pageIndex + 1} of ${totalPages}

Create accurate, final visible copy for this page and a separate text-free Flux Pro Ultra artwork brief. Keep the copy concise enough for an 8.5x11-inch printable page. Preserve any exact title, wording, count, or footer phrase requested by the user.`;
}

export function buildScriptoriumFallbackPrompt({
  prompt,
  pageIndex,
  totalPages,
}: ScriptoriumPageContext): string {
  return `Create vivid, edge-to-edge background artwork for page ${pageIndex + 1} of ${totalPages}, based on this request: "${prompt}". Preserve the requested subject, audience, tone, and visual style. Use bold saturated vivid colors, high contrast, rich color separation, crisp clean edges, sharply defined subject-relevant illustrations, and premium print-ready detail. Keep the center calm enough for translucent text panels and place decorative artwork mainly around the edges and gaps. Do not render any visible words, letters, numbers, captions, labels, logos, signatures, or watermarks. Never depict a photographed paper, mockup, frame, or page on another background.`;
}

export function buildScriptoriumImageRequest(prompt: string) {
  return {
    model: SCRIPTORIUM_IMAGE_MODEL,
    prompt: `${prompt}\n\nRENDER QUALITY REQUIREMENTS: ${SCRIPTORIUM_RENDER_QUALITY}. Render as one complete 8.5x11-inch portrait background, edge-to-edge. Leave calm negative space beneath the intended translucent content panels. Do not render any visible words, letters, numbers, captions, labels, logos, signatures, or watermarks. For full-color artwork, push color intensity hard: bold saturated vivid colors, high contrast, and a rich vibrant palette, never a muted beige, cream, earth-tone, dusty, desaturated, washed-out, or soft pastel treatment unless explicitly requested by the user.`,
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
  copy?: QuickCreatePageCopy;
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
          name: "page_composition",
          strict: true,
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              subtitle: { type: "string" },
              sections: {
                type: "array",
                minItems: 1,
                maxItems: 10,
                items: {
                  type: "object",
                  properties: {
                    heading: { type: "string" },
                    body: { type: "string" },
                  },
                  required: ["heading", "body"],
                  additionalProperties: false,
                },
              },
              footerNote: { type: "string" },
              artPrompt: { type: "string" },
            },
            required: [
              "title",
              "subtitle",
              "sections",
              "footerNote",
              "artPrompt",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const parsed = JSON.parse(extractLlmText(result)) as {
      title?: unknown;
      subtitle?: unknown;
      sections?: unknown;
      footerNote?: unknown;
      artPrompt?: unknown;
    };
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const subtitle =
      typeof parsed.subtitle === "string" ? parsed.subtitle.trim() : "";
    const footerNote =
      typeof parsed.footerNote === "string" ? parsed.footerNote.trim() : "";
    const artPrompt =
      typeof parsed.artPrompt === "string" ? parsed.artPrompt.trim() : "";
    const sections = Array.isArray(parsed.sections)
      ? parsed.sections
          .map(section => {
            if (!section || typeof section !== "object") return undefined;
            const candidate = section as {
              heading?: unknown;
              body?: unknown;
            };
            const heading =
              typeof candidate.heading === "string"
                ? candidate.heading.trim()
                : "";
            const body =
              typeof candidate.body === "string" ? candidate.body.trim() : "";
            return heading || body ? { heading, body } : undefined;
          })
          .filter((section): section is { heading: string; body: string } =>
            Boolean(section)
          )
          .slice(0, 10)
      : [];

    if (!title || !artPrompt || sections.length === 0) {
      throw new Error("LLM returned incomplete structured page content");
    }

    console.info(
      `[Quick Create] Structured copy ready for page ${pageIndex + 1}: ${sections.length} sections; image model ${SCRIPTORIUM_IMAGE_MODEL}; deterministic SVG text renderer`
    );

    return {
      pageType: "text-heavy",
      imagePrompt: artPrompt,
      copy: { title, subtitle, sections, footerNote },
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
    copy: {
      title: options.prompt.slice(0, 110),
      subtitle: `Page ${pageIndex + 1} of ${totalPages}`,
      sections: [
        {
          heading: "Requested Content",
          body: options.prompt,
        },
      ],
      footerNote: "",
    },
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

async function generateTextHeavyPage(
  composition: PageComposition
): Promise<Buffer> {
  if (!composition.copy) {
    throw new Error("Structured page copy is required for a text-heavy page");
  }

  const rawBuffer = await generateCompositionImage(composition.imagePrompt);
  const textOverlay = buildQuickCreateTextOverlaySvg(composition.copy);

  return sharp(rawBuffer)
    .resize(PAGE_WIDTH, PAGE_HEIGHT, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .composite([{ input: textOverlay, blend: "over" }])
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
      : await generateTextHeavyPage(composition);

  const { url: imageUrl } = await storagePut(
    `pages/quick-create/${job.id}/page-${String(pageNumber).padStart(3, "0")}.png`,
    finalBuffer,
    "image/png"
  );

  return {
    pageNumber,
    imageUrl,
    status: "success",
    metadata: {
      pageType: composition.pageType,
      imageModel: SCRIPTORIUM_IMAGE_MODEL,
      textRenderer:
        composition.pageType === "text-heavy" ? "sharp-svg-overlay" : "none",
      sectionCount: composition.copy?.sections.length ?? 0,
    },
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
