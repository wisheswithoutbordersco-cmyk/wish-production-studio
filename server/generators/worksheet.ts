/**
 * Worksheet Generator — v3 (Clean Programmatic Design)
 *
 * Strategy:
 * - COVER page: Full-page AI illustration with title overlay
 * - CONTENT pages: NO AI images. Clean white pages with colored header,
 *   well-spaced activity items, and professional typography.
 *   Each page is a different activity type (fill-in-blank, matching, etc.)
 */
import { buildImagePrompt, generatePageImage, generateContent } from "./shared";
import { createJob, getJob, updateJob, addPageResult, type GenerationJob, type PageResult } from "../jobs";
import { assemblePdf, fetchImageBuffer, PageContent } from "../pdfAssembly";
import { storagePut } from "../storage";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export interface WorksheetOptions {
  subject: string;
  specificSkill: string;
  gradeLevel: string;
  theme: string;
  quantity: number;
}

const SKILL_MAP: Record<string, string[]> = {
  "Math": ["Addition", "Subtraction", "Multiplication", "Division", "Fractions", "Telling Time", "Money", "Patterns", "Geometry", "Word Problems"],
  "Reading": ["Phonics", "Sight Words", "Reading Comprehension", "Vocabulary", "Sequencing", "Main Idea", "Context Clues"],
  "Writing": ["Handwriting", "Sentence Building", "Creative Writing", "Punctuation", "Grammar", "Spelling", "Paragraph Writing"],
  "Science": ["Life Cycles", "Weather", "Animals", "Plants", "Human Body", "Space", "Matter", "Energy"],
  "Social Studies": ["Community Helpers", "Maps", "History", "Culture", "Geography", "Government", "Economics"],
  "Art": ["Color Theory", "Drawing", "Patterns", "Symmetry", "Art History", "Mixed Media"],
  "Music": ["Rhythm", "Notes", "Instruments", "Composers", "Listening", "Singing"],
  "SEL": ["Emotions", "Friendship", "Kindness", "Self-Regulation", "Empathy", "Conflict Resolution", "Growth Mindset"],
};

const ACTIVITY_TYPES = [
  "fill-in-the-blank",
  "matching",
  "multiple-choice",
  "short-answer",
  "true-or-false",
  "ordering/sequencing",
];

// Color schemes per subject
const SUBJECT_COLORS: Record<string, { primary: string; secondary: string }> = {
  "Math": { primary: "#1565C0", secondary: "#42A5F5" },
  "Reading": { primary: "#6A1B9A", secondary: "#AB47BC" },
  "Writing": { primary: "#2E7D32", secondary: "#66BB6A" },
  "Science": { primary: "#E65100", secondary: "#FF9800" },
  "Social Studies": { primary: "#4E342E", secondary: "#8D6E63" },
  "Art": { primary: "#AD1457", secondary: "#EC407A" },
  "Music": { primary: "#283593", secondary: "#5C6BC0" },
  "SEL": { primary: "#00695C", secondary: "#26A69A" },
};

function getColors(subject: string) {
  return SUBJECT_COLORS[subject] || SUBJECT_COLORS["Math"];
}

function gradeToAgeRange(gradeLevel: string): string {
  if (gradeLevel.includes("Pre-K") || gradeLevel.includes("Preschool")) return "ages 3-5";
  if (gradeLevel.includes("K") || gradeLevel.includes("Kindergarten")) return "ages 5-6";
  if (gradeLevel.includes("1")) return "ages 6-7";
  if (gradeLevel.includes("2")) return "ages 7-8";
  if (gradeLevel.includes("3")) return "ages 8-9";
  if (gradeLevel.includes("4")) return "ages 9-10";
  if (gradeLevel.includes("5")) return "ages 10-11";
  if (gradeLevel.includes("6")) return "ages 11-12";
  return "ages 6-10";
}

/**
 * Generate age-appropriate worksheet content using GPT.
 */
