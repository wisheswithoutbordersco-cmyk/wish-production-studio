/**
 * Workbook Generator
 * Generates multi-page educational activity workbooks using chunked generation.
 * Every page after cover has educational purpose stated via contentBlocks.
 *
 * Features:
 * - Cover page with title and branding
 * - Activity prompts/instructions as text overlays on each page
 * - Labels on emotion grids and activity sections
 * - Every page has educational purpose
 * - Minimum 5+ pages (cover + 4 content pages)
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

const SUBJECT_PROMPTS: Record<string, string[]> = {
  "Math": [
    "colorful math-themed illustration with geometric shapes, counting objects, and number patterns",
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

/**
 * Removes raw AI placeholder text such as "[Picture of 5 children ...]" or
 * "(insert image here)" from generated copy. The PDF requires that no raw
 * placeholder text ever reaches the page; activities must be real text content.
 */
function scrubPlaceholders(input?: string): string {
  if (!input || typeof input !== "string") return "";
  let out = input;
  // Remove [ ... ] placeholder brackets that describe an image.
  out = out.replace(/\[[^\]]*\]/g, " ");
  // Remove ( insert / picture / image ... ) style placeholders.
  out = out.replace(/\((?:[^)]*?(?:insert|picture|image|illustration|photo)[^)]*?)\)/gi, " ");
  // Remove leading "Picture of ..."/"Image of ..." fragments.
  out = out.replace(/\b(?:picture|image|illustration|photo)\s+of\b[^.,;:\n]*/gi, " ");
  // Collapse whitespace left behind.
  out = out.replace(/\s{2,}/g, " ").trim();
  return out;
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
 * Generate educational activity content for a workbook page using GPT.
 */
async function generateWorkbookActivity(opts: WorkbookOptions, pageIndex: number): Promise<{
  pageTitle: string;
  educationalPurpose: string;
  instructions: string;
  activityItems: string[];
  labels: Array<{ text: string; x: number; y: number }>;
}> {
  const systemPrompt = `You are an expert educator creating engaging workbook activities for ${opts.gradeLevel} students.
Subject: ${opts.subject}. Theme: ${opts.theme}.
Each activity must be educational, age-appropriate, and clearly structured.`;

  const userPrompt = `Create a workbook activity page (page ${pageIndex + 1}) for:
- Subject: ${opts.subject}
- Grade: ${opts.gradeLevel}
- Theme: ${opts.theme}

Return a JSON object:
{
  "pageTitle": "Short engaging title for this activity",
  "educationalPurpose": "One sentence: what skill this page develops",
  "instructions": "Clear instruction for the student (1-2 sentences)",
  "activityItems": ["Activity item 1 with ___ blanks or prompts", "Item 2...", "Item 3...", "Item 4...", "Item 5..."],
  "sectionLabels": ["Label 1", "Label 2"]
}

Make it unique from other pages. Include fill-in prompts, drawing prompts, matching, or reflection questions.
For SEL/Emotions: include emotion identification, coping strategies, or social scenarios.
For Math: include practice problems, word problems, or pattern activities.

CRITICAL RULES:
- NEVER output placeholder text describing an image, e.g. do NOT write "[Picture of 5 children]", "(insert image here)", or "Image of ...".
- Every activity item must be a complete, self-contained text activity the child can do with pencil and paper (questions, prompts, blanks, matching lines, or reflection).
- Do not reference an illustration that the worksheet does not contain.`;

  const content = await generateContent({
    systemPrompt,
    userPrompt,
    responseFormat: { type: "json_object" },
  });

  try {
    const parsed = JSON.parse(content);
    const sectionLabels: string[] = parsed.sectionLabels || [];
    // Position labels in the page margins
    const labels = sectionLabels.map((label: string, idx: number) => ({
      text: label,
      x: 50,
      y: 200 + idx * 200,
    }));

    return {
      pageTitle: parsed.pageTitle || `Activity ${pageIndex + 1}`,
      educationalPurpose: parsed.educationalPurpose || `Develop ${opts.subject} skills`,
      instructions: parsed.instructions || "Complete the activity below.",
      activityItems: Array.isArray(parsed.activityItems) ? parsed.activityItems.slice(0, 6) : [],
      labels,
    };
  } catch {
    return {
      pageTitle: `${opts.subject} Activity ${pageIndex + 1}`,
      educationalPurpose: `Practice ${opts.subject} skills`,
      instructions: "Complete each activity below.",
      activityItems: Array.from({ length: 5 }, (_, i) => `${i + 1}. ___________________________________________`),
      labels: [],
    };
  }
}

