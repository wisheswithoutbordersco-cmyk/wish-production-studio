/**
 * Outdoor Learning Generator
 * Generates scavenger hunts, nature journals, outdoor math, seasonal explorer guides, etc.
 */
import { buildImagePrompt, generatePageImage, processChunk } from "./shared";
import { createJob, getJob, type GenerationJob, type PageResult } from "../jobs";

export interface OutdoorLearningOptions {
  activityType: string;
  season: string;
  biome: string;
  ageRange: string;
  culturalConnection: string;
  pageCount: number;
}

const ACTIVITY_PROMPTS: Record<string, string[]> = {
  "Scavenger Hunt": [
    "nature scavenger hunt checklist page with illustrated icons of items to find in nature",
    "outdoor treasure hunt activity with illustrated clues and nature items arranged in a grid",
    "I-spy nature page with detailed illustrated scene containing hidden natural objects to find",
    "seasonal nature bingo card layout with illustrated squares showing plants, animals, and natural phenomena",
    "nature walk observation page with illustrated frames for drawing or checking off discoveries",
  ],
  "Nature Journal": [
    "nature journal observation page with illustrated border of leaves, flowers, and insects, large blank area for drawing",
    "plant growth tracking page with illustrated stages of plant development and observation boxes",
    "weather observation journal page with illustrated weather symbols and recording spaces",
    "animal tracking journal page with illustrated animal footprints and habitat scenes",
    "seasonal changes observation page with illustrated trees showing different seasons",
  ],
  "Outdoor Math": [
    "nature-themed counting activity page with illustrated groups of natural objects to count",
    "pattern recognition activity with illustrated natural patterns (leaves, shells, flowers) to continue",
    "measurement activity page with illustrated natural objects to compare sizes",
    "shape hunt activity with illustrated natural objects that match geometric shapes",
    "nature sorting and graphing activity with illustrated categories of natural items",
  ],
  "Seasonal Explorer": [
    "seasonal exploration guide page with illustrated seasonal activities and nature observations",
    "seasonal craft activity page with illustrated step-by-step nature craft instructions",
    "seasonal food and foraging guide with illustrated edible plants and seasonal produce",
    "seasonal animal behavior page with illustrated animals in their seasonal activities",
    "seasonal weather and sky observation page with illustrated cloud types and weather patterns",
  ],
  "Bird/Plant ID Guide": [
    "bird identification page with detailed illustrated bird species in their natural habitat",
    "plant identification page with detailed illustrated leaf shapes, flowers, and bark patterns",
    "tree identification guide page with illustrated tree silhouettes, leaves, and bark textures",
    "wildflower identification page with detailed illustrated flowers and their key features",
    "bird feather and nest identification page with illustrated examples",
  ],
  "Weather Tracker": [
    "weather tracking chart page with illustrated weather symbols and daily recording grid",
    "cloud identification page with illustrated cloud types and sky conditions",
    "temperature tracking page with illustrated thermometer and daily recording spaces",
    "wind and rain measurement page with illustrated instruments and recording areas",
    "seasonal weather comparison page with illustrated weather patterns across months",
  ],
  "Garden Planner": [
    "garden planning grid page with illustrated plant spacing guide and plot layout",
    "seed starting calendar page with illustrated seedlings and planting timeline",
    "plant care checklist page with illustrated watering, sunlight, and soil needs",
    "garden harvest tracker page with illustrated vegetables and fruits with recording spaces",
    "companion planting guide page with illustrated plant pairs that grow well together",
  ],
};

function getActivityPrompt(activityType: string, pageIndex: number): string {
  const prompts = ACTIVITY_PROMPTS[activityType] || ACTIVITY_PROMPTS["Scavenger Hunt"];
  return prompts[pageIndex % prompts.length];
}

async function generateOutdoorPage(pageIndex: number, job: GenerationJob): Promise<PageResult> {
  const opts = job.options as OutdoorLearningOptions;
  const activityPrompt = getActivityPrompt(opts.activityType, pageIndex);

  const prompt = buildImagePrompt({
    subject: activityPrompt,
    theme: `${opts.season} ${opts.biome}`,
    culturalVariant: opts.culturalConnection,
    ageRange: opts.ageRange,
    additionalDetails: "nature-themed educational illustration, detailed botanical and zoological accuracy, print-ready worksheet design",
  });

  const { imageUrl } = await generatePageImage(prompt);

  return {
    pageNumber: pageIndex + 1,
    imageUrl,
    status: "success",
  };
}

export function createOutdoorLearningJob(options: OutdoorLearningOptions): string {
  const job = createJob(
    "outdoor-learning",
    options.pageCount,
    options,
    `outdoor-${options.activityType.toLowerCase().replace(/\s+/g, "-")}.pdf`
  );
  return job.id;
}

export async function processOutdoorLearningChunk(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");
  await processChunk(job, generateOutdoorPage);
}
