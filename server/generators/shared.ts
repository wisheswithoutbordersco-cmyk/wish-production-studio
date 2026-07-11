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

// Pages to generate per poll request (chunked pattern)
export const PAGES_PER_CHUNK = 2;

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

  const content = result.choices[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textPart = content.find((p): p is { type: "text"; text: string } => p.type === "text");
    return textPart?.text || "";
  }
  return "";
}

/**
 * Generate a single page image and return the buffer.
 */
export async function generatePageImage(prompt: string): Promise<{ imageUrl: string; buffer: Buffer }> {
  const result = await generateImage({ prompt });
  if (!result.url) {
    throw new Error("Image generation returned no URL");
  }
  const buffer = await fetchImageBuffer(result.url);
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
    // Build page contents for PDF.
    // fetchImageBuffer now auto-compresses images (JPEG 80%, max 2048px) so
    // even 30-page PDFs stay under Supabase's upload limit.
    const pageContents: PageContent[] = [];
    for (const page of successPages) {
      const buffer = await fetchImageBuffer(page.imageUrl);
      pageContents.push({
        imageBuffer: buffer,
        pageNumber: page.pageNumber,
        totalPages: job.totalPages,
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
