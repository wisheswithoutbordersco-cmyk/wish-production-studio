/**
 * Quick Create Generator
 * Minimal-input generator: just a prompt, page count, and grade level.
 * Uses the hybrid text rendering approach for all pages.
 */
import { generateFullPageImage, generateContent, customPromptInstruction, finalizePdf } from "./shared";
import { createJob, getJob, updateJob, addPageResult, type GenerationJob, type PageResult } from "../jobs";

export interface QuickCreateOptions {
  customPrompt: string;
  pageCount: number;
  gradeLevel: string;
}

/**
 * Generate content plan for all pages based on the user's prompt.
 */
async function generatePagePlan(opts: QuickCreateOptions): Promise<{
  title: string;
  pages: Array<{
    pageTitle: string;
    pageType: string;
    instructions: string;
    activityItems: string[];
  }>;
}> {
  const systemPrompt = `You are an expert educator and content designer.
Given a user's creative prompt, generate a structured content plan for an educational product.
The product is for ${opts.gradeLevel} students.
${customPromptInstruction(opts.customPrompt)}`;

  const userPrompt = `Create a content plan for ${opts.pageCount} pages based on this prompt:
"${opts.customPrompt}"

Grade Level: ${opts.gradeLevel}

Return JSON:
{
  "title": "Short product title (max 6 words)",
  "pages": [
    {
      "pageTitle": "Short page title",
      "pageType": "activity type (e.g., worksheet, matching, fill-in-blank, coloring, word search, maze, quiz, reflection)",
      "instructions": "Clear 1-sentence instruction",
      "activityItems": ["Item 1", "Item 2", "Item 3", "Item 4", "Item 5"]
    }
  ]
}

RULES:
- Generate exactly ${opts.pageCount} pages
- Each page should be a DIFFERENT activity type
- activityItems must be complete, self-contained text (questions, prompts, fill-in-blanks)
- Use ___ for blanks where students write answers
- For Math: include actual problems like "7 + 5 = ___"
- NEVER include placeholder text like "[Picture of...]"
- Make content age-appropriate for ${opts.gradeLevel}
- Vary difficulty across pages`;

  const content = await generateContent({
    systemPrompt,
    userPrompt,
    responseFormat: { type: "json_object" },
  });

  try {
    const parsed = JSON.parse(content);
    return {
      title: parsed.title || "Activity Book",
      pages: Array.isArray(parsed.pages)
        ? parsed.pages.slice(0, opts.pageCount)
        : Array.from({ length: opts.pageCount }, (_, i) => ({
            pageTitle: `Activity ${i + 1}`,
            pageType: "worksheet",
            instructions: "Complete the activity below.",
            activityItems: [`${i + 1}. ___________________________________________`],
          })),
    };
  } catch {
    return {
      title: "Activity Book",
      pages: Array.from({ length: opts.pageCount }, (_, i) => ({
        pageTitle: `Activity ${i + 1}`,
        pageType: "worksheet",
        instructions: "Complete the activity below.",
        activityItems: Array.from({ length: 5 }, (_, j) => `${j + 1}. ___________________________________________`),
      })),
    };
  }
}

/**
 * Generate a single page for the Quick Create product.
 */
async function generateQuickCreatePage(pageIndex: number, job: GenerationJob): Promise<PageResult> {
  const opts = job.options as QuickCreateOptions & { _plan?: Awaited<ReturnType<typeof generatePagePlan>> };
  const pageNumber = pageIndex + 1;

  // Generate plan on first page if not cached
  if (!opts._plan) {
    const plan = await generatePagePlan(opts);
    (job.options as any)._plan = plan;
  }
  const plan = (job.options as any)._plan as Awaited<ReturnType<typeof generatePagePlan>>;

  // Cover page
  if (pageIndex === 0) {
    const { imageUrl } = await generateFullPageImage({
      generatorType: "educational product",
      pageType: "front cover",
      pageNumber,
      totalPages: job.totalPages,
      audience: `${opts.gradeLevel} students`,
      creativeDirection: opts.customPrompt,
      customPrompt: opts.customPrompt,
      exactText: [plan.title, opts.gradeLevel, "WishesWithoutBordersCo"],
      layoutGuidance: "Create a high-impact portrait cover with the title as the dominant focal point, a clear grade level badge, integrated themed illustrations, and the brand at the bottom. Keep all text inside generous safe margins.",
      styleGuidance: "Premium educational publishing design with expressive display typography, polished supporting type, layered themed flourishes, cohesive color blocking, and a professional bookstore-ready finish.",
      functionalRequirements: [
        "The cover must read clearly at thumbnail size.",
        "Do not include worksheet questions or answer areas on the cover.",
      ],
    });
    return { pageNumber, imageUrl, status: "success", metadata: { isCover: true } };
  }

  // Activity pages
  const pageData = plan.pages[(pageIndex - 1) % plan.pages.length];
  const items = pageData.activityItems || [];
  const exactText = [
    pageData.pageTitle || `Activity ${pageIndex}`,
    `Instructions: ${pageData.instructions || "Complete the activity below."}`,
    ...items.flatMap((item, index) => [
      `${index + 1}. ${item}`,
      "Answer: ______________________________",
    ]),
    `${opts.gradeLevel} | Page ${pageNumber} of ${job.totalPages}`,
  ];

  const { imageUrl } = await generateFullPageImage({
    generatorType: "educational product",
    pageType: `${pageData.pageType} activity page ${pageIndex}`,
    pageNumber,
    totalPages: job.totalPages,
    audience: `${opts.gradeLevel} students`,
    creativeDirection: opts.customPrompt,
    customPrompt: opts.customPrompt,
    exactText,
    layoutGuidance: "Use a complete full-page worksheet composition: compact illustrated title banner at the top, instruction panel below it, then evenly spaced numbered activity cards filling the main page. Place a generous handwriting answer line directly beneath every activity item. Finish with a small grade/page footer.",
    styleGuidance: "Professional teacher-resource typography with a playful bold title, highly legible body text, clear hierarchy, themed icons and a friendly mascot integrated around the content without covering any words or answer spaces. Use coordinated borders, boxes, subtle patterns, and print-friendly colors.",
    functionalRequirements: [
      "Every question and answer line must fit fully on the page and remain easy to write on after printing.",
      "The activity content is primary; decoration must never overlap text or response areas.",
      "Preserve all underscores and mathematical symbols exactly.",
    ],
  });

  return { pageNumber, imageUrl, status: "success", metadata: { pageData } };
}

/**
 * Chunk processor for Quick Create jobs.
 */
async function processQuickCreateChunkInternal(job: GenerationJob): Promise<void> {
  const PAGES_PER_CHUNK = 1;
  const startIndex = job.nextPageIndex;
  const endIndex = Math.min(startIndex + PAGES_PER_CHUNK, job.totalPages);

  updateJob(job.id, {
    status: "generating",
    statusMessage: `Generating page ${startIndex + 1} of ${job.totalPages}...`,
  });

  for (let i = startIndex; i < endIndex; i++) {
    try {
      const result = await generateQuickCreatePage(i, job);
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

  const updatedJob = getJob(job.id);
  if (updatedJob && updatedJob.nextPageIndex >= updatedJob.totalPages) {
    await finalizePdf(updatedJob);
  }
}

export function createQuickCreateJob(options: QuickCreateOptions): string {
  const totalPages = options.pageCount + 1; // +1 for cover
  const job = createJob(
    "quick-create",
    totalPages,
    options,
    `quick-create-${Date.now()}.pdf`
  );
  return job.id;
}

export async function processQuickCreateChunk(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");
  await processQuickCreateChunkInternal(job);
}
