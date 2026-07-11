import sharp from "sharp";
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

const NEGATIVE_PROMPT =
  "no text, no words, no letters, no numbers, no watermark, no signature, no blur, no distortion, no extra limbs, no overlapping shapes, no low resolution, no artifacts";

type QuickCreatePageType =
  | "coloring-page"
  | "worksheet"
  | "workbook"
  | "activity-page"
  | "cover";

type QuickCreateRenderMode = "black-and-white" | "full-color";

export interface QuickCreateOptions {
  prompt?: string;
  customPrompt?: string;
  pageCount: number;
  gradeLevel: string;
}

interface NormalizedQuickCreateOptions {
  prompt: string;
  pageCount: number;
  gradeLevel: string;
}

interface ExpandedPagePrompt {
  pageType: QuickCreatePageType;
  renderMode: QuickCreateRenderMode;
  prompt: string;
}

function normalizeOptions(
  options: QuickCreateOptions
): NormalizedQuickCreateOptions {
  const prompt = (options.prompt || options.customPrompt || "").trim();
  const pageCount = Number(options.pageCount);
  const gradeLevel = String(options.gradeLevel || "").trim();

  if (!prompt) {
    throw new Error("Prompt is required");
  }
  if (
    !Number.isInteger(pageCount) ||
    pageCount < 1 ||
    pageCount > MAX_PAGE_COUNT
  ) {
    throw new Error(
      `Page count must be an integer between 1 and ${MAX_PAGE_COUNT}`
    );
  }
  if (!gradeLevel) {
    throw new Error("Grade level is required");
  }

  return {
    prompt: prompt.slice(0, 2_000),
    pageCount,
    gradeLevel: gradeLevel.slice(0, 100),
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

function isPageType(value: unknown): value is QuickCreatePageType {
  return [
    "coloring-page",
    "worksheet",
    "workbook",
    "activity-page",
    "cover",
  ].includes(String(value));
}

function isRenderMode(value: unknown): value is QuickCreateRenderMode {
  return value === "black-and-white" || value === "full-color";
}

function containsTextRenderingInstruction(prompt: string): boolean {
  const affirmativeTextInstruction =
    /\b(?:add|display|feature|include|place|print|render|show|spell|use|write)\s+(?:the\s+)?(?:caption|equation|heading|instruction|label|letter|name|number|phrase|quote|sentence|text|title|typography|word)s?\b/i;
  const explicitCopy =
    /\b(?:caption|heading|label|text|title)\s+(?:reading|saying|that says)\b|["“”][^"“”]{1,120}["“”]/i;

  return affirmativeTextInstruction.test(prompt) || explicitCopy.test(prompt);
}

function sanitizeFallbackSubject(prompt: string): string {
  const sanitized = prompt
    .replace(/["“”][^"“”]*["“”]/g, " ")
    .replace(
      /\b(?:with\s+)?(?:a\s+)?(?:title|heading|caption|label|text)\b[^,.!?]*/gi,
      " "
    )
    .replace(/\b(?:that\s+says|saying|reading)\b[^,.!?]*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return sanitized.slice(0, 500) || "the requested educational theme";
}

function fallbackExpandedPrompt(
  options: NormalizedQuickCreateOptions,
  pageIndex: number
): ExpandedPagePrompt {
  const subject = sanitizeFallbackSubject(options.prompt);
  const lowerPrompt = options.prompt.toLowerCase();
  const isColoringPage =
    /\b(?:coloring|colouring|line art|colour-in|color-in)\b/.test(lowerPrompt);
  const isCover = /\bcover\b/.test(lowerPrompt);
  const isWorkbook = /\bworkbook\b/.test(lowerPrompt);
  const isWorksheet = /\bworksheet\b/.test(lowerPrompt);

  if (isColoringPage) {
    return {
      pageType: "coloring-page",
      renderMode: "black-and-white",
      prompt: `Simple black-and-white line art coloring page of ${subject}. Thick clean outlines, no shading, no color, no background clutter. Kid-friendly, ages ${options.gradeLevel}. Centered on the page, high contrast, printable, vector-like. Create a distinct scene for page ${pageIndex + 1}.`,
    };
  }

  const pageType: QuickCreatePageType = isCover
    ? "cover"
    : isWorkbook
      ? "workbook"
      : isWorksheet
        ? "worksheet"
        : "activity-page";
  const layoutDirection =
    pageType === "cover"
      ? "Bold professional cover composition with a strong central themed illustration and a generous clean area reserved for a title that will be added after generation."
      : "Clear educational activity layout with a themed decorative border, engaging illustrations, blank unlabeled activity areas, generous white space, and strong visual hierarchy.";

  return {
    pageType,
    renderMode: "full-color",
    prompt: `Full-color printable ${pageType.replace("-", " ")} about ${subject}. ${layoutDirection} Kid-friendly for ${options.gradeLevel}, balanced portrait composition, polished educational publishing style, crisp shapes, vibrant harmonious palette, and no background clutter. Create a distinct composition for page ${pageIndex + 1}.`,
  };
}

async function expandPagePrompt(
  options: NormalizedQuickCreateOptions,
  pageIndex: number,
  totalPages: number
): Promise<ExpandedPagePrompt> {
  const systemPrompt = `You are a production image-prompt engineer for printable educational products.
Expand a simple user request into ONE detailed visual prompt for one 8.5x11-inch portrait page.

Classify the page and follow these rules:
- Coloring books and coloring pages: pageType "coloring-page", renderMode "black-and-white", and use this fixed style pattern: "Simple black-and-white line art coloring page of [SUBJECT]. Thick clean outlines, no shading, no color, no background clutter. Kid-friendly, ages [AGE_RANGE]. Centered on the page, high contrast, printable, vector-like."
- Worksheets, workbooks, and activity pages: renderMode "full-color" with a clear educational visual layout, themed decorative border, appealing illustrations, blank unlabeled activity areas where useful, generous white space, and strong hierarchy.
- Covers: renderMode "full-color" with a bold cover composition, themed illustration, and a clean blank area where a title can be added later.

CRITICAL TEXT-SAFETY RULES:
- Describe visual artwork only.
- Never ask the image model to render, show, display, write, spell, or include any title, text, words, letters, numbers, equations, labels, captions, instructions, signatures, or typography.
- Do not quote any copy from the user's request.
- Text will be handled separately or omitted.
- Keep the same overall art direction across the product while making this page visually distinct.

Return only the required JSON object.`;

  const userPrompt = `User request: ${options.prompt}
Grade or age range: ${options.gradeLevel}
Page: ${pageIndex + 1} of ${totalPages}

Create the detailed text-free visual prompt for this page.`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "quick_create_page_prompt",
          strict: true,
          schema: {
            type: "object",
            properties: {
              pageType: {
                type: "string",
                enum: [
                  "coloring-page",
                  "worksheet",
                  "workbook",
                  "activity-page",
                  "cover",
                ],
              },
              renderMode: {
                type: "string",
                enum: ["black-and-white", "full-color"],
              },
              prompt: { type: "string", minLength: 40, maxLength: 2_000 },
            },
            required: ["pageType", "renderMode", "prompt"],
            additionalProperties: false,
          },
        },
      },
    });

    const parsed = JSON.parse(extractLlmText(result)) as Record<
      string,
      unknown
    >;
    if (
      !isPageType(parsed.pageType) ||
      !isRenderMode(parsed.renderMode) ||
      typeof parsed.prompt !== "string" ||
      !parsed.prompt.trim() ||
      containsTextRenderingInstruction(parsed.prompt)
    ) {
      throw new Error("LLM returned an invalid or text-unsafe image prompt");
    }

    const pageType = parsed.pageType;
    return {
      pageType,
      renderMode:
        pageType === "coloring-page" ? "black-and-white" : "full-color",
      prompt: parsed.prompt.trim(),
    };
  } catch (error) {
    console.warn(
      `Quick Create prompt expansion failed for page ${pageIndex + 1}; using safe fallback:`,
      error instanceof Error ? error.message : error
    );
    return fallbackExpandedPrompt(options, pageIndex);
  }
}

async function resizeAndCenter(
  input: Buffer,
  renderMode: QuickCreateRenderMode
): Promise<Buffer> {
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Generated image dimensions are unavailable");
  }

  const scale = Math.min(
    PAGE_WIDTH / metadata.width,
    PAGE_HEIGHT / metadata.height
  );
  const width = Math.min(
    PAGE_WIDTH,
    Math.max(1, Math.round(metadata.width * scale))
  );
  const height = Math.min(
    PAGE_HEIGHT,
    Math.max(1, Math.round(metadata.height * scale))
  );
  const left = Math.floor((PAGE_WIDTH - width) / 2);
  const right = PAGE_WIDTH - width - left;
  const top = Math.floor((PAGE_HEIGHT - height) / 2);
  const bottom = PAGE_HEIGHT - height - top;
  const kernel =
    renderMode === "black-and-white"
      ? sharp.kernel.nearest
      : sharp.kernel.lanczos3;

  let pipeline = sharp(input)
    .resize(width, height, { fit: "fill", kernel })
    .extend({
      top,
      bottom,
      left,
      right,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    });

  if (renderMode === "black-and-white") {
    pipeline = pipeline.grayscale().threshold(128);
  }

  return pipeline.png({ compressionLevel: 9 }).toBuffer();
}