async function generateWorksheetContent(opts: WorksheetOptions, pageVariant: number): Promise<{ title: string; instructions: string; items: string[]; activityType: string }> {
  const ageRange = gradeToAgeRange(opts.gradeLevel);
  const activityType = ACTIVITY_TYPES[pageVariant % ACTIVITY_TYPES.length];

  const systemPrompt = `You are an expert elementary school teacher creating engaging, age-appropriate educational worksheets.
Your worksheets are clear, encouraging, and perfectly matched to the student's level.`;

  const userPrompt = `Create worksheet content for:
- Subject: ${opts.subject}
- Skill: ${opts.specificSkill}
- Grade Level: ${opts.gradeLevel} (${ageRange})
- Activity Type: ${activityType}
- Variant: ${pageVariant + 1} (make this unique from other variants)

Return a JSON object:
{
  "title": "Worksheet title (short, max 5 words)",
  "instructions": "Clear one-sentence instruction",
  "items": ["Item 1", "Item 2", "Item 3", "Item 4", "Item 5", "Item 6"]
}

For ${activityType} format:
- fill-in-the-blank: sentences with ___________ for missing words
- matching: "Match: [term] → ___________" format
- multiple-choice: "Q: question?  a) option  b) option  c) option  d) option" format
- short-answer: questions requiring brief written answers
- true-or-false: statements followed by "True / False: ___"
- ordering/sequencing: "Put in order: [items to sequence]"

RULES:
- All items must be age-appropriate for ${ageRange}
- Each item must be self-contained (no references to images)
- NEVER include placeholder text like "[Picture of...]"
- Keep items concise — one line each`;

  const content = await generateContent({
    systemPrompt,
    userPrompt,
    responseFormat: { type: "json_object" },
  });

  try {
    const parsed = JSON.parse(content);
    return {
      title: parsed.title || `${opts.specificSkill} Practice`,
      instructions: parsed.instructions || `Complete each ${activityType} activity below.`,
      items: Array.isArray(parsed.items) ? parsed.items.slice(0, 8) : [],
      activityType,
    };
  } catch {
    return {
      title: `${opts.subject}: ${opts.specificSkill}`,
      instructions: `Practice your ${opts.specificSkill} skills below:`,
      items: Array.from({ length: 6 }, (_, i) => `${i + 1}. ___________________________________________`),
      activityType,
    };
  }
}

async function generateWorksheetPage(pageIndex: number, job: GenerationJob): Promise<PageResult> {
  const opts = job.options as WorksheetOptions;

  if (pageIndex === 0) {
    // Cover page — ONLY page with AI image
    const prompt = buildImagePrompt({
      subject: `colorful educational workbook cover with ${opts.subject.toLowerCase()} themed elements`,
      theme: opts.theme,
      additionalDetails: `professional educational worksheet cover design, vibrant and appealing for ${opts.gradeLevel} students, filling the entire canvas edge-to-edge with no borders or frames`,
    });
    const { imageUrl } = await generatePageImage(prompt);
    return {
      pageNumber: 1,
      imageUrl,
      status: "success",
      metadata: { isCover: true },
    };
  }

  // Content pages — NO AI image, just GPT content
  const worksheetContent = await generateWorksheetContent(opts, pageIndex - 1);

  return {
    pageNumber: pageIndex + 1,
    imageUrl: "",
    status: "success",
    metadata: { worksheetContent, isContentPage: true },
  };
}

/**
 * Custom chunk processor for worksheets.
 */
