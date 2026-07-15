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

export interface ScriptoriumPageSection {
  heading: string;
  body: string;
}

export interface ScriptoriumPagePlan {
  title: string;
  subtitle: string;
  sections: ScriptoriumPageSection[];
  footerNote: string;
  imagePrompt: string;
}

export const SCRIPTORIUM_IMAGE_MODEL = "fal-ai/flux-pro/v1.1-ultra";
export const SCRIPTORIUM_CONTENT_MODEL = "openai/gpt-4o";
export const SCRIPTORIUM_WATERMARK = "WishesWithoutBordersCo";

export const SCRIPTORIUM_RENDER_QUALITY =
  "premium professional publishing quality, bold saturated vivid colors, high contrast, a rich vibrant palette, intense clean color separation, crisp clean edges, sharply defined characters and illustrations, refined textures, accurate anatomy, strong typographic hierarchy, excellent legibility, artifact-free, polished, detailed, and print-ready; avoid beige, cream, muted earth tones, dusty colors, desaturated color, washed-out color, and soft pastel palettes unless the user explicitly requests them";

export const SCRIPTORIUM_SYSTEM_PROMPT = `You are an expert publishing content designer, factual editor, and art director creating professional illustrated posters, infographics, greeting cards, guides, activity pages, worksheets, journals, planners, trackers, and other printable page-based products.

The USER REQUEST is authoritative. Infer the product type, purpose, structure, tone, audience, complexity, visual theme, and use solely from the user's words. Never turn a request into a school worksheet, lesson, quiz, math exercise, classroom activity, or answer-blank page unless the user explicitly asks for that format.

Plan ONE complete 8.5x11-inch portrait page that will be rendered by Flux Pro Ultra as a single finished, flattened, full-bleed image. Every visible title, subtitle, heading, fact, description, label, instruction, message, and footer must be part of the AI image-generation prompt and rendered directly inside the illustration. There is no later text overlay step.

CONTENT RULES:
- Write a concise, compelling page title and an optional subtitle.
- Provide 1 to 10 content sections appropriate to the requested product. Each section needs a short heading and concise, publication-ready body copy.
- For fact, reference, educational, or infographic requests, provide accurate substantive information, never placeholders.
- Preserve every exact title, phrase, name, count, fact, message, language, or footer wording requested by the user.
- For multi-page products, make this page substantively unique while preserving a coherent product-wide visual system.
- Keep visible copy concise enough for excellent legibility inside a single illustrated poster.
- Put any user-requested footer phrase in footerNote. The exact watermark "WishesWithoutBordersCo" is mandatory on every page and is handled separately.

IMAGE-PROMPT RULES:
- imagePrompt must describe ONE complete, flat, full-bleed illustrated poster with all text baked directly into the artwork by Flux Pro Ultra.
- State the exact visible words that must appear, with their placement, hierarchy, font treatment, size, color, and surrounding illustration.
- Describe the layout concretely: title zone, focal illustration, cards/panels/labels, supporting decorations, safe margins, and bottom watermark area.
- Match the layout to the product: infographic cards for lists and facts, a dominant scene plus message for greeting posters, clear activity areas for explicitly requested worksheets, and so on.
- Demand bold saturated vivid color, high contrast, rich clean color separation, dramatic subject-relevant illustration, crisp edges, refined detail, and premium print-ready poster quality.
- Fill the canvas edge-to-edge. Never depict a photographed sheet, mockup, loose paper, poster frame, book spread, device screen, or page sitting on another background.
- Never request a text-free background, empty text panels, placeholder copy, post-production, compositing, SVG, Sharp, editable layers, or adding text later.
- Do not add a page number unless the user explicitly requests one.
- Include the exact small watermark text "WishesWithoutBordersCo" in the bottom area.

Return strict JSON with title, subtitle, sections, footerNote, and imagePrompt. The imagePrompt must already describe the finished page, but structured copy is also returned so the server can append an exact mandatory text manifest before sending the prompt to Flux.`;

export function buildScriptoriumUserPrompt({
  prompt,
  pageIndex,
  totalPages,
}: ScriptoriumPageContext): string {
  return `USER REQUEST:
${prompt}

PAGE TO DESIGN:
${pageIndex + 1} of ${totalPages}

Create the final copy, concrete poster layout, illustration direction, color system, typography treatment, and complete Flux Pro Ultra image prompt for this page. Make this page visually distinctive from the other pages while keeping the collection coherent. The entire printable page must be one AI-generated image with all visible wording rendered directly inside it. Include the exact watermark text "${SCRIPTORIUM_WATERMARK}" at the bottom.`;
}

