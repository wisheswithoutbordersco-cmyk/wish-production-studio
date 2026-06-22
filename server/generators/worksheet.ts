/**
 * Worksheet Generator (Single Page / Batch)
 * Generates educational worksheets with GPT content overlaid as real text on a decorative border.
 *
 * Flow per page:
 * 1. Generate a decorative border/frame image (Flux) — center is intentionally blank
 * 2. Generate age-appropriate educational content (GPT) for the subject/skill
 * 3. Overlay the content as real text in the center area via pdfAssembly contentBlocks
 */
import { buildImagePrompt, generatePageImage, generateContent } from "./shared";
import { createJob, getJob, updateJob, addPageResult, type GenerationJob, type PageResult } from "../jobs";
import { assemblePdf, fetchImageBuffer, PageContent } from "../pdfAssembly";
import { storagePut } from "../storage";

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

/**
 * Parse grade level string into a human-readable age range for GPT prompting.
 */
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
 * Returns an array of content lines ready to be overlaid as text.
 */
async function generateWorksheetContent(opts: WorksheetOptions, pageVariant: number): Promise<string[]> {
  const ageRange = gradeToAgeRange(opts.gradeLevel);

  const systemPrompt = `You are an expert elementary school teacher creating engaging, age-appropriate educational worksheets.
Your worksheets are clear, encouraging, and perfectly matched to the student's level.
Always include a worksheet title, clear instructions, and 4-6 activity items with answer lines.`;

  const userPrompt = `Create worksheet content for:
- Subject: ${opts.subject}
- Skill: ${opts.specificSkill}
- Grade Level: ${opts.gradeLevel} (${ageRange})
- Variant: ${pageVariant + 1} (make this unique from other variants)

Return a JSON object with this exact structure:
{
  "title": "Worksheet title (short, engaging)",
  "instructions": "Clear one-sentence instruction for the student",
  "items": [
    "Item 1 text with blank line indicator using ___________",
    "Item 2 text with blank line indicator using ___________",
    "Item 3 text with blank line indicator using ___________",
    "Item 4 text with blank line indicator using ___________",
    "Item 5 text with blank line indicator using ___________",
    "Item 6 text with blank line indicator using ___________"
  ]
}

Examples for SEL / Growth Mindset (ages 6-8):
- "Something I'm proud of learning: ___________"
- "When something is hard, I can try: ___________"
- "A mistake I learned from: ___________"

Examples for Math / Addition (ages 6-7):
- "3 + 4 = ___________"
- "7 + 2 = ___________"
- "5 + 5 = ___________"

Make all items age-appropriate, educational, and directly related to ${opts.specificSkill}.`;

  const content = await generateContent({
    systemPrompt,
    userPrompt,
    responseFormat: { type: "json_object" },
  });

  try {
    const parsed = JSON.parse(content);
    const lines: string[] = [];
    if (parsed.title) lines.push(parsed.title);
    if (parsed.instructions) lines.push(`Instructions: ${parsed.instructions}`);
    if (Array.isArray(parsed.items)) {
      lines.push(...parsed.items.slice(0, 6));
    }
    return lines;
  } catch {
    // Fallback content if GPT response can't be parsed
    return [
      `${opts.subject}: ${opts.specificSkill}`,
      `Practice your ${opts.specificSkill} skills below:`,
      `1. ___________________________________________`,
      `2. ___________________________________________`,
      `3. ___________________________________________`,
      `4. ___________________________________________`,
      `5. ___________________________________________`,
      `6. ___________________________________________`,
    ];
  }
}

async function generateWorksheetPage(pageIndex: number, job: GenerationJob): Promise<PageResult> {
  const opts = job.options as WorksheetOptions;

  // Step 1: Generate decorative border/theme illustration with blank center
  const prompt = buildImagePrompt({
    subject: `decorative page border and frame design for a ${opts.subject} ${opts.specificSkill} worksheet`,
    theme: opts.theme,
    additionalDetails: `elegant border frame with themed decorative elements ONLY around the outer edges of the page, the center 70% of the page must be completely plain white with no illustrations, suitable for ${opts.gradeLevel} grade level educational worksheet, print-ready`,
  });
  const { imageUrl } = await generatePageImage(prompt);

  // Step 2: Generate GPT educational content for this page
  const contentLines = await generateWorksheetContent(opts, pageIndex);

  return {
    pageNumber: pageIndex + 1,
    imageUrl,
    status: "success",
    metadata: { contentLines },
  };
}

/**
 * Custom chunk processor for worksheets that handles content overlay in PDF assembly.
 */
async function processWorksheetChunkInternal(job: GenerationJob): Promise<void> {
  const PAGES_PER_CHUNK = 3;
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

  // Check if all pages are done
  const updatedJob = getJob(job.id);
  if (updatedJob && updatedJob.nextPageIndex >= updatedJob.totalPages) {
    await finalizeWorksheetPdf(updatedJob);
  }
}

/**
 * Assemble the worksheet PDF with GPT content text overlaid on the border images.
 */
async function finalizeWorksheetPdf(job: GenerationJob): Promise<void> {
  updateJob(job.id, { statusMessage: "Assembling PDF with content..." });

  const successPages = job.pageResults.filter(r => r.status === "success");

  if (successPages.length === 0) {
    updateJob(job.id, {
      status: "error",
      errorMessage: "No pages were generated successfully.",
    });
    return;
  }

  try {
    const PAGE_WIDTH = 612;
    const MARGIN = 50;
    const CONTENT_TOP = 130;    // Start content below top border decoration
    const CONTENT_LEFT = MARGIN + 20;
    const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN - 40;
    const LINE_HEIGHT = 52;     // Space between worksheet items

    const pageContents: PageContent[] = [];

    for (const page of successPages) {
      const buffer = await fetchImageBuffer(page.imageUrl);
      const contentLines: string[] = page.metadata?.contentLines || [];

      // Build content blocks for text overlay
      const contentBlocks: NonNullable<PageContent["contentBlocks"]> = [];

      if (contentLines.length > 0) {
        // Title (first line) — bold, centered
        const title = contentLines[0] || "";
        contentBlocks.push({
          text: title,
          x: CONTENT_LEFT,
          y: CONTENT_TOP,
          width: CONTENT_WIDTH,
          fontSize: 18,
          font: "bold",
          align: "center",
          color: "#1a1a1a",
        });

        // Instructions (second line) — italic-style, centered
        if (contentLines[1]) {
          contentBlocks.push({
            text: contentLines[1],
            x: CONTENT_LEFT,
            y: CONTENT_TOP + 36,
            width: CONTENT_WIDTH,
            fontSize: 11,
            font: "normal",
            align: "center",
            color: "#444444",
          });
        }

        // Activity items (lines 2+) — left-aligned with spacing
        const items = contentLines.slice(2);
        items.forEach((item, idx) => {
          const yPos = CONTENT_TOP + 85 + idx * LINE_HEIGHT;
          contentBlocks.push({
            text: item,
            x: CONTENT_LEFT,
            y: yPos,
            width: CONTENT_WIDTH,
            fontSize: 13,
            font: "normal",
            align: "left",
            color: "#222222",
          });
        });
      }

      pageContents.push({
        imageBuffer: buffer,
        contentBlocks,
        pageNumber: page.pageNumber,
        totalPages: job.totalPages,
      });
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
    updateJob(job.id, {
      status: "error",
      errorMessage: errorMsg,
    });
  }
}

export function createWorksheetJob(options: WorksheetOptions): string {
  const job = createJob(
    "worksheet",
    options.quantity,
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
