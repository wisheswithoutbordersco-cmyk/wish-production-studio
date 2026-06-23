/**
 * Workbook Generator — v3 (Clean Programmatic Design)
 *
 * Strategy:
 * - COVER page: Full-page AI illustration with title overlay (beautiful, eye-catching)
 * - CONTENT pages: NO AI images. Clean white pages with colored header bars,
 *   well-spaced activity items, answer lines, and professional typography.
 *   Looks like a real Canva-designed workbook, not a PowerPoint slide.
 *
 * This approach produces sellable educational products because:
 * 1. Text is always perfectly readable (black on white, no background noise)
 * 2. Layout is consistent and professional across all pages
 * 3. Activities have proper spacing for kids to write answers
 * 4. Only the cover uses AI art (where it matters for first impressions)
 */
import { buildImagePrompt, generatePageImage, generateContent } from "./shared";
import { createJob, getJob, updateJob, addPageResult, type GenerationJob, type PageResult } from "../jobs";
import { assemblePdf, fetchImageBuffer, PageContent } from "../pdfAssembly";
import { storagePut } from "../storage";

export interface WorkbookOptions {
  subject: string;
  gradeLevel: string;
  pageCount: number;
  theme: string;
  coverTitle?: string;
  authorName?: string;
  includeAnswerKey: boolean;
  includeLicensePage: boolean;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2; // 512

// Color schemes per theme for the header bars and accents
const THEME_COLORS: Record<string, { primary: string; secondary: string; accent: string }> = {
  "Multicultural Kids": { primary: "#2E86AB", secondary: "#A23B72", accent: "#F18F01" },
  "African Heritage": { primary: "#8B4513", secondary: "#DAA520", accent: "#228B22" },
  "Caribbean Fun": { primary: "#00BCD4", secondary: "#FF6F00", accent: "#4CAF50" },
  "Space Adventure": { primary: "#1A237E", secondary: "#7C4DFF", accent: "#00E5FF" },
  "Ocean Explorer": { primary: "#006064", secondary: "#0097A7", accent: "#00BFA5" },
  "Jungle Safari": { primary: "#33691E", secondary: "#F57F17", accent: "#795548" },
  "Dinosaurs": { primary: "#4E342E", secondary: "#FF6F00", accent: "#689F38" },
};

function getColors(theme: string) {
  return THEME_COLORS[theme] || THEME_COLORS["Multicultural Kids"];
}

function getThemeModifier(theme: string): string {
  const modifiers: Record<string, string> = {
    "Multicultural Kids": "featuring diverse multicultural children of various ethnicities",
    "African Heritage": "featuring African heritage elements, Adinkra patterns, and African-inspired design",
    "Caribbean Fun": "featuring Caribbean tropical elements, vibrant island colors, and Caribbean culture",
    "Space Adventure": "with outer space theme, rockets, planets, stars, and astronaut elements",
    "Ocean Explorer": "with underwater ocean theme, sea creatures, coral reefs, and marine elements",
    "Jungle Safari": "with jungle safari theme, wild animals, tropical plants, and adventure elements",
    "Dinosaurs": "with prehistoric dinosaur theme, fossils, volcanoes, and paleontology elements",
  };
  return modifiers[theme] || modifiers["Multicultural Kids"];
}

function getGradeLevelModifier(gradeLevel: string): string {
  if (gradeLevel.includes("Pre-K") || gradeLevel.includes("K")) {
    return "very simple, bold, child-friendly with large elements suitable for ages 3-5";
  }
  if (gradeLevel.includes("1") || gradeLevel.includes("2")) {
    return "simple and engaging with clear elements suitable for ages 6-7";
  }
  if (gradeLevel.includes("3") || gradeLevel.includes("4")) {
    return "moderately detailed and engaging suitable for ages 8-9";
  }
  return "detailed and sophisticated suitable for ages 10-12";
}

/**
 * Removes raw AI placeholder text.
 */
function scrubPlaceholders(input?: string): string {
  if (!input || typeof input !== "string") return "";
  let out = input;
  out = out.replace(/\[[^\]]*\]/g, " ");
  out = out.replace(/\((?:[^)]*?(?:insert|picture|image|illustration|photo)[^)]*?)\)/gi, " ");
  out = out.replace(/\b(?:picture|image|illustration|photo)\s+of\b[^.,;:\n]*/gi, " ");
  out = out.replace(/\s{2,}/g, " ").trim();
  return out;
}

/**
 * Generate educational activity content for a workbook page using GPT.
 */
