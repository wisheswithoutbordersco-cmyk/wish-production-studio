/**
 * Shared utilities for all generators.
 * - Image prompt construction (enforces NO TEXT rule, edge-to-edge)
 * - Chunked generation orchestration
 * - Content generation via LLM
 */
import { ENV } from "../_core/env";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";
import { assemblePdf, fetchImageBuffer, PageContent } from "../pdfAssembly";
import { createJob, getJob, updateJob, addPageResult, type GenerationJob, type PageResult } from "../jobs";
import sharp from "sharp";

// Pages to generate per poll request (chunked pattern)
export const PAGES_PER_CHUNK = 1;

/**
 * Returns the user's custom creative brief when supplied, otherwise the
 * generator's existing dropdown-derived direction.
 */
export function resolveCreativeDirection(
  customPrompt: string | undefined,
  fallback: string
): string {
  return customPrompt?.trim() || fallback;
}

/**
 * Formats a custom brief for LLM prompts while making it explicit that
 * required output schemas, page structure, readability, and safety rules
 * still apply.
 */
export function customPromptInstruction(customPrompt?: string): string {
  const prompt = customPrompt?.trim();
  if (!prompt) return "";

  return `\n\nPRIMARY CREATIVE DIRECTION (override dropdown-derived themes and topics):\n${prompt}\nFollow this creative direction while preserving every required output format, page structure, readability, age-appropriateness, and safety constraint above.`;
}

export function normalizeCustomPrompt(customPrompt?: string): string | undefined {
  const prompt = customPrompt?.trim();
  return prompt || undefined;
}

/**
 * Builds an image prompt that enforces:
 * 1. NO text in the image
 * 2. Edge-to-edge design (fills entire canvas)
 * 3. Cultural authenticity when specified
 */
export function buildImagePrompt(params: {
  subject: string;
  style?: string;
  theme?: string;
  culturalVariant?: string;
  ageRange?: string;
  colorPalette?: string;
  additionalDetails?: string;
}): string {
  const parts: string[] = [];

  // Edge-to-edge prefix
  parts.push("Template");

  // Main subject
  parts.push(params.subject);

  // Style
  if (params.style) {
    parts.push(params.style);
  }

  // Theme
  if (params.theme) {
    parts.push(`${params.theme} themed`);
  }

  // Cultural variant
  if (params.culturalVariant && params.culturalVariant !== "None") {
    parts.push(`incorporating authentic ${params.culturalVariant} cultural elements, patterns, and motifs`);
  }

  // Age-appropriate styling
  if (params.ageRange) {
    const ageNum = parseInt(params.ageRange);
    if (ageNum <= 5) {
      parts.push("simple bold shapes, bright colors, child-friendly");
    } else if (ageNum <= 8) {
      parts.push("engaging detailed illustration, age-appropriate");
    } else {
      parts.push("detailed sophisticated illustration");
    }
  }

  // Color palette
  if (params.colorPalette) {
    parts.push(params.colorPalette);
  }

  // Additional details
  if (params.additionalDetails) {
    parts.push(params.additionalDetails);
  }

  // Enforce NO TEXT, edge-to-edge, and production quality
  parts.push("filling the entire canvas edge-to-edge with no borders, frames, shadows, or text of any kind");
  parts.push("absolutely no words, letters, numbers, or written text anywhere in the image");
  parts.push("flat graphic design illustration");
  parts.push("ultra detailed, professional quality, print-ready, high resolution, masterful composition");

  return parts.join(", ");
}

/**
 * Generate content using LLM (GPT) - for trivia questions, worksheet problems, etc.
 */
function extractTextContent(result: Awaited<ReturnType<typeof invokeLLM>>): string {
  const content = result.choices[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textPart = content.find((p): p is { type: "text"; text: string } => p.type === "text");
    return textPart?.text || "";
  }
  return "";
}

export async function generateContent(params: {
  systemPrompt: string;
  userPrompt: string;
  responseFormat?: any;
}): Promise<string> {
  const result = await invokeLLM({
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userPrompt },
    ],
    response_format: params.responseFormat,
  });

  return extractTextContent(result);
}