async function processWorksheetChunkInternal(job: GenerationJob): Promise<void> {
  const PAGES_PER_CHUNK = 2;
  const startIndex = job.nextPageIndex;
  const endIndex = Math.min(startIndex + PAGES_PER_CHUNK, job.totalPages);

  updateJob(job.id, {
    status: "generating",
    statusMessage: `Generating worksheets ${startIndex + 1}-${endIndex} of ${job.totalPages}...`,
  });

  for (let i = startIndex; i < endIndex; i++) {
    try {
      const result = await generateWorksheetPage(i, job);
      addPageResult(job.id, result);
      updateJob(job.id, {
        nextPageIndex: i + 1,
        statusMessage: `Generated worksheet ${i + 1} of ${job.totalPages}`,
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
    await finalizeWorksheetPdf(updatedJob);
  }
}

/**
 * Assemble the worksheet PDF — clean programmatic design, no background images on content pages.
 */
async function finalizeWorksheetPdf(job: GenerationJob): Promise<void> {
  updateJob(job.id, { statusMessage: "Assembling PDF..." });

  const successPages = job.pageResults.filter(r => r.status === "success");
  if (successPages.length === 0) {
    updateJob(job.id, { status: "error", errorMessage: "No pages were generated successfully." });
    return;
  }

  try {
    const opts = job.options as WorksheetOptions;
    const colors = getColors(opts.subject);
    const pageContents: PageContent[] = [];

    for (const page of successPages) {
      if (page.metadata?.isCover) {
        // Cover page — full AI image with title overlay
        const buffer = await fetchImageBuffer(page.imageUrl);
        pageContents.push({
          imageBuffer: buffer,
          contentBlocks: [
            {
              text: opts.subject,
              x: MARGIN,
              y: 240,
              width: CONTENT_WIDTH,
              fontSize: 34,
              font: "bold",
              align: "center",
              fontColor: "#FFFFFF",
              backgroundColor: "rgba(0,0,0,0.5)",
              padding: 16,
              radius: 8,
            },
            {
              text: opts.specificSkill,
              x: MARGIN,
              y: 310,
              width: CONTENT_WIDTH,
              fontSize: 20,
              font: "normal",
              align: "center",
              fontColor: "#FFFFFF",
            },
            {
              text: `Grade: ${opts.gradeLevel} | Worksheets`,
              x: MARGIN,
              y: 345,
              width: CONTENT_WIDTH,
              fontSize: 14,
              font: "normal",
              align: "center",
              fontColor: "#FFFFFF",
            },
            {
              text: "WishesWithoutBordersCo",
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
        // CONTENT PAGE — Clean white background, colored header, no AI image
        // ═══════════════════════════════════════════════════════════════════
        const wc = page.metadata?.worksheetContent || {};
        const contentBlocks: NonNullable<PageContent["contentBlocks"]> = [];

        // ── Header bar (colored banner) ──
        contentBlocks.push({
          text: wc.title || "Practice",
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

        // ── Activity type badge ──
        contentBlocks.push({
          text: `Activity Type: ${wc.activityType || "practice"}`,
          x: MARGIN,
          y: 58,
          width: CONTENT_WIDTH,
          fontSize: 9,
          font: "normal",
          align: "right",
          fontColor: "#888888",
          padding: 2,
        });

        // ── Instructions ──
        contentBlocks.push({
          text: wc.instructions || "Complete the activity below.",
          x: MARGIN,
          y: 78,
          width: CONTENT_WIDTH,
          fontSize: 12,
          font: "bold",
          align: "left",
          fontColor: "#1a1a1a",
          backgroundColor: "#F0F4F8",
          padding: 12,
          radius: 6,
        });

        // ── Activity items with generous spacing and answer lines ──
        const items: string[] = Array.isArray(wc.items) ? wc.items : [];
        const ITEMS_START_Y = 130;
        const ITEMS_END_Y = PAGE_HEIGHT - 80;
        const itemCount = Math.max(items.length, 1);
        const spacing = Math.min((ITEMS_END_Y - ITEMS_START_Y) / itemCount, 100);

        items.forEach((item: string, idx: number) => {
          const yPos = ITEMS_START_Y + idx * spacing;

          // Numbered item
          contentBlocks.push({
            text: `${idx + 1}.  ${item}`,
            x: MARGIN,
            y: yPos,
            width: CONTENT_WIDTH,
            fontSize: 12,
            font: "normal",
            align: "left",
            fontColor: "#1a1a1a",
            padding: 8,
          });

          // Answer line
          contentBlocks.push({
            text: "_______________________________________________",
            x: MARGIN + 24,
            y: yPos + 30,
            width: CONTENT_WIDTH - 48,
            fontSize: 11,
            font: "normal",
            align: "left",
            fontColor: "#CCCCCC",
          });
        });

        // ── Footer ──
        contentBlocks.push({
          text: `${opts.subject} | ${opts.specificSkill} | ${opts.gradeLevel}`,
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

        // ── Name/Date line at top right ──
        contentBlocks.push({
          text: "Name: ________________  Date: ________",
          x: MARGIN,
          y: 56,
          width: CONTENT_WIDTH,
          fontSize: 10,
          font: "normal",
          align: "left",
          fontColor: "#666666",
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

export function createWorksheetJob(options: WorksheetOptions): string {
  const totalPages = Math.max(5, options.quantity + 1);
  const job = createJob(
    "worksheet",
    totalPages,
    options,
    `worksheet-${options.subject.toLowerCase()}-${options.specificSkill.toLowerCase().replace(/\s+/g, "-")}.pdf`
  );
  return job.id;
}

export async function processWorksheetChunk(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");
  await processWorksheetChunkInternal(job);
}

export function getSkillsForSubject(subject: string): string[] {
  return SKILL_MAP[subject] || [];
}
