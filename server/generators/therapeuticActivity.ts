/**
 * Therapeutic Activity Generator
 * Generates neurodivergent-friendly activities, sensory worksheets, emotional regulation tools,
 * visual schedules, calm-down kits, etc.
 */
import { buildImagePrompt, generatePageImage, processChunk } from "./shared";
import { createJob, getJob, type GenerationJob, type PageResult } from "../jobs";

export interface TherapeuticActivityOptions {
  activityType: string;
  target: string;
  representation: string;
  ageRange: string;
  pageCount: number;
}

const ACTIVITY_PROMPTS: Record<string, string[]> = {
  "Visual Schedule": [
    "visual schedule template with illustrated daily routine icons in a clear sequential layout, calming pastel colors",
    "morning routine visual schedule with illustrated step-by-step activities in rounded boxes",
    "after-school routine visual schedule with illustrated activities in a clear vertical timeline",
    "bedtime routine visual schedule with soothing illustrated steps in a calming color palette",
    "weekend activity visual schedule with illustrated choices and time blocks",
  ],
  "Calm-Down Kit": [
    "calm-down strategy card with illustrated breathing exercise showing a child doing deep breaths, soothing muted colors",
    "sensory grounding activity illustration showing 5-4-3-2-1 senses technique with calming imagery",
    "progressive muscle relaxation guide with illustrated body positions, gentle pastel tones",
    "calm-down corner setup guide with illustrated cozy safe space elements",
    "emotional thermometer illustration showing escalating feelings with calming strategies at each level",
  ],
  "Sensory Activity": [
    "sensory exploration activity page with illustrated tactile, visual, and auditory activities in organized sections",
    "sensory diet checklist with illustrated sensory activities categorized by type (proprioceptive, vestibular, tactile)",
    "sensory bin activity guide with illustrated themed sensory materials and tools",
    "body awareness activity page with illustrated exercises for spatial awareness and coordination",
    "sensory break menu with illustrated quick sensory activities in a choice-board format",
  ],
  "Emotional Regulation": [
    "feelings identification page with illustrated diverse child faces showing different emotions in a grid",
    "emotion zones chart with illustrated characters showing different emotional states with color coding",
    "coping strategies wheel with illustrated calming techniques arranged in a circular format",
    "feelings journal page with illustrated emotion faces and space for expression, gentle colors",
    "anger management steps illustrated with a diverse child character going through calming stages",
  ],
  "Executive Function": [
    "task breakdown template with illustrated steps showing how to break a big task into small pieces",
    "planning and organization page with illustrated checklist format and priority markers",
    "time management visual aid with illustrated clock and activity blocks",
    "working memory game page with illustrated memory matching activity",
    "flexible thinking activity with illustrated problem-solving scenarios",
  ],
  "Social Stories": [
    "social story page with illustrated diverse children in a social situation, clear sequential panels",
    "friendship skills illustrated scenario showing positive social interaction between diverse children",
    "taking turns illustrated social story with diverse characters in a clear step-by-step format",
    "asking for help illustrated social story with a diverse child character in school setting",
    "managing frustration illustrated social story with calming strategies shown step by step",
  ],
  "Fidget Alternatives": [
    "fidget alternatives menu with illustrated quiet hand activities for focus, organized in a grid",
    "desk fidget options illustrated guide showing appropriate classroom movement alternatives",
    "quiet body strategies illustrated page with diverse child showing calm body positions",
    "focus tools illustrated guide with various tactile and movement options for attention",
    "movement break cards with illustrated quick exercises for refocusing energy",
  ],
  "Routine Cards": [
    "daily routine cards set with illustrated individual activity icons, clear and simple design",
    "transition cards with illustrated timer and next-activity previews, calming colors",
    "choice board with illustrated activity options in a grid format, diverse characters",
    "first-then board template with illustrated sequential activity cards",
    "reward chart with illustrated goals and progress tracking, motivating design",
  ],
};

function getActivityPrompt(activityType: string, pageIndex: number): string {
  const prompts = ACTIVITY_PROMPTS[activityType] || ACTIVITY_PROMPTS["Visual Schedule"];
  return prompts[pageIndex % prompts.length];
}

function getRepresentationPrompt(representation: string): string {
  if (representation === "No specific" || representation === "Mixed/Diverse") {
    return "featuring diverse children of multiple ethnicities";
  }
  return `featuring ${representation} children with authentic cultural representation`;
}

function getTargetModifier(target: string): string {
  const modifiers: Record<string, string> = {
    "ADHD": "high-energy friendly with clear visual structure and minimal distractions",
    "Autism/ASD": "predictable layout with clear visual boundaries, literal imagery, minimal sensory overload",
    "Anxiety": "calming soothing imagery with soft colors and reassuring visual elements",
    "Sensory Processing": "clean uncluttered design with clear visual hierarchy and sensory-friendly colors",
    "General Self-Regulation": "supportive and encouraging design with clear emotional cues",
    "OT (Occupational Therapy) Support": "functional skill-building focused with clear step-by-step visual guides",
  };
  return modifiers[target] || modifiers["General Self-Regulation"];
}

async function generateTherapeuticPage(pageIndex: number, job: GenerationJob): Promise<PageResult> {
  const opts = job.options as TherapeuticActivityOptions;
  const activityPrompt = getActivityPrompt(opts.activityType, pageIndex);
  const repPrompt = getRepresentationPrompt(opts.representation);
  const targetMod = getTargetModifier(opts.target);

  const prompt = buildImagePrompt({
    subject: `${activityPrompt}, ${repPrompt}`,
    ageRange: opts.ageRange,
    colorPalette: "muted soothing pastel colors, calming tones",
    additionalDetails: `${targetMod}, therapeutic educational material, gentle and supportive visual design`,
  });

  const { imageUrl } = await generatePageImage(prompt);

  return {
    pageNumber: pageIndex + 1,
    imageUrl,
    status: "success",
  };
}

export function createTherapeuticActivityJob(options: TherapeuticActivityOptions): string {
  const job = createJob(
    "therapeutic-activity",
    options.pageCount,
    options,
    `therapeutic-${options.activityType.toLowerCase().replace(/\s+/g, "-")}.pdf`
  );
  return job.id;
}

export async function processTherapeuticActivityChunk(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");
  await processChunk(job, generateTherapeuticPage);
}