export interface FullPageImagePromptParams {
  generatorType: string;
  pageType: string;
  pageNumber: number;
  totalPages: number;
  audience: string;
  creativeDirection: string;
  exactText: string[];
  layoutGuidance: string;
  styleGuidance: string;
  functionalRequirements?: string[];
  customPrompt?: string;
}

function buildExactTextManifest(exactText: string[]): string {
  return exactText
    .map((text, index) => `${index + 1}. ${text.replace(/\s+/g, " ").trim()}`)
    .filter(line => !/^\d+\.\s*$/.test(line))
    .join("\n");
}

type TextOverlayElement = {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontWeight: "normal" | "bold";
  color: string;
  align: "left" | "center" | "right";
  maxWidth?: number;
};

type HybridPageLayout = {
  fluxPrompt: string;
  textOverlay: TextOverlayElement[];
};

const NO_TEXT_SUFFIX =
  "absolutely no text, no letters, no words, no numbers, no typography anywhere in the image, pure illustration and decorative layout only";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeSvgColor(value: string): string {
  return /^#[0-9a-f]{3,8}$/i.test(value.trim()) ? value.trim() : "#222222";
}

function normalizeTextElement(value: unknown): TextOverlayElement | null {
  if (!isRecord(value)) return null;

  const { text, x, y, fontSize, fontWeight, color, align, maxWidth } = value;
  if (
    typeof text !== "string" ||
    !text.trim() ||
    typeof x !== "number" ||
    !Number.isFinite(x) ||
    typeof y !== "number" ||
    !Number.isFinite(y) ||
    typeof fontSize !== "number" ||
    !Number.isFinite(fontSize) ||
    (fontWeight !== "normal" && fontWeight !== "bold") ||
    typeof color !== "string" ||
    (align !== "left" && align !== "center" && align !== "right") ||
    (maxWidth !== undefined && maxWidth !== null &&
      (typeof maxWidth !== "number" || !Number.isFinite(maxWidth)))
  ) {
    return null;
  }

  return {
    text: text.trim(),
    x,
    y,
    fontSize,
    fontWeight,
    color,
    align,
    ...(typeof maxWidth === "number" ? { maxWidth } : {}),
  };
}

function parseHybridPageLayout(rawContent: string): HybridPageLayout {
  const parsed: unknown = JSON.parse(rawContent);
  if (!isRecord(parsed)) {
    throw new Error("Hybrid layout response was not a JSON object");
  }

  const fluxPrompt = typeof parsed.fluxPrompt === "string"
    ? parsed.fluxPrompt.trim()
    : "";
  if (!fluxPrompt || !Array.isArray(parsed.textOverlay)) {
    throw new Error("Hybrid layout response is missing fluxPrompt or textOverlay");
  }

  const textOverlay = parsed.textOverlay.map(normalizeTextElement);
  if (
    textOverlay.length === 0 ||
    textOverlay.some((element): element is null => element === null)
  ) {
    throw new Error("Hybrid layout response contains invalid text elements");
  }

  return {
    fluxPrompt,
    textOverlay: textOverlay as TextOverlayElement[],
  };
}

function assertOverlayIncludesExactText(
  elements: TextOverlayElement[],
  requiredText: string[]
): void {
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const combinedOverlayText = normalize(elements.map(element => element.text).join(" "));
  const missingText = requiredText
    .map(normalize)
    .filter(text => text && !combinedOverlayText.includes(text));

  if (missingText.length > 0) {
    throw new Error(
      `Hybrid layout omitted ${missingText.length} mandatory text item(s)`
    );
  }
}

function wrapText(text: string, maxCharacters: number): string[] {
  const lines: string[] = [];
  const safeMaximum = Math.max(1, maxCharacters);

  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    const words = paragraph.trim().split(/\s+/);
    let currentLine = "";

    for (const word of words) {
      const chunks: string[] = [];
      for (let index = 0; index < word.length; index += safeMaximum) {
        chunks.push(word.slice(index, index + safeMaximum));
      }

      for (const chunk of chunks) {
        const candidate = currentLine ? `${currentLine} ${chunk}` : chunk;
        if (candidate.length <= safeMaximum) {
          currentLine = candidate;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = chunk;
        }
      }
    }

    if (currentLine) lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
}

