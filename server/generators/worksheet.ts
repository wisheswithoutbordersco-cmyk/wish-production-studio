/**
 * Worksheet Generator
 * Generates educational worksheets with GPT content overlaid on themed decorative borders.
 *
 * Flow per page:
 * 1. Generate a decorative border/frame image (Flux) — center is intentionally blank
 * 2. Generate age-appropriate educational content (GPT) for the subject/skill
 * 3. Overlay the content as real text in the center area via pdfAssembly contentBlocks
 *
 * Features:
 * - Cover page with title and subject info
 * - 5+ activity pages with varied activity types
 * - Each page has: title, instructions, activity items
 * - Semi-transparent background behind text for readability
 */
import { buildImagePrompt, generatePageImage, generateContent } from "./shared";
import { createJob, getJob, updateJob, addPageResult, type GenerationJob, type PageResult } from "../jobs";
import { assemblePdf, fetchImageBuffer, PageContent } from "../pdfAssembly";
import { storagePut } from "../storage";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

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
 * Generate age-appropriate worksheet content using GPT with varied activity types.
 */
async function generateWorksheetContent(opts: WorksheetOptions, pageVariant: number): Promise<{ title: string; instructions: string; items: string[]; activityType: string }> {
  const ageRange = gradeToAgeRange(opts.gradeLevel);
  const activityType = ACTIVITY_TYPES[pageVariant % ACTIVITY_TYPES.length];

  const systemPrompt = `You are an expert elementary school teacher creating engaging, age-appropriate educational worksheets.
Your worksheets are clear, encouraging, and perfectly matched to the student's level.
Always include a worksheet title, clear instructions, and 5-8 activity items.`;

  const userPrompt = `Create worksheet content for:
- Subject: ${opts.subject}
- Skill: ${opts.specificSkill}
- Grade Level: ${opts.gradeLevel} (${ageRange})
- Activity Type: ${activityType}
- Variant: ${pageVariant + 1} (make this unique from other variants)

Return a JSON object with this exact structure:
{
  "title": "Worksheet title (short, engaging)",
  "instructions": "Clear one-sentence instruction for the student",
  "items": [
    "Item 1 text with blank line indicator using ___________",
    "Item 2 text...",
    "Item 3 text...",
    "Item 4 text...",
    "Item 5 text...",
    "Item 6 text..."
  ]
}

For ${activityType} format:
- fill-in-the-blank: sentences with ___________ for missing words
- matching: "Match: [term] → ___________" format
- multiple-choice: "Q: question? a) b) c) d)" format
- short-answer: questions requiring brief written answers with lines
- true-or-false: statements followed by "True / False: ___"
- ordering/sequencing: "Put in order: [items to sequence]"

Make all items age-appropriate, educational, and directly related to ${opts.specificSkill}.`;

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
    // Cover page
    const prompt = buildImagePrompt({
      subject: `colorful educational workbook cover with ${opts.subject.toLowerCase()} themed elements and decorative patterns`,
      theme: opts.theme,
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

  // Activity pages
  const prompt = buildImagePrompt({
    subject: `decorative page border and frame design for a ${opts.subject} ${opts.specificSkill} worksheet`,
    theme: opts.theme,
    additionalDetails: `elegant border frame with themed decorative elements ONLY around the outer edges of the page, the center 70% of the page must be completely plain white with no illustrations, suitable for ${opts.gradeLevel} grade level educational worksheet, print-ready`,
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
 * Assemble the worksheet PDF with content text overlaid on border images.
 */
async function finalizeWorksheetPdf(job: GenerationJob): Promise<void> {
  updateJob(job.id, { statusMessage: "Assembling PDF with content..." });

  const successPages = job.pageResults.filter(r => r.status === "success");
  if (successPages.length === 0) {
    updateJob(job.id, { status: "error", errorMessage: "No pages were generated successfully." });
    return;
  }

  try {
    const opts = job.options as WorksheetOptions;
    const MARGIN = 50;
    const CONTENT_TOP = 130;
    const CONTENT_LEFT = MARGIN + 20;
    const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN - 40;
    const LINE_HEIGHT = 48;

    const pageContents: PageContent[] = [];

    for (const page of successPages) {
      const buffer = await fetchImageBuffer(page.imageUrl);

      if (page.metadata?.isCover) {
        // Cover page
        pageContents.push({
          imageBuffer: buffer,
          contentBlocks: [
            {
              text: `${opts.subject}`,
              x: 50,
              y: 250,
              width: PAGE_WIDTH - 100,
              fontSize: 32,
              font: "bold",
              align: "center",
              color: "#FFFFFF",
            },
            {
              text: opts.specificSkill,
              x: 50,
              y: 300,
              width: PAGE_WIDTH - 100,
              fontSize: 20,
              font: "normal",
              align: "center",
              color: "#FFFFFF",
            },
            {
              text: `Grade: ${opts.gradeLevel}`,
              x: 50,
              y: 340,
              width: PAGE_WIDTH - 100,
              fontSize: 14,
              font: "normal",
              align: "center",
              color: "#FFFFFF",
            },
            {
              text: "Worksheets",
              x: 50,
              y: 380,
              width: PAGE_WIDTH - 100,
              fontSize: 16,
              font: "bold",
              align: "center",
              color: "#FFFFFF",
            },
          ],
          pageNumber: 1,
          totalPages: job.totalPages,
        });
      } else {
        // Activity page with content overlay
        const wc = page.metadata?.worksheetContent || {};
        const contentBlocks: NonNullable<PageContent["contentBlocks"]> = [];

        // Title
        contentBlocks.push({
          text: wc.title || "Practice",
          x: CONTENT_LEFT,
          y: CONTENT_TOP,
          width: CONTENT_WIDTH,
          fontSize: 18,
          font: "bold",
          align: "center",
          color: "#1a1a1a",
        });

        // Activity type badge
        contentBlocks.push({
          text: `Activity: ${wc.activityType || "practice"}`,
          x: CONTENT_LEFT,
          y: CONTENT_TOP + 28,
          width: CONTENT_WIDTH,
          fontSize: 9,
          font: "normal",
          align: "center",
          color: "#888888",
        });

        // Instructions
        if (wc.instructions) {
          contentBlocks.push({
            text: wc.instructions,
            x: CONTENT_LEFT,
            y: CONTENT_TOP + 50,
            width: CONTENT_WIDTH,
            fontSize: 11,
            font: "normal",
            align: "center",
            color: "#444444",
          });
        }

        // Activity items
        const items: string[] = wc.items || [];
        items.forEach((item: string, idx: number) => {
          const yPos = CONTENT_TOP + 90 + idx * LINE_HEIGHT;
          contentBlocks.push({
            text: item,
            x: CONTENT_LEFT,
            y: yPos,
            width: CONTENT_WIDTH,
            fontSize: 12,
            font: "normal",
            align: "left",
            color: "#222222",
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

export function createWorksheetJob(options: WorksheetOptions): string {
  // Ensure minimum 5 pages (cover + 4 activity pages)
  const totalPages = Math.max(5, options.quantity + 1); // +1 for cover
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