function normalizeManifestText(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/"/g, "'");
}

export function buildScriptoriumBakedTextPrompt(
  plan: ScriptoriumPagePlan,
  context: ScriptoriumPageContext
): string {
  const manifest = [
    `TITLE: "${normalizeManifestText(plan.title)}"`,
    plan.subtitle
      ? `SUBTITLE: "${normalizeManifestText(plan.subtitle)}"`
      : "",
    ...plan.sections.flatMap((section, index) => [
      `SECTION ${index + 1} HEADING: "${normalizeManifestText(section.heading)}"`,
      `SECTION ${index + 1} BODY: "${normalizeManifestText(section.body)}"`,
    ]),
    plan.footerNote
      ? `FOOTER NOTE: "${normalizeManifestText(plan.footerNote)}"`
      : "",
    `WATERMARK: "${SCRIPTORIUM_WATERMARK}"`,
  ]
    .filter(Boolean)
    .join("\n");

  return `${plan.imagePrompt.trim()}

MANDATORY EXACT VISIBLE TEXT MANIFEST:
${manifest}

FINAL RENDERING DIRECTIVE:
Create page ${context.pageIndex + 1} of ${context.totalPages} as ONE complete, finished, flattened, edge-to-edge 8.5x11-inch portrait illustration. Render every line in the mandatory text manifest directly inside the artwork with correct spelling, clear hierarchy, strong contrast, generous spacing, and no overlap. The title must be a dominant designed element, the section copy must be integrated into illustrated cards, banners, labels, or panels appropriate to the user's requested product, and the exact watermark "${SCRIPTORIUM_WATERMARK}" must appear small but readable in the bottom area. The entire page is the artwork. Do not leave blank text boxes, placeholder text, gibberish filler, or space for later overlays. Do not show a mockup, framed poster, sheet of paper, book, device, or surrounding scene.`;
}

export function buildScriptoriumFallbackPrompt({
  prompt,
  pageIndex,
  totalPages,
}: ScriptoriumPageContext): string {
  const exactRequest = normalizeManifestText(prompt).slice(0, 1500);
  const fallbackTitle =
    exactRequest.length <= 90 ? exactRequest : `Illustrated Guide — Page ${pageIndex + 1}`;

  return `Create ONE complete, flat, full-bleed professional illustrated poster based exactly on this user request: "${exactRequest}". This is design ${pageIndex + 1} in a coherent ${totalPages}-page collection. Use a concrete, subject-appropriate composition with a large bold title at the top reading exactly "${fallbackTitle}", a dramatic central illustration, and polished illustrated cards, labels, banners, or message panels that express the requested content. If the request contains facts, names, messages, labels, or instructions, render those exact words directly inside the artwork. Use bold saturated vivid colors, high contrast, rich clean color separation, crisp edges, premium typography, refined details, and professional infographic-poster quality. Fill the portrait canvas edge-to-edge. At the bottom, include the exact small readable watermark text "${SCRIPTORIUM_WATERMARK}". The entire page must be one finished flattened image with all wording baked into the design. Do not create a text-free background, empty panels, placeholder copy, a photographed sheet, a mockup, a frame, or a page on another background.`;
}

export function buildScriptoriumImageRequest(prompt: string) {
  return {
    model: SCRIPTORIUM_IMAGE_MODEL,
    prompt: `${prompt.trim()}\n\nRENDER QUALITY REQUIREMENTS: ${SCRIPTORIUM_RENDER_QUALITY}. Render one complete 8.5x11-inch portrait poster, edge-to-edge, with all requested title text, headings, descriptions, labels, messages, and the exact watermark "${SCRIPTORIUM_WATERMARK}" baked directly into the illustration. Typography must be an intentional part of the visual composition, not an empty area reserved for later.`,
    aspectRatio: "3:4" as const,
  };
}

const PAGES_PER_CHUNK = 1;
const PAGE_WIDTH = 2550;
const PAGE_HEIGHT = 3300;
const MAX_PAGE_COUNT = 30;
const COLORING_NEGATIVE_PROMPT =
  "no text, no words, no letters, no numbers, no writing, no captions, no labels, no watermark, no signature, no blur, no distortion, no artifacts";

type PageType = "coloring-page" | "complete-poster";

interface PageComposition {
  pageType: PageType;
  imagePrompt: string;
  copy?: ScriptoriumPagePlan;
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