async function postProcessImage(
  rawBuffer: Buffer,
  renderMode: QuickCreateRenderMode
): Promise<Buffer> {
  if (renderMode === "black-and-white") {
    const cleaned = await sharp(rawBuffer)
      .rotate()
      .flatten({ background: "#ffffff" })
      .grayscale()
      .threshold(128)
      .sharpen()
      .median(2)
      .png()
      .toBuffer();

    return resizeAndCenter(cleaned, renderMode);
  }

  const cleaned = await sharp(rawBuffer)
    .rotate()
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();

  return resizeAndCenter(cleaned, renderMode);
}

async function generateQuickCreatePage(
  pageIndex: number,
  job: GenerationJob
): Promise<PageResult> {
  const options = job.options as unknown as NormalizedQuickCreateOptions;
  const pageNumber = pageIndex + 1;
  const expanded = await expandPagePrompt(options, pageIndex, job.totalPages);
  const fluxPrompt = `${expanded.prompt}\n\nNegative prompt: ${NEGATIVE_PROMPT}`;

  const { buffer: rawBuffer } = await generatePageImage(fluxPrompt, {
    aspectRatio: "3:4",
    raw: true,
  });
  const processedBuffer = await postProcessImage(
    rawBuffer,
    expanded.renderMode
  );
  const { url: imageUrl } = await storagePut(
    `pages/quick-create/${job.id}/page-${String(pageNumber).padStart(3, "0")}.png`,
    processedBuffer,
    "image/png"
  );

  return {
    pageNumber,
    imageUrl,
    status: "success",
    metadata: {
      pageType: expanded.pageType,
      renderMode: expanded.renderMode,
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