async function generateWorkbookPage(pageIndex: number, job: GenerationJob): Promise<PageResult> {
  const opts = job.options as WorkbookOptions;

  if (pageIndex === 0) {
    // Cover page
    const coverPrompt = buildImagePrompt({
      subject: `book cover illustration for "${opts.coverTitle || opts.subject + ' Workbook'}", ${getThemeModifier(opts.theme)}`,
      additionalDetails: `professional educational workbook cover design, vibrant and appealing, ${getGradeLevelModifier(opts.gradeLevel)}`,
    });
    const { imageUrl } = await generatePageImage(coverPrompt);
    return { pageNumber: 1, imageUrl, status: "success", metadata: { isCover: true } };
  }

  // Activity pages
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
 * Assemble the workbook PDF with educational content overlays.
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
        // Cover page
        pageContents.push({
          imageBuffer: buffer,
          contentBlocks: [
            {
              text: opts.coverTitle || `${opts.subject} Workbook`,
              x: 50,
              y: 250,
              width: PAGE_WIDTH - 100,
              fontSize: 28,
              font: "bold",
              align: "center",
              color: "#FFFFFF",
            },
            {
              text: opts.theme,
              x: 50,
              y: 295,
              width: PAGE_WIDTH - 100,
              fontSize: 16,
              font: "normal",
              align: "center",
              color: "#FFFFFF",
            },
            {
              text: `Grade: ${opts.gradeLevel}`,
              x: 50,
              y: 325,
              width: PAGE_WIDTH - 100,
              fontSize: 13,
              font: "normal",
              align: "center",
              color: "#FFFFFF",
            },
            {
              text: opts.authorName || "",
              x: 50,
              y: 700,
              width: PAGE_WIDTH - 100,
              fontSize: 11,
              font: "normal",
              align: "center",
              color: "#FFFFFF",
            },
          ],
          pageNumber: 1,
          totalPages: job.totalPages,
        });
      } else {
        // Activity page with educational content.
        // Every text element sits inside a solid/semi-transparent white panel so
        // black text is always readable over the decorative background image.
        const ac = page.metadata?.activityContent || {};
        const contentBlocks: NonNullable<PageContent["contentBlocks"]> = [];

        const PANEL = "rgba(255,255,255,0.92)";
        const PANEL_SOFT = "rgba(255,255,255,0.85)";
        const LEFT = 45;
        const PANEL_WIDTH = PAGE_WIDTH - LEFT * 2;

        // Header panel: title + educational purpose grouped on one solid band.
        contentBlocks.push({
          text: scrubPlaceholders(ac.pageTitle) || "Activity",
          x: LEFT,
          y: 44,
          width: PANEL_WIDTH,
          fontSize: 18,
          font: "bold",
          align: "center",
          fontColor: "#1a1a1a",
          backgroundColor: PANEL,
          padding: 10,
          radius: 6,
        });

        contentBlocks.push({
          text: `\u{1F4D6} ${scrubPlaceholders(ac.educationalPurpose) || ""}`,
          x: LEFT + 8,
          y: 82,
          width: PANEL_WIDTH - 16,
          fontSize: 9,
          font: "normal",
          align: "center",
          fontColor: "#555555",
          backgroundColor: PANEL_SOFT,
          padding: 6,
          radius: 4,
        });

        // Instructions panel.
        contentBlocks.push({
          text: scrubPlaceholders(ac.instructions) || "Complete the activity below.",
          x: LEFT,
          y: 116,
          width: PANEL_WIDTH,
          fontSize: 11,
          font: "bold",
          align: "left",
          fontColor: "#222222",
          backgroundColor: PANEL,
          padding: 8,
          radius: 4,
        });

        // Activity items spread across the full usable height so the lower half
        // of the page is never left blank. Each item gets its own readable panel.
        const rawItems: string[] = Array.isArray(ac.activityItems) ? ac.activityItems : [];
        const items = rawItems
          .map((it) => scrubPlaceholders(it))
          .filter((it): it is string => !!it && it.trim().length > 0);
        const ITEMS_TOP = 170;
        const ITEMS_BOTTOM = PAGE_HEIGHT - 60; // leave room for footer/page number
        const itemCount = Math.max(items.length, 1);
        const slot = (ITEMS_BOTTOM - ITEMS_TOP) / itemCount;
        items.forEach((item: string, idx: number) => {
          contentBlocks.push({
            text: item,
            x: LEFT,
            y: ITEMS_TOP + idx * slot,
            width: PANEL_WIDTH,
            fontSize: 12,
            font: "normal",
            align: "left",
            fontColor: "#1a1a1a",
            backgroundColor: PANEL,
            padding: 8,
            radius: 4,
          });
        });

        // Labels (section markers) get small white chips for readability too.
        const labels: Array<{ text: string; x: number; y: number }> = ac.labels || [];
        labels.forEach((l) => {
          contentBlocks.push({
            text: scrubPlaceholders(l.text) || "",
            x: l.x,
            y: l.y,
            width: 160,
            fontSize: 10,
            font: "bold",
            align: "left",
            fontColor: "#222222",
            backgroundColor: PANEL_SOFT,
            padding: 4,
            radius: 3,
          });
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
  // Ensure minimum 5 pages (cover + 4 activity pages)
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
