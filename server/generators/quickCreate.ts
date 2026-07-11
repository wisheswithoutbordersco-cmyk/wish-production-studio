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
  "no text, no words, no letters, no numbers, no writing, no captions, no labels, no watermark, no signature, no blur, no distortion, no artifacts";

// ─── Types ───────────────────────────────────────────────────────────────────

type PageType = "coloring-page" | "text-heavy";

interface ContentItem {
  type: "question" | "instruction" | "activity" | "fill-blank" | "matching" | "bingo-header" | "list-item";
  text: string;
}

interface PageContent {
  pageType: PageType;
  title: string;
  subtitle: string;
  items: ContentItem[];
  borderPrompt: string;
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

  return { prompt: prompt.slice(0, 2000), pageCount, gradeLevel: gradeLevel.slice(0, 100) };
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

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isColoringRequest(prompt: string): boolean {
  return /\b(?:coloring|colouring|line art|colour-in|color-in|coloring book|coloring page)\b/i.test(prompt);
}

// ─── Content Generation (LLM) ───────────────────────────────────────────────

async function generatePageContent(
  options: NormalizedOptions,
  pageIndex: number,
  totalPages: number
): Promise<PageContent> {
  const lowerPrompt = options.prompt.toLowerCase();

  // For coloring pages, skip content generation entirely
  if (isColoringRequest(options.prompt)) {
    return {
      pageType: "coloring-page",
      title: "",
      subtitle: "",
      items: [],
      borderPrompt: `Simple black-and-white line art coloring page illustration based on: ${options.prompt}. Thick clean outlines, no shading, no color, no background clutter. Kid-friendly for ${options.gradeLevel}. Centered on the page, high contrast, printable, vector-like. Page ${pageIndex + 1} of ${totalPages} with a unique scene.`,
    };
  }

  // For text-heavy pages, use LLM to generate structured content + border prompt
  const systemPrompt = `You are a professional educational content creator for printable worksheets and activity pages.
Given a user's request, generate structured page content AND a decorative border description.

RULES:
- Generate real, accurate, educational content appropriate for the grade level
- Create 5-8 items per page (questions, activities, fill-in-the-blank, etc.)
- Each item should be a complete, properly spelled sentence or instruction
- The borderPrompt describes ONLY decorative art for the page border/frame - NO TEXT in the border
- The border should have an empty white center (the text goes there programmatically)
- Make each page unique if multiple pages are requested

Return JSON only.`;

  const userPrompt = `User request: ${options.prompt}
Grade level: ${options.gradeLevel}
Page ${pageIndex + 1} of ${totalPages}

Generate the structured content for this page.`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "page_content",
          strict: true,
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              subtitle: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: {
                      type: "string",
                      enum: ["question", "instruction", "activity", "fill-blank", "matching", "bingo-header", "list-item"],
                    },
                    text: { type: "string" },
                  },
                  required: ["type", "text"],
                  additionalProperties: false,
                },
              },
              borderDescription: { type: "string" },
            },
            required: ["title", "subtitle", "items", "borderDescription"],
            additionalProperties: false,
          },
        },
      },
    });

    const parsed = JSON.parse(extractLlmText(result));
    const title = String(parsed.title || "").trim();
    const subtitle = String(parsed.subtitle || "").trim();
    const items: ContentItem[] = Array.isArray(parsed.items)
      ? parsed.items.map((item: any) => ({
          type: String(item.type || "question"),
          text: String(item.text || "").trim(),
        })).filter((item: ContentItem) => item.text.length > 0)
      : [];
    const borderDesc = String(parsed.borderDescription || "colorful decorative border").trim();

    if (!title || items.length === 0) {
      throw new Error("LLM returned empty content");
    }

    return {
      pageType: "text-heavy",
      title,
      subtitle,
      items,
      borderPrompt: `Beautiful decorative border frame illustration: ${borderDesc}. The border is ornate and colorful around all four edges. The CENTER of the image is completely empty white space - only decorative art around the edges forming a frame. Portrait orientation, 8.5x11 inch proportions. Professional printable quality.`,
    };
  } catch (error) {
    console.warn(`Content generation failed for page ${pageIndex + 1}, using fallback:`, error);
    return buildFallbackContent(options, pageIndex, totalPages);
  }
}

function buildFallbackContent(
  options: NormalizedOptions,
  pageIndex: number,
  totalPages: number
): PageContent {
  return {
    pageType: "text-heavy",
    title: options.prompt.slice(0, 60),
    subtitle: `${options.gradeLevel} • Page ${pageIndex + 1} of ${totalPages}`,
    items: [
      { type: "instruction", text: "Complete the activities below." },
      { type: "question", text: "Question 1: ___________________________" },
      { type: "question", text: "Question 2: ___________________________" },
      { type: "question", text: "Question 3: ___________________________" },
      { type: "question", text: "Question 4: ___________________________" },
      { type: "question", text: "Question 5: ___________________________" },
    ],
    borderPrompt: `Beautiful colorful decorative border frame with educational theme elements. The CENTER is completely empty white space. Only ornate decorative art around all four edges. Portrait 8.5x11 proportions. Professional printable quality.`,
  };
}

// ─── SVG Text Overlay Builder ────────────────────────────────────────────────