function buildTextOverlaySvg(
  elements: TextOverlayElement[],
  width: number,
  height: number
): Buffer {
  // Scale font sizes relative to page height. For a typical 1365px image,
  // a fontSize of 28pt should render as ~25px which is readable.
  // Use height/50 as the base unit so fontSize 28 = 28 * (height/50) / 28 = height/50 pixels per point
  const pxPerPt = height / 55; // ~25px per point at 1365px height
  const renderedElements = elements.map(element => {
    const scaledFontSize = Math.max(
      14,
      Math.round(clamp(element.fontSize, 10, 48) * pxPerPt / 14)
    );
    const padding = Math.max(8, Math.round(12 * (height / 1365)));
    const lineHeight = Math.max(
      scaledFontSize + 2,
      Math.round(scaledFontSize * 1.25)
    );
    const maxWidthPercent = clamp(element.maxWidth ?? 90, 5, 100);
    const maxWidthPixels = width * (maxWidthPercent / 100);
    const maxCharacters = Math.max(
      1,
      Math.floor(maxWidthPixels / Math.max(scaledFontSize * 0.56, 1))
    );
    const lines = wrapText(element.text, maxCharacters);
    const estimatedTextWidth = Math.min(
      maxWidthPixels,
      Math.max(
        scaledFontSize,
        ...lines.map(line => line.length * scaledFontSize * 0.56)
      )
    );
    const requestedTextX = width * (clamp(element.x, 0, 100) / 100);
    const textX = element.align === "center"
      ? clamp(
          requestedTextX,
          estimatedTextWidth / 2 + padding,
          width - estimatedTextWidth / 2 - padding
        )
      : element.align === "right"
        ? clamp(
            requestedTextX,
            estimatedTextWidth + padding,
            width - padding
          )
        : clamp(
            requestedTextX,
            padding,
            width - estimatedTextWidth - padding
          );
    const maximumBaseline = Math.max(
      scaledFontSize + padding,
      height - padding - (lines.length - 1) * lineHeight
    );
    const textY = clamp(
      height * (clamp(element.y, 0, 100) / 100),
      scaledFontSize + padding,
      maximumBaseline
    );
    const anchor = element.align === "center"
      ? "middle"
      : element.align === "right"
        ? "end"
        : "start";
    const unpaddedTextLeft = element.align === "center"
      ? textX - estimatedTextWidth / 2
      : element.align === "right"
        ? textX - estimatedTextWidth
        : textX;
    const panelWidth = Math.min(width, estimatedTextWidth + padding * 2);
    const panelHeight = scaledFontSize + (lines.length - 1) * lineHeight + padding * 2;
    const panelX = clamp(unpaddedTextLeft - padding, 0, Math.max(0, width - panelWidth));
    const panelY = clamp(textY - scaledFontSize - padding, 0, Math.max(0, height - panelHeight));
    const tspans = lines
      .map((line, index) =>
        `<tspan x="${textX.toFixed(2)}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
      )
      .join("");

    return `<g>
      <rect x="${panelX.toFixed(2)}" y="${panelY.toFixed(2)}" width="${panelWidth.toFixed(2)}" height="${panelHeight.toFixed(2)}" rx="${Math.max(4, Math.round(6 * (height / 1365)))}" fill="#ffffff" fill-opacity="0.85"/>
      <text x="${textX.toFixed(2)}" y="${textY.toFixed(2)}" font-family="Arial, Helvetica, sans-serif" font-size="${scaledFontSize}" font-weight="${element.fontWeight}" fill="${normalizeSvgColor(element.color)}" text-anchor="${anchor}" xml:space="preserve">${tspans}</text>
    </g>`;
  });

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${renderedElements.join("\n")}</svg>`
  );
}

async function fetchRawImageBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch raw image: ${response.status} from ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Generate a composition image using GPT-5 Image Mini via OpenRouter's dedicated Image API.
 * Returns a raw PNG buffer at 1024x1536.
 */
const IMAGE_GEN_RETRIES = 3;

interface ImageApiResponse {
  data?: Array<{ b64_json?: string }>;
}

async function generateCompositionImageViaOpenRouter(prompt: string): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= IMAGE_GEN_RETRIES; attempt++) {
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
      if (attempt === IMAGE_GEN_RETRIES) break;

      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`Composition image attempt ${attempt}/${IMAGE_GEN_RETRIES} failed: ${msg}`);
      await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Image generation failed after retries");
}

