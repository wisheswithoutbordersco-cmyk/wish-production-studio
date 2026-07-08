/**
 * Workbook Generator
 *
 * Strategy:
 * - COVER page: Full-page AI illustration with title overlay
 * - CONTENT pages: Full-page AI illustration (soft/muted) with text overlaid
 *   inside semi-transparent white panels for readability.
 *
 * This approach produces sellable educational products because:
 * 1. Every page has a beautiful themed AI illustration (edge-to-edge)
 * 2. Text is always perfectly readable (black on white/light panels)
 * 3. Activities have proper spacing for kids to write answers
 * 4. Placeholder text is scrubbed automatically
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
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const SUBJECT_PROMPTS: Record<string, string[]> = {
  "Math": [
    "colorful educational illustration with geometric shapes, counting objects, and number patterns",
    "playful math activity scene with measuring tools, graphs, and mathematical symbols",
    "fun arithmetic illustration with groups of themed objects for counting and addition",
    "geometry exploration scene with various shapes, angles, and spatial patterns",
    "math word problem illustration showing a real-world scenario with themed characters",
  ],
  "Reading": [
    "cozy reading scene with open books, story characters, and imagination elements",
    "phonics activity illustration with letter sounds and picture clues",
    "reading comprehension scene with story elements and setting details",
    "vocabulary building illustration with labeled objects and word connections",
    "story sequencing scene with clear beginning, middle, and end visual elements",
  ],
  "Writing": [
    "creative writing inspiration scene with story starters and imagination elements",
    "handwriting practice illustration with themed decorative borders",
    "journal writing scene with prompts and creative elements",
    "letter writing illustration with envelope and friendly message elements",
    "poetry writing scene with nature elements and creative imagery",
  ],
  "Science": [
    "science exploration illustration with magnifying glass and nature observation",
    "simple experiment scene with safe lab equipment and discovery elements",
    "life cycle illustration showing growth stages of a plant or animal",
    "weather and seasons scene with clouds, sun, rain, and seasonal changes",
    "animal habitat illustration showing ecosystem with diverse creatures",
  ],
  "Social Studies": [
    "community helpers illustration showing diverse workers in their roles",
    "map and geography scene with landmarks and exploration elements",
    "cultural celebration illustration showing diverse traditions",
    "historical timeline scene with important events and diverse figures",
    "citizenship and kindness illustration showing children helping community",
  ],
  "Art": [
    "art studio scene with paint brushes, easels, and creative tools",
    "color mixing illustration showing primary and secondary colors blending",
    "art history inspired scene with famous art styles",
    "craft activity illustration with scissors, paper, and creative materials",
    "pattern and design scene with repeating motifs and symmetry",
  ],
  "SEL/Emotions": [
    "emotions identification scene with diverse children showing different feelings",
    "friendship and kindness illustration with children cooperating",
    "self-regulation scene with calming strategies and mindfulness",
    "growth mindset illustration showing persistence and achievement",
    "empathy and understanding scene with diverse characters",
  ],
  "Back to School": [
    "first day of school illustration with backpack and excited children",
    "classroom setup scene with desks, books, and decorations",
    "school rules illustration with friendly visual reminders",
    "making friends scene with diverse children introducing themselves",
    "school supply organization illustration with labeled materials",
  ],
  "Summer Review": [
    "summer learning scene with outdoor activities and educational elements",
    "vacation journal illustration with travel and discovery themes",
    "summer reading scene with books and relaxing outdoor setting",
    "outdoor math illustration with nature counting and patterns",
    "summer science exploration with insects, plants, and observation",
  ],
};

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
    // Cover page — full AI illustration
    const coverPrompt = buildImagePrompt({
      subject: `book cover illustration for "${opts.coverTitle || opts.subject + ' Workbook'}", ${getThemeModifier(opts.theme)}`,
      additionalDetails: `professional educational workbook cover design, vibrant and appealing, ${getGradeLevelModifier(opts.gradeLevel)}`,
    });
    const { imageUrl } = await generatePageImage(coverPrompt);
    return { pageNumber: 1, imageUrl, status: "success", metadata: { isCover: true } };
  }

  // Activity pages — generate AI background image + GPT content
  const subjectPrompts = SUBJECT_PROMPTS[opts.subject] || SUBJECT_PROMPTS["Math"];
  const subjectPrompt = subjectPrompts[(pageIndex - 1) % subjectPrompts.length];
  const prompt = buildImagePrompt({
    subject: `${subjectPrompt}, ${getThemeModifier(opts.theme)}`,
    additionalDetails: `educational activity page illustration with soft muted colors to allow text overlay, ${getGradeLevelModifier(opts.gradeLevel)}, suitable for a ${opts.subject} workbook, the lower 60% should be lighter for text readability`,
  });
  const { imageUrl } = await generatePageImage(prompt);

  // Generate educational activity content
  const activityContent = await generateWorkbookActivity(opts, pageIndex - 1);

  return {
    pageNumber: pageIndex + 1,
    imageUrl,
    status: "success",
    metadata: { activityContent },
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
 * Assemble the workbook PDF with AI backgrounds and readability panels.
 * Every content page has a full-page AI illustration with text overlaid
 * inside semi-transparent white panels.
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
    const pageContents: PageContent[] = [];

    for (const page of successPages) {
      const buffer = await fetchImageBuffer(page.imageUrl);

      if (page.metadata?.isCover) {
        // Cover page — full AI image with title overlay
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
              backgroundColor: "rgba(0,0,0,0.35)",
              padding: 8,
              radius: 6,
            },
            {
              text: `Grade: ${opts.gradeLevel}`,
              x: MARGIN,
              y: 355,
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
        // CONTENT PAGE — Full AI background + white readability panels
        // ═══════════════════════════════════════════════════════════════════
        const ac = page.metadata?.activityContent || {};
        const contentBlocks: NonNullable<PageContent["contentBlocks"]> = [];

        // ── Title panel at top ──
        contentBlocks.push({
          text: scrubPlaceholders(ac.pageTitle) || "Activity",
          x: MARGIN - 10,
          y: 24,
          width: CONTENT_WIDTH + 20,
          fontSize: 18,
          font: "bold",
          align: "center",
          fontColor: "#1a1a1a",
          backgroundColor: "rgba(255,255,255,0.92)",
          padding: 12,
          radius: 8,
        });

        // ── Educational purpose ──
        contentBlocks.push({
          text: scrubPlaceholders(ac.educationalPurpose) || "",
          x: MARGIN,
          y: 72,
          width: CONTENT_WIDTH,
          fontSize: 9,
          font: "normal",
          align: "center",
          fontColor: "#555555",
          backgroundColor: "rgba(255,255,255,0.85)",
          padding: 6,
          radius: 4,
        });

        // ── Instructions panel ──
        contentBlocks.push({
          text: scrubPlaceholders(ac.instructions) || "Complete the activity below.",
          x: MARGIN,
          y: 100,
          width: CONTENT_WIDTH,
          fontSize: 12,
          font: "bold",
          align: "left",
          fontColor: "#1a1a1a",
          backgroundColor: "rgba(255,255,255,0.93)",
          padding: 12,
          radius: 6,
        });

        // ── Activity items in a large white panel ──
        const rawItems: string[] = Array.isArray(ac.activityItems) ? ac.activityItems : [];
        const items = rawItems
          .map((it) => scrubPlaceholders(it))
          .filter((it): it is string => !!it && it.trim().length > 0);

        // Build all items into one panel for clean readability
        const ITEMS_START_Y = 148;
        const itemCount = Math.max(items.length, 1);
        const spacing = Math.min(90, (PAGE_HEIGHT - 120 - ITEMS_START_Y) / itemCount);

        items.forEach((item: string, idx: number) => {
          const yPos = ITEMS_START_Y + idx * spacing;

          // Numbered item with answer line
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
            backgroundColor: "rgba(255,255,255,0.90)",
            padding: 10,
            radius: 6,
          });

          // Answer line
          contentBlocks.push({
            text: "________________________________________",
            x: MARGIN + 20,
            y: yPos + 34,
            width: CONTENT_WIDTH - 40,
            fontSize: 11,
            font: "normal",
            align: "left",
            fontColor: "#999999",
            backgroundColor: "rgba(255,255,255,0.80)",
            padding: 4,
            radius: 4,
          });
        });

        // ── Footer info ──
        contentBlocks.push({
          text: `${opts.subject} | ${opts.theme} | ${opts.gradeLevel}`,
          x: MARGIN,
          y: PAGE_HEIGHT - 40,
          width: CONTENT_WIDTH,
          fontSize: 8,
          font: "normal",
          align: "center",
          fontColor: "#555555",
          backgroundColor: "rgba(255,255,255,0.85)",
          padding: 6,
          radius: 4,
        });

        pageContents.push({
          imageBuffer: buffer,
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