async function generateWorkbookActivity(opts: WorkbookOptions, pageIndex: number): Promise<{
  pageTitle: string;
  educationalPurpose: string;
  instructions: string;
  activityItems: string[];
}> {
  const systemPrompt = `You are an expert educator creating engaging workbook activities for ${opts.gradeLevel} students.
Subject: ${opts.subject}. Theme: ${opts.theme}.
Each activity must be educational, age-appropriate, and clearly structured.
Activities must be completable with pencil and paper only.`;

  const userPrompt = `Create a workbook activity page (page ${pageIndex + 1}) for:
- Subject: ${opts.subject}
- Grade: ${opts.gradeLevel}
- Theme: ${opts.theme}

Return a JSON object:
{
  "pageTitle": "Short engaging title (max 6 words)",
  "educationalPurpose": "One sentence: what skill this develops",
  "instructions": "Clear 1-sentence instruction for the student",
  "activityItems": ["Item 1", "Item 2", "Item 3", "Item 4", "Item 5"]
}

RULES:
- Each activityItem must be a complete, self-contained text activity (question, fill-in-blank, matching, or reflection prompt)
- Use ___ for blanks where kids write answers
- For Math: include actual problems like "7 + 5 = ___" or word problems
- For Reading: include comprehension questions or vocabulary exercises
- For SEL/Emotions: include scenarios and reflection prompts
- NEVER include placeholder text like "[Picture of...]" or "(insert image)"
- Keep items concise — one line each ideally
- Make each page DIFFERENT from others (vary activity types)`;

  const content = await generateContent({
    systemPrompt,
    userPrompt,
    responseFormat: { type: "json_object" },
  });

  try {
    const parsed = JSON.parse(content);
    return {
      pageTitle: parsed.pageTitle || `Activity ${pageIndex + 1}`,
      educationalPurpose: parsed.educationalPurpose || `Develop ${opts.subject} skills`,
      instructions: parsed.instructions || "Complete the activity below.",
      activityItems: Array.isArray(parsed.activityItems) ? parsed.activityItems.slice(0, 6) : [],
    };
  } catch {
    return {
      pageTitle: `${opts.subject} Activity ${pageIndex + 1}`,
      educationalPurpose: `Practice ${opts.subject} skills`,
      instructions: "Complete each activity below.",
      activityItems: Array.from({ length: 5 }, (_, i) => `${i + 1}. ___________________________________________`),
    };
  }
}

async function generateWorkbookPage(pageIndex: number, job: GenerationJob): Promise<PageResult> {
  const opts = job.options as WorkbookOptions;

  if (pageIndex === 0) {
    // Cover page — the ONLY page that uses AI image generation
    const coverPrompt = buildImagePrompt({
      subject: `book cover illustration for "${opts.coverTitle || opts.subject + ' Workbook'}", ${getThemeModifier(opts.theme)}`,
      additionalDetails: `professional educational workbook cover design, vibrant and appealing, ${getGradeLevelModifier(opts.gradeLevel)}, filling the entire canvas edge-to-edge with no borders or frames`,
    });
    const { imageUrl } = await generatePageImage(coverPrompt);
    return { pageNumber: 1, imageUrl, status: "success", metadata: { isCover: true } };
  }

  // Content pages — NO AI image needed. Just generate the activity content.
  const activityContent = await generateWorkbookActivity(opts, pageIndex - 1);

  return {
    pageNumber: pageIndex + 1,
    imageUrl: "", // No image for content pages
    status: "success",
    metadata: { activityContent, isContentPage: true },
  };
}

/**
 * Custom chunk processor for workbooks.
 */