  const context = {
    prompt: options.prompt,
    pageIndex,
    totalPages,
  };

  try {
    const result = await invokeLLM({
      model: SCRIPTORIUM_CONTENT_MODEL,
      maxTokens: 4500,
      messages: [
        { role: "system", content: SCRIPTORIUM_SYSTEM_PROMPT },
        { role: "user", content: buildScriptoriumUserPrompt(context) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "scriptorium_complete_page_plan",
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
              imagePrompt: { type: "string" },
            },
            required: [
              "title",
              "subtitle",
              "sections",
              "footerNote",
              "imagePrompt",
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
      imagePrompt?: unknown;
    };
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const subtitle =
      typeof parsed.subtitle === "string" ? parsed.subtitle.trim() : "";
    const footerNote =
      typeof parsed.footerNote === "string" ? parsed.footerNote.trim() : "";
    const imagePrompt =
      typeof parsed.imagePrompt === "string" ? parsed.imagePrompt.trim() : "";
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
          .filter((section): section is ScriptoriumPageSection =>
            Boolean(section)
          )
          .slice(0, 10)
      : [];

    if (!title || !imagePrompt || sections.length === 0) {
      throw new Error("GPT-4o returned an incomplete complete-page plan");
    }

    const plan: ScriptoriumPagePlan = {
      title,
      subtitle,
      sections,
      footerNote,
      imagePrompt,
    };

    console.info(
      `[Quick Create] Complete poster prompt ready for page ${pageIndex + 1}: ${sections.length} sections; content model ${SCRIPTORIUM_CONTENT_MODEL}; image model ${SCRIPTORIUM_IMAGE_MODEL}; text rendered by Flux`
    );

    return {
      pageType: "complete-poster",
      imagePrompt: buildScriptoriumBakedTextPrompt(plan, context),
      copy: plan,
    };
  } catch (error) {
    console.warn(
      `Complete poster prompt generation failed for page ${pageIndex + 1}; using direct full-page fallback:`,
      error
    );
    return {
      pageType: "complete-poster",
      imagePrompt: buildScriptoriumFallbackPrompt(context),
    };
  }
}

async function downloadGeneratedImage(prompt: string): Promise<Buffer> {
  const request = buildScriptoriumImageRequest(prompt);
  const { url } = await generateImage({
    prompt: request.prompt,
    aspectRatio: request.aspectRatio,
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

  const rawBuffer = await downloadGeneratedImage(coloringPrompt);

  const cleaned = await sharp(rawBuffer)
    .flatten({ background: "#ffffff" })
    .grayscale()
    .threshold(128)
    .sharpen()
    .png()
    .toBuffer();

  return sharp(cleaned)
    .resize(PAGE_WIDTH, PAGE_HEIGHT, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function generateCompletePoster(imagePrompt: string): Promise<Buffer> {
  const rawBuffer = await downloadGeneratedImage(imagePrompt);

  // Sharp is used only to normalize the single AI-generated page to print size.
  // No SVG, text, branding, or other visual layer is composited here.
  return sharp(rawBuffer)
    .resize(PAGE_WIDTH, PAGE_HEIGHT, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

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
      : await generateCompletePoster(composition.imagePrompt);

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
      contentModel:
        composition.pageType === "complete-poster"
          ? SCRIPTORIUM_CONTENT_MODEL
          : "not-required",
      imageModel: SCRIPTORIUM_IMAGE_MODEL,
      textRenderer:
        composition.pageType === "complete-poster"
          ? "flux-pro-ultra-baked-in"
          : "none",
      sectionCount: composition.copy?.sections.length ?? 0,
    },
  };
}

async function processQuickCreateChunkInternal(
  job: GenerationJob
): Promise<void> {
  const startIndex = job.nextPageIndex;
  const endIndex = Math.min(startIndex + PAGES_PER_CHUNK, job.totalPages);

  updateJob(job.id, {
    status: "generating",
    statusMessage: `Generating complete AI poster page ${startIndex + 1} of ${job.totalPages}...`,
  });

  for (let pageIndex = startIndex; pageIndex < endIndex; pageIndex++) {
    try {
      const result = await generateQuickCreatePage(pageIndex, job);
      addPageResult(job.id, result);
      updateJob(job.id, {
        nextPageIndex: pageIndex + 1,
        statusMessage: `Generated complete poster page ${pageIndex + 1} of ${job.totalPages}`,
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
    await finalizePdf(updatedJob, { addPdfBranding: false });
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
