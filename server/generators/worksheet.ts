/**
 * Worksheet Generator
 *
 * Strategy:
 * - COVER page: Full-page AI illustration with title overlay
 * - CONTENT pages: AI illustration contained in a top header with all
 *   worksheet text and answer lines rendered on solid white below.
 */
import { buildImagePrompt, generatePageImage, generateContent, customPromptInstruction, resolveCreativeDirection } from "./shared";
import { createJob, getJob, updateJob, addPageResult, type GenerationJob, type PageResult } from "../jobs";
import { assemblePdf, fetchImageBuffer, PageContent } from "../pdfAssembly";
import { storagePut } from "../storage";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const ACTIVITY_IMAGE_HEIGHT = 200;
const ACTIVITY_CONTENT_START_Y = ACTIVITY_IMAGE_HEIGHT + 16;

export interface WorksheetOptions {
  customPrompt?: string;
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
 * Generate age-appropriate worksheet content using GPT.
 */
async function generateWorksheetContent(opts: WorksheetOptions, pageVariant: number): Promise<{ title: string; instructions: string; items: string[]; activityType: string }> {
  const ageRange = gradeToAgeRange(opts.gradeLevel);
  const activityType = ACTIVITY_TYPES[pageVariant % ACTIVITY_TYPES.length];

  const systemPrompt = `You are an expert elementary school teacher creating engaging, age-appropriate educational worksheets.
Your worksheets are clear, encouraging, and perfectly matched to the student's level.${customPromptInstruction(opts.customPrompt)}`;

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
    // Cover page — full AI image
    const prompt = buildImagePrompt({
      subject: resolveCreativeDirection(opts.customPrompt, `colorful educational workbook cover with ${opts.subject.toLowerCase()} themed elements and decorative patterns`),
      theme: opts.customPrompt ? undefined : opts.theme,
      additionalDetails: `professional educational worksheet cover design, vibrant and appealing for ${opts.gradeLevel} students, child-friendly`,
    });
    const { imageUrl } = await generatePageImage(prompt);
    return {
      pageNumber: 1,
      imageUrl,
      status: "success",
      metadata: { isCover: true },
    };
  }

  // Content pages — AI header illustration + GPT content
  const prompt = buildImagePrompt({
    subject: resolveCreativeDirection(opts.customPrompt, `educational header illustration for a ${opts.subject} ${opts.specificSkill} worksheet`),
    theme: opts.customPrompt ? undefined : opts.theme,
    additionalDetails: `themed illustration composed for the top quarter of a portrait worksheet page, important subjects centered and fully visible, no text or lettering, suitable for ${opts.gradeLevel} grade level, print-ready`,
  });
  const { imageUrl } = await generatePageImage(prompt);

  // Generate GPT educational content
  const worksheetContent = await generateWorksheetContent(opts, pageIndex - 1);

  return {
    pageNumber: pageIndex + 1,
    imageUrl,
    status: "success",
    metadata: { worksheetContent },
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
 * Assemble the worksheet PDF — full-page cover art and contained activity
 * illustrations above a solid-white worksheet area.
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
    const pageContents: PageContent[] = [];

    for (const page of successPages) {
      const buffer = await fetchImageBuffer(page.imageUrl);

      if (page.metadata?.isCover) {
        // Cover page — full AI image with title overlay
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
              backgroundColor: "rgba(0,0,0,0.35)",
              padding: 8,
              radius: 6,
            },
            {
              text: `Grade: ${opts.gradeLevel} | Worksheets`,
              x: MARGIN,
              y: 355,
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
        // CONTENT PAGE — Contained AI header + solid-white worksheet area
        // ═══════════════════════════════════════════════════════════════════
        const wc = page.metadata?.worksheetContent || {};
        const contentBlocks: NonNullable<PageContent["contentBlocks"]> = [];

        // ── Name/Date line ──
        contentBlocks.push({
          text: "Name: ________________  Date: ________",
          x: MARGIN,
          y: ACTIVITY_CONTENT_START_Y,
          width: CONTENT_WIDTH,
          fontSize: 10,
          font: "normal",
          align: "left",
          fontColor: "#444444",
        });

        // ── Title ──
        contentBlocks.push({
          text: scrubPlaceholders(wc.title) || "Practice",
          x: MARGIN,
          y: ACTIVITY_CONTENT_START_Y + 28,
          width: CONTENT_WIDTH,
          fontSize: 20,
          font: "bold",
          align: "center",
          fontColor: "#1a1a1a",
        });

        // ── Activity type + Instructions ──
        const instrText = scrubPlaceholders(wc.instructions) || "Complete the activity below.";
        contentBlocks.push({
          text: `${wc.activityType ? wc.activityType.toUpperCase() + ": " : ""}${instrText}`,
          x: MARGIN,
          y: ACTIVITY_CONTENT_START_Y + 66,
          width: CONTENT_WIDTH,
          fontSize: 11,
          font: "bold",
          align: "left",
          fontColor: "#1a1a1a",
        });

        // ── Activity items ──
        const items: string[] = Array.isArray(wc.items) ? wc.items : [];
        const cleanItems = items
          .map((it: string) => scrubPlaceholders(it))
          .filter((it: string) => it.trim().length > 0);

        const ITEMS_START_Y = ACTIVITY_CONTENT_START_Y + 110;
        const ITEMS_END_Y = PAGE_HEIGHT - 62;
        const itemCount = Math.max(cleanItems.length, 1);
        const spacing = Math.min(85, (ITEMS_END_Y - ITEMS_START_Y) / itemCount);

        cleanItems.forEach((item: string, idx: number) => {
          const yPos = ITEMS_START_Y + idx * spacing;

          contentBlocks.push({
            text: `${idx + 1}.  ${item}`,
            x: MARGIN,
            y: yPos,
            width: CONTENT_WIDTH,
            fontSize: 12,
            font: "normal",
            align: "left",
            fontColor: "#1a1a1a",
          });

          // Answer line
          contentBlocks.push({
            text: "_______________________________________________",
            x: MARGIN + 20,
            y: yPos + 32,
            width: CONTENT_WIDTH - 40,
            fontSize: 11,
            font: "normal",
            align: "left",
            fontColor: "#BBBBBB",
          });
        });

        // ── Footer ──
        contentBlocks.push({
          text: `${opts.subject} | ${opts.specificSkill} | ${opts.gradeLevel}`,
          x: MARGIN,
          y: PAGE_HEIGHT - 38,
          width: CONTENT_WIDTH,
          fontSize: 8,
          font: "normal",
          align: "center",
          fontColor: "#555555",
        });

        pageContents.push({
          imageBuffer: buffer,
          imageHeight: ACTIVITY_IMAGE_HEIGHT,
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
