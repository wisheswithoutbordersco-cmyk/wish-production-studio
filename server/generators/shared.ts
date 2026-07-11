/**
 * Shared utilities for all generators.
 * - Image prompt construction (enforces NO TEXT rule, edge-to-edge)
 * - Chunked generation orchestration
 * - Content generation via LLM
 */
import { generateImage } from "../_core/imageGeneration";
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
  const scaleFactor = height / 1536;
  const renderedElements = elements.map(element => {
    const scaledFontSize = Math.max(
      8,
      Math.round(clamp(element.fontSize, 6, 96) * scaleFactor)
    );
    const padding = Math.max(4, Math.round(8 * scaleFactor));
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
      <rect x="${panelX.toFixed(2)}" y="${panelY.toFixed(2)}" width="${panelWidth.toFixed(2)}" height="${panelHeight.toFixed(2)}" rx="${Math.max(4, Math.round(6 * scaleFactor))}" fill="#ffffff" fill-opacity="0.85"/>
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

async function generateLegacyFullPageImage(
  params: FullPageImagePromptParams,
  exactTextManifest: string,
  creativeDirection: string,
  customDirectionRule: string
): Promise<{ imageUrl: string; buffer: Buffer; prompt: string }> {
  const systemPrompt = `You are an elite educational publishing art director and image-prompt engineer.
Create an ultra-detailed prompt for FLUX Pro to render ONE COMPLETE, production-ready 8.5x11-inch portrait page as a single flat image.
The generated image itself must contain the entire finished page: every title, instruction, question, answer blank, list, label, box, grid, decorative element, page number, and brand mark.
Do not describe a header illustration with empty space for later text. Do not request mockups, paper photographed on a desk, separate assets, or post-production overlays.
Return JSON only in this shape: {"prompt":"the complete FLUX prompt"}.`;

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

MANDATORY EXACT TEXT MANIFEST:
${exactTextManifest}

Write a single ultra-detailed FLUX prompt that specifies the portrait composition edge-to-edge, safe print margins, precise positioning and hierarchy of every content section, typography style and relative sizes, boxes/columns/grids/answer areas, integrated themed illustrations and mascots, border and decorative treatment, color palette, and footer placement. Quote every mandatory text string exactly as written. Explicitly require crisp, correctly spelled, highly legible text and adequate blank response space. The final image must be a flat full-page design with no surrounding background, no frame, no shadow, no book mockup, no hands, and no separate PDF text layer.`;

  const result = await invokeLLM({
    model: "openai/gpt-4o",
    maxTokens: 3500,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const rawContent = extractTextContent(result);
  let detailedPrompt = "";
  try {
    const parsed = JSON.parse(rawContent);
    detailedPrompt = typeof parsed.prompt === "string" ? parsed.prompt.trim() : "";
  } catch {
    detailedPrompt = rawContent.trim();
  }

  if (!detailedPrompt) {
    detailedPrompt = `${params.pageType}. ${creativeDirection}. ${params.layoutGuidance}. ${params.styleGuidance}.`;
  }

  const prompt = `Create ONE COMPLETE 8.5x11 portrait page as a single finished image, filling the entire canvas edge-to-edge. The image IS the final printable page; do not leave space for later PDF text overlays.\n\n${detailedPrompt}\n\nMANDATORY EXACT COPY — render every line below clearly, correctly spelled, and exactly as written:\n${exactTextManifest}\n\nProduction constraints: flat full-page graphic design, portrait orientation, safe print margins, crisp high-contrast typography, all functional answer blanks and activity areas visible, no cropped content, no external border, no frame, no drop shadow, no mockup, no desk, no hands, no separate sheet of paper, no placeholder text, no lorem ipsum.`;

  const { imageUrl, buffer } = await generatePageImage(prompt, { aspectRatio: "3:4" });
  return { imageUrl, buffer, prompt };
}

/**
 * Uses GPT-4o to art-direct a page. Covers keep the legacy all-in-one FLUX
 * rendering path; activity pages render illustration-only art and receive a
 * deterministic SVG text overlay before being uploaded to persistent storage.
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

  // ALL pages use hybrid rendering (including covers) — Flux cannot render text reliably
  try {
    const systemPrompt = `You are an elite educational publishing art director.
Design a complete activity page layout for an educational product.

You must return JSON with exactly this shape:
{
  "fluxPrompt": "A detailed prompt for FLUX to generate ONLY the illustration/background/decorative elements. The prompt MUST NOT request any text, letters, numbers, words, or typography. Describe only: background colors/gradients, decorative borders, themed illustrations, mascots, activity area outlines (boxes, lines, grids), and visual layout zones.",
  "textOverlay": [
    {"text": "Page Title", "x": 50, "y": 5, "fontSize": 28, "fontWeight": "bold", "color": "#222222", "align": "center", "maxWidth": 90},
    {"text": "Instructions here", "x": 5, "y": 12, "fontSize": 14, "fontWeight": "normal", "color": "#333333", "align": "left", "maxWidth": 90}
  ]
}

CRITICAL RULES FOR fluxPrompt:
- NEVER include any text, letters, numbers, words, or typography in the image
- Describe blank zones/panels where text will be placed programmatically
- Use phrases like "clean white panel area at top for title" or "empty lined area for writing"
- End the prompt with: "${NO_TEXT_SUFFIX}"

CRITICAL RULES FOR textOverlay:
- x and y are PERCENTAGES (0-100) of the page dimensions
- x=50 means horizontally centered, x=5 means near left edge
- y=5 means near top, y=95 means near bottom
- fontSize is in points (typical range: 10-36)
- Include ALL text that should appear on the page: title, instructions, questions, answer blanks, page number, branding
- Preserve every mandatory text string exactly, without rewriting, correcting, combining, or omitting it
- Use "___________________________" for answer lines
- maxWidth is a percentage (use 90 by default) to prevent text overflow
- Use hexadecimal colors only, such as #222222`;

    const userPrompt = `Design the illustration and programmatic text layout for page ${params.pageNumber} of ${params.totalPages} of a ${params.generatorType}.

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

MANDATORY EXACT TEXT MANIFEST:
${exactTextManifest}

Return the JSON layout only. Put every mandatory text string in textOverlay and keep fluxPrompt strictly illustration-only. Design a flat, edge-to-edge, print-ready portrait page with safe margins, readable blank content zones, complete functional activity areas, and no mockup, desk, hands, photographed paper, or surrounding scene.`;

    const result = await invokeLLM({
      model: "openai/gpt-4o",
      maxTokens: 3500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "educational_page_layout",
          strict: true,
          schema: {
            type: "object",
            properties: {
              fluxPrompt: { type: "string" },
              textOverlay: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    x: { type: "number" },
                    y: { type: "number" },
                    fontSize: { type: "number" },
                    fontWeight: { type: "string", enum: ["normal", "bold"] },
                    color: { type: "string" },
                    align: { type: "string", enum: ["left", "center", "right"] },
                    maxWidth: { anyOf: [{ type: "number" }, { type: "null" }] },
                  },
                  required: [
                    "text",
                    "x",
                    "y",
                    "fontSize",
                    "fontWeight",
                    "color",
                    "align",
                    "maxWidth",
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ["fluxPrompt", "textOverlay"],
            additionalProperties: false,
          },
        },
      },
    });

    const layout = parseHybridPageLayout(extractTextContent(result));
    assertOverlayIncludesExactText(layout.textOverlay, requiredText);
    const trimmedFluxPrompt = layout.fluxPrompt.trim().replace(/[.\s]+$/, "");
    const prompt = `${trimmedFluxPrompt}. ${NO_TEXT_SUFFIX}`;
    const { buffer: rawBuffer } = await generatePageImage(prompt, {
      aspectRatio: "3:4",
      raw: true,
    });
    const metadata = await sharp(rawBuffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("FLUX image dimensions were unavailable for text compositing");
    }

    const svgBuffer = buildTextOverlaySvg(
      layout.textOverlay,
      metadata.width,
      metadata.height
    );
    const compositedBuffer = await sharp(rawBuffer)
      .composite([{ input: svgBuffer }])
      .jpeg({ quality: 90, progressive: true })
      .toBuffer();
    const { url: imageUrl } = await storagePut(
      `pages/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`,
      compositedBuffer,
      "image/jpeg"
    );

    return { imageUrl, buffer: compositedBuffer, prompt };
  } catch (error) {
    console.warn(
      "Hybrid page rendering failed; falling back to legacy full-page FLUX rendering:",
      error instanceof Error ? error.message : error
    );
    return generateLegacyFullPageImage(
      params,
      exactTextManifest,
      creativeDirection,
      customDirectionRule
    );
  }
}

/**
 * Generate a single page image and return the buffer.
 */
export async function generatePageImage(
  prompt: string,
  options: { aspectRatio?: string; raw?: boolean } = {}
): Promise<{ imageUrl: string; buffer: Buffer }> {
  const result = await generateImage({ prompt, aspectRatio: options.aspectRatio });
  if (!result.url) {
    throw new Error("Image generation returned no URL");
  }
  const buffer = options.raw
    ? await fetchRawImageBuffer(result.url)
    : await fetchImageBuffer(result.url);
  return { imageUrl: result.url, buffer };
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
export async function finalizePdf(job: GenerationJob): Promise<void> {
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
      pageContents.push({ imageBuffer: buffer });
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
