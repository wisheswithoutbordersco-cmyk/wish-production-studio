/**
 * Worksheet Generator (Single Page / Batch)
 * Generates educational worksheets with GPT content and Flux decorative borders.
 */
import { buildImagePrompt, generatePageImage, generateContent, processChunk } from "./shared";
import { createJob, getJob, type GenerationJob, type PageResult } from "../jobs";

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

async function generateWorksheetPage(pageIndex: number, job: GenerationJob): Promise<PageResult> {
  const opts = job.options as WorksheetOptions;

  // Generate decorative border/theme illustration
  const prompt = buildImagePrompt({
    subject: `decorative page border and frame design for a ${opts.subject} ${opts.specificSkill} worksheet`,
    theme: opts.theme,
    additionalDetails: `elegant border frame with themed decorative elements around the edges, large white/blank center area for content, suitable for ${opts.gradeLevel} grade level educational worksheet, print-ready`,
  });

  const { imageUrl } = await generatePageImage(prompt);

  return {
    pageNumber: pageIndex + 1,
    imageUrl,
    status: "success",
  };
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
  await processChunk(job, generateWorksheetPage);
}

export function getSkillsForSubject(subject: string): string[] {
  return SKILL_MAP[subject] || [];
}