function buildContentSvg(content: PageContent): Buffer {
  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}">`);

  // White content panel (inset from edges to show border)
  const margin = 200;
  const panelW = PAGE_WIDTH - margin * 2;
  const panelH = PAGE_HEIGHT - margin * 2;
  lines.push(`<rect x="${margin}" y="${margin}" width="${panelW}" height="${panelH}" rx="20" fill="white" fill-opacity="0.93"/>`);

  const leftX = margin + 80;
  const centerX = PAGE_WIDTH / 2;
  const maxTextWidth = panelW - 160;
  let y = margin + 140;

  // Title
  if (content.title) {
    lines.push(`<text x="${centerX}" y="${y}" font-family="DejaVu Sans, Arial, sans-serif" font-size="100" font-weight="bold" fill="#1a1a1a" text-anchor="middle">${escapeXml(content.title)}</text>`);
    y += 80;
  }

  // Subtitle
  if (content.subtitle) {
    lines.push(`<text x="${centerX}" y="${y}" font-family="DejaVu Sans, Arial, sans-serif" font-size="50" fill="#555" text-anchor="middle">${escapeXml(content.subtitle)}</text>`);
    y += 60;
  }

  // Divider line
  y += 20;
  lines.push(`<line x1="${leftX}" y1="${y}" x2="${PAGE_WIDTH - margin - 80}" y2="${y}" stroke="#ddd" stroke-width="2"/>`);
  y += 60;

  // Content items
  const itemSpacing = Math.min(200, Math.floor((PAGE_HEIGHT - margin - 300 - y) / Math.max(content.items.length, 1)));

  for (const item of content.items) {
    if (y > PAGE_HEIGHT - margin - 200) break; // Don't overflow

    const fontSize = item.type === "instruction" ? 42 : 46;
    const fill = item.type === "instruction" ? "#666" : "#222";
    const weight = item.type === "instruction" ? "normal" : "normal";

    // Word wrap long text
    const words = item.text.split(" ");
    let currentLine = "";
    const wrappedLines: string[] = [];
    const charsPerLine = Math.floor(maxTextWidth / (fontSize * 0.55));

    for (const word of words) {
      if ((currentLine + " " + word).trim().length > charsPerLine) {
        if (currentLine) wrappedLines.push(currentLine.trim());
        currentLine = word;
      } else {
        currentLine = currentLine ? currentLine + " " + word : word;
      }
    }
    if (currentLine) wrappedLines.push(currentLine.trim());

    for (const line of wrappedLines) {
      if (y > PAGE_HEIGHT - margin - 200) break;
      lines.push(`<text x="${leftX}" y="${y}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`);
      y += fontSize + 12;
    }

    // Add answer line for questions
    if (item.type === "question" || item.type === "fill-blank") {
      y += 10;
      lines.push(`<line x1="${leftX + 40}" y1="${y}" x2="${PAGE_WIDTH - margin - 120}" y2="${y}" stroke="#999" stroke-width="1.5" stroke-dasharray="6,4"/>`);
      y += 20;
    }

    y += Math.max(itemSpacing - (wrappedLines.length * (fontSize + 12)) - 30, 20);
  }

  // Branding at bottom
  lines.push(`<text x="${centerX}" y="${PAGE_HEIGHT - margin + 50}" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" fill="#bbb" text-anchor="middle">WishesWithoutBordersCo</text>`);

  lines.push("</svg>");
  return Buffer.from(lines.join("\n"));
}

// ─── Image Generation & Compositing ─────────────────────────────────────────

async function generateBorderImage(borderPrompt: string): Promise<Buffer> {
  const fullPrompt = `${borderPrompt}\n\nNegative prompt: ${NEGATIVE_PROMPT}`;
  const { buffer } = await generatePageImage(fullPrompt, {
    aspectRatio: "3:4",
    raw: true,
  });
  // Resize to page dimensions
  return sharp(buffer)
    .resize(PAGE_WIDTH, PAGE_HEIGHT, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
}

async function generateColoringPage(prompt: string): Promise<Buffer> {
  const fullPrompt = `${prompt}\n\nNegative prompt: ${NEGATIVE_PROMPT}`;
  const { buffer } = await generatePageImage(fullPrompt, {
    aspectRatio: "3:4",
    raw: true,
  });
  // B&W post-processing pipeline from reference docs
  const cleaned = await sharp(buffer)
    .rotate()
    .flatten({ background: "#ffffff" })
    .grayscale()
    .threshold(128)
    .sharpen()
    .median(2)
    .png()
    .toBuffer();

  // Resize and center on page
  const metadata = await sharp(cleaned).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Image dimensions unavailable");

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

async function generateTextHeavyPage(content: PageContent): Promise<Buffer> {
  // Step 1: Generate decorative border from Flux
  const borderBuffer = await generateBorderImage(content.borderPrompt);

  // Step 2: Build SVG text overlay from structured content
  const svgBuffer = buildContentSvg(content);

  // Step 3: Composite text over border
  return sharp(borderBuffer)
    .composite([{ input: svgBuffer, top: 0, left: 0 }])
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

  // Step 1: Generate structured content via LLM
  const content = await generatePageContent(options, pageIndex, job.totalPages);

  // Step 2: Generate the image based on page type
  let finalBuffer: Buffer;
  if (content.pageType === "coloring-page") {
    finalBuffer = await generateColoringPage(content.borderPrompt);
  } else {
    finalBuffer = await generateTextHeavyPage(content);
  }

  // Step 3: Upload to storage
  const { url: imageUrl } = await storagePut(
    `pages/quick-create/${job.id}/page-${String(pageNumber).padStart(3, "0")}.png`,
    finalBuffer,
    "image/png"
  );

  return {
    pageNumber,
    imageUrl,
    status: "success",
    metadata: { pageType: content.pageType },
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
