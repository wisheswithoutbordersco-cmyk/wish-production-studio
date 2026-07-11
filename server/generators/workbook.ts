/**
 * Workbook Generator
 *
 * Every cover and activity page is generated as one complete portrait image.
 * GPT-4o writes a detailed page-design prompt containing the exact copy,
 * layout, typography, activity spaces, decoration, branding, and page number;
 * FLUX renders that prompt as the final printable page with no PDF text overlay.
 */
import { generateFullPageImage, generateContent, customPromptInstruction, finalizePdf } from "./shared";
import { createJob, getJob, updateJob, addPageResult, type GenerationJob, type PageResult } from "../jobs";

export interface WorkbookOptions {
  customPrompt?: string;
  subject: string;
  gradeLevel: string;
  pageCount: number;
  theme: string;
  coverTitle?: string;
  authorName?: string;
  includeAnswerKey: boolean;
  includeLicensePage: boolean;
}

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
Activities must be completable with pencil and paper only.${customPromptInstruction(opts.customPrompt)}`;

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
  const pageNumber = pageIndex + 1;

  if (pageIndex === 0) {
    const title = scrubPlaceholders(opts.coverTitle) || `${opts.subject} Workbook`;
    const author = scrubPlaceholders(opts.authorName) || "WishesWithoutBordersCo";
    const { imageUrl } = await generateFullPageImage({
      generatorType: "educational workbook",
      pageType: "front cover",
      pageNumber,
      totalPages: job.totalPages,
      audience: `${opts.gradeLevel} students`,
      creativeDirection: `A professional ${opts.subject} workbook cover, ${getThemeModifier(opts.theme)}, ${getGradeLevelModifier(opts.gradeLevel)}`,
      customPrompt: opts.customPrompt,
      exactText: [title, opts.theme, `Grade: ${opts.gradeLevel}`, author],
      layoutGuidance: "Create a high-impact portrait cover with the title as the dominant focal point, a clear theme subtitle and grade badge, integrated subject-specific illustrations, and the author/brand at the bottom. Keep all text inside generous safe margins.",
      styleGuidance: "Premium educational publishing design with expressive display typography, polished supporting type, layered themed flourishes, cohesive color blocking, and a professional bookstore-ready finish.",
      functionalRequirements: [
        "The cover must read clearly at thumbnail size.",
        "Do not include worksheet questions or answer areas on the cover.",
      ],
    });

    return { pageNumber, imageUrl, status: "success", metadata: { isCover: true } };
  }

  const activityContent = await generateWorkbookActivity(opts, pageIndex - 1);
  const subjectPrompts = SUBJECT_PROMPTS[opts.subject] || SUBJECT_PROMPTS["Math"];
  const subjectPrompt = subjectPrompts[(pageIndex - 1) % subjectPrompts.length];
  const items = activityContent.activityItems
    .map(item => scrubPlaceholders(item))
    .filter(item => item.length > 0);
  const exactText = [
    scrubPlaceholders(activityContent.pageTitle) || `Activity ${pageIndex}`,
    scrubPlaceholders(activityContent.educationalPurpose) || `Develop ${opts.subject} skills`,
    `Instructions: ${scrubPlaceholders(activityContent.instructions) || "Complete the activity below."}`,
    ...items.flatMap((item, index) => [
      `${index + 1}. ${item}`,
      "Answer: ______________________________",
    ]),
    `${opts.subject} | ${opts.theme} | ${opts.gradeLevel}`,
  ];

  const { imageUrl } = await generateFullPageImage({
    generatorType: "educational workbook",
    pageType: `student activity page ${pageIndex}`,
    pageNumber,
    totalPages: job.totalPages,
    audience: `${opts.gradeLevel} students`,
    creativeDirection: `${subjectPrompt}, ${getThemeModifier(opts.theme)}, ${getGradeLevelModifier(opts.gradeLevel)}`,
    customPrompt: opts.customPrompt,
    exactText,
    layoutGuidance: "Use a complete full-page worksheet composition: compact illustrated title banner at the top, educational-purpose line and instruction panel below it, then evenly spaced numbered activity cards filling the main page. Place a generous handwriting answer line directly beneath every activity item. Finish with a small subject/theme/grade footer.",
    styleGuidance: "Professional teacher-resource typography with a playful bold title, highly legible body text, clear hierarchy, themed icons and a friendly mascot integrated around the content without covering any words or answer spaces. Use coordinated borders, boxes, subtle patterns, and print-friendly colors.",
    functionalRequirements: [
      "Every question and answer line must fit fully on the page and remain easy to write on after printing.",
      "The activity content is primary; decoration must never overlap text or response areas.",
      "Preserve all underscores and mathematical symbols exactly.",
    ],
  });

  return { pageNumber, imageUrl, status: "success", metadata: { activityContent } };
}

/**
 * Custom chunk processor for workbooks.
 */
async function processWorkbookChunkInternal(job: GenerationJob): Promise<void> {
  const PAGES_PER_CHUNK = 1;
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
    await finalizePdf(updatedJob);
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
