/**
 * Worksheet Generator
 *
 * Every cover and worksheet page is generated as one complete portrait image.
 * GPT-4o specifies the exact copy, layout, typography, answer areas, decoration,
 * branding, and page number; FLUX renders the complete final printable page.
 */
import { generateFullPageImage, generateContent, customPromptInstruction, finalizePdf } from "./shared";
import { createJob, getJob, updateJob, addPageResult, type GenerationJob, type PageResult } from "../jobs";

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
  const pageNumber = pageIndex + 1;

  if (pageIndex === 0) {
    const { imageUrl } = await generateFullPageImage({
      generatorType: "educational worksheet set",
      pageType: "front cover",
      pageNumber,
      totalPages: job.totalPages,
      audience: `${opts.gradeLevel} students`,
      creativeDirection: `A colorful ${opts.subject} worksheet collection focused on ${opts.specificSkill}, with a ${opts.theme} theme`,
      customPrompt: opts.customPrompt,
      exactText: [opts.subject, opts.specificSkill, `Grade: ${opts.gradeLevel}`, "Worksheet Collection"],
      layoutGuidance: "Create a polished portrait cover with a strong title hierarchy, a visible skill subtitle and grade badge, integrated subject-specific illustrations, and balanced themed decorations. Keep branding at the bottom inside safe margins.",
      styleGuidance: "Premium classroom-resource cover design with bold friendly display lettering, clean supporting typography, vibrant print-friendly colors, decorative icons, borders, and a cohesive professional finish.",
      functionalRequirements: ["The cover must remain clear and attractive at thumbnail size."],
    });

    return { pageNumber, imageUrl, status: "success", metadata: { isCover: true } };
  }

  const worksheetContent = await generateWorksheetContent(opts, pageIndex - 1);
  const items = worksheetContent.items
    .map(item => scrubPlaceholders(item))
    .filter(item => item.length > 0);
  const exactText = [
    "Name: ____________________    Date: ____________",
    scrubPlaceholders(worksheetContent.title) || "Practice",
    `${worksheetContent.activityType.toUpperCase()}: ${scrubPlaceholders(worksheetContent.instructions) || "Complete the activity below."}`,
    ...items.flatMap((item, index) => [
      `${index + 1}. ${item}`,
      "Answer: ______________________________",
    ]),
    `${opts.subject} | ${opts.specificSkill} | ${opts.gradeLevel}`,
  ];

  const { imageUrl } = await generateFullPageImage({
    generatorType: "educational worksheet",
    pageType: `${worksheetContent.activityType} practice page ${pageIndex}`,
    pageNumber,
    totalPages: job.totalPages,
    audience: `${opts.gradeLevel} students`,
    creativeDirection: `${opts.theme}-themed ${opts.subject} worksheet focused on ${opts.specificSkill}`,
    customPrompt: opts.customPrompt,
    exactText,
    layoutGuidance: "Create a complete portrait worksheet with a slim name/date row, a prominent themed title banner, a clearly separated instruction box, and the numbered problems arranged in spacious rows or activity cards. Put a writable answer line immediately under each item and a small subject/skill/grade footer at the bottom.",
    styleGuidance: "Crisp teacher-created resource design with friendly educational typography, strong contrast, consistent numbered problem styling, coordinated boxes and dividers, small themed icons or mascot accents, and generous white writing space.",
    functionalRequirements: [
      "All questions, choices, blanks, punctuation, and answer lines must remain fully visible and usable.",
      "Decoration must stay outside functional text and writing areas.",
      "Preserve underscores, answer choices, arrows, and mathematical symbols exactly.",
    ],
  });

  return { pageNumber, imageUrl, status: "success", metadata: { worksheetContent } };
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
    await finalizePdf(updatedJob);
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
