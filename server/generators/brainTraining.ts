/**
 * Brain Training Generator
 * Generates bilateral coordination, stroke practice, and fine motor skills worksheets.
 */
import { generateFullPageImage, processChunk } from "./shared";
import { createJob, getJob, type GenerationJob, type PageResult } from "../jobs";

// Short, child-facing instruction for each activity type so every page tells
// the learner what to do (fixes "no instructions" symptom).
const ACTIVITY_INSTRUCTIONS: Record<string, string> = {
  "Bilateral Coordination":
    "Use both hands together. Trace each side of the pattern at the same time, following the dotted lines.",
  "Stroke Practice":
    "Trace each dotted line in the direction of the arrows. Start at the dot and follow the path smoothly.",
  "Fine Motor":
    "Carefully trace or cut along the lines. Stay on the path and take your time.",
};

function getActivityInstruction(activityType: string): string {
  return (
    ACTIVITY_INSTRUCTIONS[activityType] ||
    "Follow the lines and complete the activity at your own pace."
  );
}

export interface BrainTrainingOptions {
  customPrompt?: string;
  activityType: string; // "Bilateral Coordination" | "Stroke Practice" | "Fine Motor"
  theme: string;
  culturalVariant: string;
  ageRange: string;
  pageCount: number;
  difficulty: string;
}

const ACTIVITY_PROMPTS: Record<string, string[]> = {
  "Bilateral Coordination": [
    "symmetrical mirror drawing activity with a dotted center line, showing half of a pattern on one side for the child to mirror on the other side",
    "bilateral tracing paths that curve symmetrically on both sides of the page, with start and end points marked by dots",
    "symmetrical maze with identical wide-open paths on left and right sides that must be traced simultaneously — maze grid takes up 80% of the page, paths clearly traceable from START to FINISH with no overlapping decorative elements blocking the routes",
    "mirror image completion activity showing half of an illustrated object with guide dots for completing the other half",
    "cross-midline tracing activity with flowing curved paths that cross from left to right side of the page",
  ],
  "Stroke Practice": [
    "handwriting stroke practice paths with large dotted directional arrows showing stroke direction, smooth flowing curves",
    "pre-writing stroke patterns with thick dotted lines to trace, showing vertical, horizontal, and diagonal strokes",
    "letter formation practice paths with numbered starting points and directional arrows, large format for young learners",
    "continuous stroke practice with looping patterns and wave-like paths to trace, varying in complexity",
    "zigzag and spiral stroke patterns with clear start points and directional guides for pencil control",
  ],
  "Fine Motor": [
    "cutting practice lines with varying difficulty - straight, wavy, and zigzag paths between illustrated borders",
    "bead path tracing activity with dotted curved lines connecting illustrated beads in a pattern",
    "maze tracing activity where the maze grid takes up 80% of the page — the maze path must be clearly traceable from START to FINISH with one correct solution, paths wide and unobstructed, all decorative themed illustrations placed only around the outer border of the page and never overlapping the maze paths",
    "dot-to-dot connection activity with numbered dots forming a themed illustration when connected",
    "lacing card template with evenly spaced holes around a themed illustration border for threading practice",
  ],
};

function getActivityPrompt(activityType: string, pageIndex: number): string {
  const prompts = ACTIVITY_PROMPTS[activityType] || ACTIVITY_PROMPTS["Bilateral Coordination"];
  return prompts[pageIndex % prompts.length];
}

function getDifficultyModifier(difficulty: string, pageIndex: number, totalPages: number): string {
  if (difficulty === "Progressive") {
    const progress = pageIndex / totalPages;
    if (progress < 0.33) return "simple and easy with thick lines and large spaces";
    if (progress < 0.66) return "moderate difficulty with medium-width paths";
    return "challenging with thin lines and complex patterns";
  }
  const modifiers: Record<string, string> = {
    "Easy": "simple and easy with thick bold lines, large spaces, and minimal complexity",
    "Medium": "moderate difficulty with clear paths and some complexity",
    "Hard": "challenging with thin detailed lines, complex patterns, and intricate paths",
  };
  return modifiers[difficulty] || modifiers["Medium"];
}

async function generateBrainTrainingPage(pageIndex: number, job: GenerationJob): Promise<PageResult> {
  const opts = job.options as BrainTrainingOptions;
  const activityPrompt = getActivityPrompt(opts.activityType, pageIndex);
  const difficultyMod = getDifficultyModifier(opts.difficulty, pageIndex, job.totalPages);
  const isMaze = activityPrompt.toLowerCase().includes("maze");
  const activityName = `${opts.activityType} — ${difficultyMod.split(",")[0]}`;
  const instruction = getActivityInstruction(opts.activityType);
  const exactText = [activityName, instruction];
  if (isMaze) exactText.push("START", "FINISH");

  const { imageUrl } = await generateFullPageImage({
    generatorType: "brain-training worksheet",
    pageType: `${opts.activityType} exercise ${pageIndex + 1}`,
    pageNumber: pageIndex + 1,
    totalPages: job.totalPages,
    audience: `${opts.ageRange} learners`,
    creativeDirection: `${activityPrompt}; ${difficultyMod}; ${opts.theme} theme; ${opts.culturalVariant} cultural representation`,
    customPrompt: opts.customPrompt,
    exactText,
    layoutGuidance: "Create a complete portrait activity sheet with a bold title and concise instruction panel at the top, then make the functional tracing, coordination, cutting, dot-to-dot, or maze exercise the dominant element filling most of the page. Keep the exercise centered, large, and unobstructed, with a compact branded footer.",
    styleGuidance: "Clean high-contrast black-and-white line-art worksheet, professional occupational-therapy resource typography, thick print-safe outlines, minimal visual clutter, small themed mascot or border accents only where they do not interfere with the activity.",
    functionalRequirements: [
      "All tracing and cutting paths must be continuous, clearly visible, and practical to complete with a pencil or scissors.",
      isMaze
        ? "The maze must occupy about 75 percent of the usable page, have one clearly traceable solution from START to FINISH, use wide unobstructed paths, and keep all decorative elements outside the maze grid."
        : "The main motor-skills exercise must occupy about 75 percent of the usable page with ample hand-movement space.",
      "Do not add shading or decorative marks inside functional paths.",
    ],
  });

  return {
    pageNumber: pageIndex + 1,
    imageUrl,
    status: "success",
    metadata: { activityName, instruction },
  };
}

export function createBrainTrainingJob(options: BrainTrainingOptions): string {
  const job = createJob(
    "brain-training",
    options.pageCount,
    options,
    `brain-training-${options.activityType.toLowerCase().replace(/\s+/g, "-")}.pdf`
  );
  return job.id;
}

export async function processBrainTrainingChunk(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");
  await processChunk(job, generateBrainTrainingPage);
}
