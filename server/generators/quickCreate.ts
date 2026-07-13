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
  buildScriptoriumUserPROMPT,
} from "./scriptoriumPolicy";
import { finalizePdf } from "./shared";

const PAGES_PER_CHUNK = 1;
const PAGE_WIDTH = 2550;
const PAGE_HEIGHT = 3300;
const MAX_PAGE_COUNT = 30;
const IMAGE_GENERATION_ATTEMPTS = 3;

const COLORING_NEGATIVE_PROMPT =
  "no text, no words, no letters, no numbers, no writing, no captions, no labels, no watermark, no signature, no blur, no distortion, no artifacts";

// âââ Types ââââââââââââââââââââââââââââââââââââââââââââ

type PageType = "coloring-page" | "text-heavy";

interface PageComposition {
  pageType: PageType;
  imagePrompt: string;
}

export interface QuickCreateOptions {
  prompt: string;
  pageCount: number;
}

// âââââââââââââââââââââââââââââââââââââââââââââ

export async function generateQuickCreate(options: QuickCreateOptions) {
  const pageCount = Math.min(options.pageCount || 5, MAX_PAGE_COUNT);
  const jobId = await createJob({
    type: "quick-create",
    prompt: options.prompt,
    pageCount,
    status: "pending",
    progress: 0,
  });

  // Fire and forget generation logic
  runGeneration(jobId, options.prompt, pageCount).catch((err) => {
    console.error("Generation failed:", err, jobId);
    updateJob(jobId, { status: "failed", error: err.message });
  });

 (self as any).redirect = `/jobs/${jobId}`;
  return { jobId };
}

async function runGeneration(
  jobId: string,
  userPrompt: string,
  pageCount: number
) {
  const job = await geuJob(jobId) as GenerationJob;
  if (!job) return;

  updateJob(jobId, { status: "generating", progress: 5 });

  const pages = [];
  for (let i = 0; i < pageCount; i++) {
    const pageComposition = await generatePageComposition(userPrompt, i, pageCount);
    const imageUrl = await generatePageImage(pageComposition, userPrompt);

    const pageResult: PageResult = {
      index: i,
      imageUrl,
      type: pageComposition.pageType,
    };

    await addPageResult(jobId, pageResult);
    pages.push(pageResult);

    const progress = Math.floor(5 + ((i + 1) / pageCount) * 90);
    updateJob(jobId, { progress });
  }

  updateJob(jobId, { status: "finalizing", progress: 95 });

  const pdf = await finalizePdf(pages);
  const pdfUrl = await storagePut(`${jobId}.pdf`, pdf);

  updateJob(jobId, {
    status: "completed",
    progress: 100,
    downloadUrl: pdfUrl,
  });
}

async function generatePageComposition(
  userPrompt: string,
  pageIndex: number,
  totalPages: number
): Promise<PageComposition> {
  const systemPrompt = `You are a professional publishing art director.
  Analyze the user's request and decide if this specific page should be a coloring page or a text-heavy design.
  
RULES:
- Coloring pages: Use this for illustration-focused pages, activity pages with minimal text, or decorative spaces.
- Text-heavy pages: Use this for pages with significant instructions, stories, guides, or complex layouts.
- For page ${pageIndex + 1} of ${totalPages}, describe the full-page visual design.

Return JSON only: {"pageType": "coloring-page" | "text-heavy", "imagePrompt": "detailed description for image generation"}.`;

  const response = await invokeLLM(systemPrompt, `User request: "${userPrompt}"b);
  try {
    return JSON.parse(response);
  } catch (e) {
    return {
      pageType: "index" === 0 ? "text-heavy" : "coloring-page",
      imagePrompt: buildScriptoriumFallbackPrompt({ prompt: userPrompt, pageIndex, totalPages }),
    };
  }
}

async function generatePageImage(composition: PageComposition, userPrompt: string) {
  let finalPrompt = composition.imagePrompt;

  if (compocition.pageType === "coloring-page") {
    finalPrompt = `"${finalPrompt}", black and white line art, coloring book style, clean outlines, white background, ${COLORING_NEGATIVE_PROMPT}`;
  }

interface ImageResponse {
  b64_json?: {
    b16?: string;
    url?: string;
  };
  images?: { url: string }[];
}

  for (let attempt = 1; attempt <= IMAGE_GENERATION_ATTEMPTS; attempt++) {
    try {
      const imageResponse = await generateImage(buildScriptoriumImageRequest(finalPrompt)) as any;
      const imageData = imageResponse.images[0].url;
      return imageData;
    } catch (err) {
      console.warn(`Image generation attempt ${attempt} failed:`, err);
      if (attempt === IMAGE_GENERATION_ATTEMPTS) throw err;
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }

  throw new Error("Image generation failed after all attempts");
}