async function processWorkbookChunkInternal(job: GenerationJob): Promise<void> {
  const PAGES_PER_CHUNK = 2;
  const startIndex = job.nextPageIndex;
  const endIndex = Math.min(startIndex + PAGES_PER_CHUNK, job.totalPages);

  updateJob(job.id, {
    status: "generating",
    statusMessage: `Generating workbook pages ${startIndex + 1}-${endIndex} of ${job.totalPages}...`,
  });

  for (let i = startIndex; i < endIndex; i++) {
    try {
      const result = await generateWorkbookPage(i, job);
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
    await finalizeWorkbookPdf(updatedJob);
  }
}

/**
 * Assemble the workbook PDF with clean programmatic design.
 * Content pages use NO background images — just clean typography and colored accents.
 */
async function finalizeWorkbookPdf(job: GenerationJob): Promise<void> {
  updateJob(job.id, { statusMessage: "Assembling workbook PDF..." });

  const successPages = job.pageResults.filter(r => r.status === "success");
  if (successPages.length === 0) {
    updateJob(job.id, { status: "error", errorMessage: "No pages were generated successfully." });
    return;
  }

  try {
    const opts = job.options as WorkbookOptions;
    const colors = getColors(opts.theme);
    const pageContents: PageContent[] = [];

    for (const page of successPages) {
      if (page.metadata?.isCover) {
        // Cover page — full AI image with title overlay
        const buffer = await fetchImageBuffer(page.imageUrl);
        pageContents.push({
          imageBuffer: buffer,
          contentBlocks: [
            {
              text: opts.coverTitle || `${opts.subject} Workbook`,
              x: MARGIN,
              y: 240,
              width: CONTENT_WIDTH,
              fontSize: 32,
              font: "bold",
              align: "center",
              fontColor: "#FFFFFF",
              backgroundColor: "rgba(0,0,0,0.5)",
              padding: 16,
              radius: 8,
            },
            {
              text: opts.theme,
              x: MARGIN,
              y: 310,
              width: CONTENT_WIDTH,
              fontSize: 16,
              font: "normal",
              align: "center",
              fontColor: "#FFFFFF",
            },
            {
              text: `Grade: ${opts.gradeLevel}`,
              x: MARGIN,
              y: 340,
              width: CONTENT_WIDTH,
              fontSize: 13,
              font: "normal",
              align: "center",
              fontColor: "#FFFFFF",
            },
            {
              text: opts.authorName || "WishesWithoutBordersCo",
              x: MARGIN,
              y: 700,
              width: CONTENT_WIDTH,
              fontSize: 11,
              font: "normal",
              align: "center",
              fontColor: "#FFFFFF",
            },
          ],
          pageNumber: 1,
          totalPages: job.totalPages,
        });
      } else {
        // ═══════════════════════════════════════════════════════════════════
        // CONTENT PAGE — Clean programmatic design, NO background image
        // ═══════════════════════════════════════════════════════════════════
        const ac = page.metadata?.activityContent || {};
        const contentBlocks: NonNullable<PageContent["contentBlocks"]> = [];

        // ── Header bar (colored banner across top) ──
        contentBlocks.push({
          text: scrubPlaceholders(ac.pageTitle) || "Activity",
          x: 0,
          y: 0,
          width: PAGE_WIDTH,
          fontSize: 20,
          font: "bold",
          align: "center",
          fontColor: "#FFFFFF",
          backgroundColor: colors.primary,
          padding: 18,
        });

        // ── Educational purpose (subtle line under header) ──
        contentBlocks.push({
          text: scrubPlaceholders(ac.educationalPurpose) || "",
          x: MARGIN,
          y: 58,
          width: CONTENT_WIDTH,
          fontSize: 9,
          font: "normal",
          align: "center",
          fontColor: "#666666",
          padding: 4,
        });

        // ── Instructions box (highlighted) ──
        contentBlocks.push({
          text: scrubPlaceholders(ac.instructions) || "Complete the activity below.",
          x: MARGIN,
          y: 88,
          width: CONTENT_WIDTH,
          fontSize: 12,
          font: "bold",
          align: "left",
          fontColor: "#1a1a1a",
          backgroundColor: "#F5F5F5",
          padding: 12,
          radius: 6,
        });

        // ── Activity items with generous spacing ──
        const rawItems: string[] = Array.isArray(ac.activityItems) ? ac.activityItems : [];
        const items = rawItems
          .map((it) => scrubPlaceholders(it))
          .filter((it): it is string => !!it && it.trim().length > 0);

        const ITEMS_START_Y = 140;
        const ITEMS_END_Y = PAGE_HEIGHT - 80;
        const itemCount = Math.max(items.length, 1);
        const spacing = Math.min((ITEMS_END_Y - ITEMS_START_Y) / itemCount, 120);

        items.forEach((item: string, idx: number) => {
          const yPos = ITEMS_START_Y + idx * spacing;

          // Item number circle + text
          const numberedItem = `${idx + 1}.  ${item}`;
          contentBlocks.push({
            text: numberedItem,
            x: MARGIN,
            y: yPos,
            width: CONTENT_WIDTH,
            fontSize: 12,
            font: "normal",
            align: "left",
            fontColor: "#1a1a1a",
            padding: 10,
          });

          // Answer line below each item
          contentBlocks.push({
            text: "________________________________________",
            x: MARGIN + 20,
            y: yPos + 32,
            width: CONTENT_WIDTH - 40,
            fontSize: 11,
            font: "normal",
            align: "left",
            fontColor: "#CCCCCC",
          });
        });

        // ── Footer accent bar ──
        contentBlocks.push({
          text: `${opts.subject} | ${opts.theme} | ${opts.gradeLevel}`,
          x: 0,
          y: PAGE_HEIGHT - 36,
          width: PAGE_WIDTH,
          fontSize: 8,
          font: "normal",
          align: "center",
          fontColor: "#FFFFFF",
          backgroundColor: colors.secondary,
          padding: 8,
        });

        pageContents.push({
          backgroundColor: "#FFFFFF",
          contentBlocks,
          pageNumber: page.pageNumber,
          totalPages: job.totalPages,
        });
      }
    }

    const pdfBuffer = await assemblePdf(pageContents);

    const { url: pdfUrl } = await storagePut(
      `products/${job.generatorType}/${job.filename}`,
      pdfBuffer,
      "application/pdf"
    );

    const coverUrl = successPages[0]?.imageUrl || null;

    updateJob(job.id, {
      status: successPages.length === job.totalPages ? "complete" : "partial",
      pdfUrl,
      coverImageUrl: coverUrl,
      statusMessage: "PDF ready for download!",
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "PDF assembly failed";
    updateJob(job.id, { status: "error", errorMessage: errorMsg });
  }
}

export function createWorkbookJob(options: WorkbookOptions): string {
  const totalPages = Math.max(5, options.pageCount + 1); // +1 for cover
  const job = createJob(
    "workbook",
    totalPages,
    options,
    `workbook-${options.subject.toLowerCase()}-${options.theme.toLowerCase().replace(/\s+/g, "-")}.pdf`
  );
  return job.id;
}

export async function processWorkbookChunk(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");
  await processWorkbookChunkInternal(job);
}
