/**
 * Workbook Generator
 * Generates multi-page educational activity workbooks using chunked generation.
 * Each page gets an AI-generated illustration; titles/instructions are overlaid programmatically.
 */
import { buildImagePrompt, generatePageImage, processChunk } from "./shared";
import { createJob, getJob, type GenerationJob, type PageResult } from "../jobs";

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
    "phonics activity illustration with letter sounds, word families, and picture clues",
    "reading comprehension scene with story elements, characters, and setting details",
    "vocabulary building illustration with labeled objects and word connections",
    "story sequencing scene with clear beginning, middle, and end visual elements",
  ],
  "Writing": [
    "creative writing inspiration scene with story starters and imagination elements",
    "handwriting practice illustration with themed decorative borders and guide lines",
    "journal writing scene with prompts, thought bubbles, and creative elements",
    "letter writing illustration with envelope, stamp, and friendly message elements",
    "poetry writing scene with nature elements, rhythm patterns, and creative imagery",
  ],
  "Science": [
    "science exploration illustration with magnifying glass, plants, and nature observation",
    "simple experiment scene with safe lab equipment, bubbles, and discovery elements",
    "life cycle illustration showing growth stages of a plant or animal",
    "weather and seasons scene with clouds, sun, rain, and seasonal changes",
    "animal habitat illustration showing ecosystem with diverse creatures",
  ],
  "Social Studies": [
    "community helpers illustration showing diverse workers in their roles",
    "map and geography scene with landmarks, compass, and exploration elements",
    "cultural celebration illustration showing diverse traditions and customs",
    "historical timeline scene with important events and diverse figures",
    "citizenship and kindness illustration showing children helping community",
  ],
  "Art": [
    "art studio scene with paint brushes, easels, color palettes, and creative tools",
    "color mixing illustration showing primary and secondary colors blending",
    "art history inspired scene with famous art styles and diverse artists",
    "craft activity illustration with scissors, paper, glue, and creative materials",
    "pattern and design scene with repeating motifs, symmetry, and artistic elements",
  ],
  "SEL/Emotions": [
    "emotions identification scene with diverse children showing different feelings",
    "friendship and kindness illustration with children cooperating and sharing",
    "self-regulation scene with calming strategies and mindfulness elements",
    "growth mindset illustration showing persistence, effort, and achievement",
    "empathy and understanding scene with diverse characters in social situations",
  ],
  "Back to School": [
    "first day of school illustration with backpack, supplies, and excited children",
    "classroom setup scene with desks, books, and welcoming decorations",
    "school rules and routines illustration with friendly visual reminders",
    "making friends scene with diverse children introducing themselves",
    "school supply organization illustration with labeled materials and storage",
  ],
  "Summer Review": [
    "summer learning scene with outdoor activities and educational elements",
    "vacation journal illustration with travel, nature, and discovery themes",
    "summer reading scene with books, hammock, and relaxing outdoor setting",
    "outdoor math illustration with nature counting, measuring, and patterns",
    "summer science exploration with insects, plants, and nature observation",
  ],
};

function getSubjectPrompt(subject: string, pageIndex: number): string {
  const prompts = SUBJECT_PROMPTS[subject] || SUBJECT_PROMPTS["Math"];
  return prompts[pageIndex % prompts.length];
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

async function generateWorkbookPage(pageIndex: number, job: GenerationJob): Promise<PageResult> {
  const opts = job.options as WorkbookOptions;

  // First page is the cover
  if (pageIndex === 0) {
    const coverPrompt = buildImagePrompt({
      subject: `book cover illustration for "${opts.coverTitle || opts.subject + ' Workbook'}", ${getThemeModifier(opts.theme)}`,
      additionalDetails: `professional educational workbook cover design, vibrant and appealing, ${getGradeLevelModifier(opts.gradeLevel)}`,
    });
    const { imageUrl } = await generatePageImage(coverPrompt);
    return { pageNumber: 1, imageUrl, status: "success" };
  }

  // Regular activity pages
  const subjectPrompt = getSubjectPrompt(opts.subject, pageIndex - 1);
  const prompt = buildImagePrompt({
    subject: `${subjectPrompt}, ${getThemeModifier(opts.theme)}`,
    additionalDetails: `educational activity page illustration, ${getGradeLevelModifier(opts.gradeLevel)}, suitable for a ${opts.subject} workbook`,
  });

  const { imageUrl } = await generatePageImage(prompt);
  return { pageNumber: pageIndex + 1, imageUrl, status: "success" };
}

export function createWorkbookJob(options: WorkbookOptions): string {
  const totalPages = options.pageCount + 1; // +1 for cover
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
  await processChunk(job, generateWorkbookPage);
}