/**
 * Generate a full-page image using GPT-5 Image Mini via OpenRouter.
 * The LLM generates a detailed composition prompt, then the Image API renders it.
 * All text is rendered directly by the AI model — no SVG overlay needed.
 */
export async function generateFullPageImage(
  params: FullPageImagePromptParams
): Promise<{ imageUrl: string; buffer: Buffer; prompt: string }> {
  const requiredText = [
    ...params.exactText,
    `Page ${params.pageNumber} of ${params.totalPages}`,
    "WishesWithoutBordersCo",
  ];
  const exactTextManifest = buildExactTextManifest(requiredText);
  const creativeDirection = normalizeCustomPrompt(params.customPrompt) || params.creativeDirection;
  const customDirectionRule = normalizeCustomPrompt(params.customPrompt)
    ? "The user's custom creative direction is primary and overrides dropdown-derived theme, topic, palette, decorative style, and visual treatment. It must not remove or rewrite required page content."
    : "Use the supplied generator-specific creative direction as the primary visual theme.";

  const systemPrompt = `You are an expert graphic designer creating prompts for AI image generation of professional printable educational products.

Given a page specification, create a detailed image generation prompt that describes a COMPLETE full-page design including:
- Page title and subtitle with the exact text to render
- All content text (questions, answers, instructions, activities, labels, answer blanks) with exact wording
- Visual theme (colors, illustration style, decorative elements)
- Layout structure (how elements are arranged on the page)
- Decorative illustrations and icons relevant to the subject
- Footer branding with the exact text "WishesWithoutBordersCo"

RULES:
- The prompt must describe ONE complete, flat, full-page image at 8.5x11 inches in portrait orientation
- The image must fill the entire canvas edge-to-edge — never a photographed sheet, mockup, frame, or page on a background
- ALL text from the MANDATORY TEXT MANIFEST must be included verbatim, spelled correctly
- Include specific colors, font styles, text hierarchy, spacing, panels, shapes, icons, and illustrations
- Prioritize legibility: strong contrast, generous spacing, clean grouping, no overlapping text or decorative elements
- The finished design should look like a professional Canva template: colorful, layered, polished, balanced, print-ready
- Do not mention post-production, overlays, editable layers, or adding text later
- The generated image itself must be the complete finished page

Return JSON only: {"imagePrompt":"the complete image-generation prompt"}`;

  const userPrompt = `Design page ${params.pageNumber} of ${params.totalPages} for a ${params.generatorType}.
PAGE TYPE:
${params.pageType}
AUDIENCE:
${params.audience}
CREATIVE DIRECTION:
${creativeDirection}
CUSTOM-DIRECTION RULE:
${customDirectionRule}
LAYOUT GUIDANCE:
${params.layoutGuidance}
STYLE AND TYPOGRAPHY GUIDANCE:
${params.styleGuidance}
FUNCTIONAL REQUIREMENTS:
${(params.functionalRequirements || []).map((item, index) => `${index + 1}. ${item}`).join("\n") || "1. The page must be immediately usable when printed."}
MANDATORY TEXT MANIFEST (include ALL of these exactly as written):
${exactTextManifest}

Create the complete image composition prompt.`;

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await invokeLLM({
        model: "openai/gpt-4o",
        maxTokens: 4000,
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

      const parsed = JSON.parse(extractTextContent(result)) as { imagePrompt?: unknown };
      const imagePrompt = typeof parsed.imagePrompt === "string" ? parsed.imagePrompt.trim() : "";
      if (!imagePrompt) throw new Error("LLM returned an empty image composition prompt");

      // Generate the image via OpenRouter Image API
      const rawBuffer = await generateCompositionImageViaOpenRouter(imagePrompt);

      // Upscale to print resolution (2550x3300 = 8.5x11 at 300 DPI)
      const finalBuffer = await sharp(rawBuffer)
        .resize(2550, 3300, { fit: "fill", kernel: sharp.kernel.lanczos3 })
        .png({ compressionLevel: 9 })
        .toBuffer();

      // Upload to storage
      const { url: imageUrl } = await storagePut(
        `pages/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`,
        finalBuffer,
        "image/png"
      );

      return { imageUrl, buffer: finalBuffer, prompt: imagePrompt };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Full page image attempt ${attempt}/3 failed: ${lastError.message}`);
    }
  }

  throw new Error(
    `Full page image generation failed after 3 attempts: ${lastError?.message || "unknown error"}`
  );
}

/**
 * Generate a single page image using GPT-5 Image Mini via OpenRouter.
 * Used by coloring books, cultural games, flashcards, and card covers
 * that need illustration-only images (no text rendering).
 */
export async function generatePageImage(
  prompt: string,
  options: { aspectRatio?: string; raw?: boolean } = {}
): Promise<{ imageUrl: string; buffer: Buffer }> {
  // Use OpenRouter Image API for all image generation
  const rawBuffer = await generateCompositionImageViaOpenRouter(prompt);

  // Upload to storage and return
  const { url: imageUrl } = await storagePut(
    `pages/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`,
    rawBuffer,
    "image/png"
  );

  return { imageUrl, buffer: rawBuffer };
}

/**
 * Process a chunk of pages for a job (3-5 pages per poll).
 * This is called during each poll request.
 */
export async function processChunk(
  job: GenerationJob,
  generatePageFn: (pageIndex: number, job: GenerationJob) => Promise<PageResult>,
  finalizeFn: (job: GenerationJob) => Promise<void> = finalizePdf
): Promise<void> {
  const startIndex = job.nextPageIndex;
  const endIndex = Math.min(startIndex + PAGES_PER_CHUNK, job.totalPages);

  updateJob(job.id, {
    status: "generating",
    statusMessage: `Generating pages ${startIndex + 1}-${endIndex} of ${job.totalPages}...`,
  });

  for (let i = startIndex; i < endIndex; i++) {
    try {
      const result = await generatePageFn(i, job);
      addPageResult(job.id, result);
      updateJob(job.id, {
        nextPageIndex: i + 1,
        statusMessage: `Generated page ${i + 1} of ${job.totalPages}`,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      addPageResult(job.id, {
        pageNumber: i + 1,
        imageUrl: "",
        status: "error",
        error: errorMsg,
      });
      updateJob(job.id, { nextPageIndex: i + 1 });
    }
  }

  // Check if all pages are done
  const updatedJob = getJob(job.id);
  if (updatedJob && updatedJob.nextPageIndex >= updatedJob.totalPages) {
    // All pages generated, assemble PDF (custom finalizer if provided)
    await finalizeFn(updatedJob);
  }
}

/**
 * Assemble final PDF from all generated page images and upload to storage.
 */
export async function finalizePdf(
  job: GenerationJob,
  options: { addPdfBranding?: boolean } = {}
): Promise<void> {
  updateJob(job.id, { statusMessage: "Assembling PDF..." });

  const successPages = job.pageResults.filter(r => r.status === "success");

  if (successPages.length === 0) {
    updateJob(job.id, {
      status: "error",
      errorMessage: "No pages were generated successfully.",
    });
    return;
  }

  try {
    // Each generated image is already the complete printable page. Pass only
    // the compressed image buffer so PDFKit cannot add text, page numbers, or
    // branding overlays after generation.
    const pageContents: PageContent[] = [];
    for (const page of successPages) {
      const buffer = await fetchImageBuffer(page.imageUrl);
      pageContents.push({
        imageBuffer: buffer,
        addBranding: options.addPdfBranding !== false,
      });
    }

    const pdfBuffer = await assemblePdf(pageContents);
    console.log(`PDF assembled: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB for ${successPages.length} pages`);

    // Upload PDF to storage
    const { url: pdfUrl } = await storagePut(
      `products/${job.generatorType}/${job.filename}`,
      pdfBuffer,
      "application/pdf"
    );

    // Set cover image from first successful page
    const coverUrl = successPages[0]?.imageUrl || null;

    updateJob(job.id, {
      status: successPages.length === job.totalPages ? "complete" : "partial",
      pdfUrl,
      coverImageUrl: coverUrl,
      statusMessage: "PDF ready for download!",
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "PDF assembly failed";
    updateJob(job.id, {
      status: "error",
      errorMessage: errorMsg,
    });
  }
}
