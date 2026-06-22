/**
 * Batch Variant Generator
 * Takes any product concept and generates multiple cultural/thematic variants automatically.
 * Loops the chunked generation pattern across all selected variant dimensions.
 */
import { createJob, getJob, updateJob, type GenerationJob, type PageResult } from "../jobs";
import { createBrainTrainingJob, processBrainTrainingChunk } from "./brainTraining";
import { createCulturalGameJob, processCulturalGameChunk } from "./culturalGame";
import { createFlashcardJob, processFlashcardChunk } from "./flashcard";
import { createWorksheetJob, processWorksheetChunk } from "./worksheet";
import { createOutdoorLearningJob, processOutdoorLearningChunk } from "./outdoorLearning";
import { createTherapeuticActivityJob, processTherapeuticActivityChunk } from "./therapeuticActivity";

export interface BatchVariantOptions {
  baseProductType: string;
  baseConcept: string;
  variantType: string; // "Cultural" | "Theme" | "Age" | "Difficulty" | "Seasonal"
  pagesPerVariant: number;
}

const CULTURAL_VARIANTS = ["African", "Caribbean", "South Asian", "East Asian", "Latin American", "Middle Eastern"];
const THEME_VARIANTS = ["Animals", "Space", "Ocean", "Dinosaurs", "Nature", "Vehicles", "Food", "Sports", "Music", "Cultural Heritage"];
const AGE_VARIANTS = ["3-4", "4-5", "5-6", "6-7", "7-8"];
const DIFFICULTY_VARIANTS = ["Easy", "Medium", "Hard", "Progressive"];
const SEASONAL_VARIANTS = ["Spring", "Summer", "Fall", "Winter", "All Seasons"];

function getVariants(variantType: string): string[] {
  switch (variantType) {
    case "Cultural": return CULTURAL_VARIANTS;
    case "Theme": return THEME_VARIANTS;
    case "Age": return AGE_VARIANTS;
    case "Difficulty": return DIFFICULTY_VARIANTS;
    case "Seasonal": return SEASONAL_VARIANTS;
    default: return CULTURAL_VARIANTS;
  }
}

export interface BatchJob {
  id: string;
  status: "pending" | "generating" | "complete" | "error";
  variants: string[];
  variantJobs: Array<{ variant: string; jobId: string; status: string }>;
  currentVariantIndex: number;
  totalVariants: number;
  statusMessage: string;
  errorMessage: string | null;
  options: BatchVariantOptions;
  createdAt: number;
}

const batchJobs = new Map<string, BatchJob>();

export function createBatchVariantJob(options: BatchVariantOptions): string {
  const variants = getVariants(options.variantType);
  const id = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  const batchJob: BatchJob = {
    id,
    status: "pending",
    variants,
    variantJobs: [],
    currentVariantIndex: 0,
    totalVariants: variants.length,
    statusMessage: `Preparing ${variants.length} variants...`,
    errorMessage: null,
    options,
    createdAt: Date.now(),
  };

  batchJobs.set(id, batchJob);
  return id;
}

export function getBatchJob(id: string): BatchJob | undefined {
  return batchJobs.get(id);
}

/**
 * Process the next variant in the batch.
 * Creates a sub-job for the current variant and starts its generation.
 */
export async function processBatchVariantChunk(batchId: string): Promise<void> {
  const batch = batchJobs.get(batchId);
  if (!batch) throw new Error("Batch job not found");

  if (batch.currentVariantIndex >= batch.totalVariants) {
    batch.status = "complete";
    batch.statusMessage = `All ${batch.totalVariants} variants complete!`;
    return;
  }

  batch.status = "generating";
  const variant = batch.variants[batch.currentVariantIndex];
  batch.statusMessage = `Generating variant ${batch.currentVariantIndex + 1}/${batch.totalVariants}: ${variant}`;

  // Create a sub-job for this variant based on the base product type
  const opts = batch.options;
  let subJobId: string;

  try {
    switch (opts.baseProductType) {
      case "Brain Training":
        subJobId = createBrainTrainingJob({
          activityType: "Bilateral Coordination",
          theme: opts.variantType === "Theme" ? variant : "Animals",
          culturalVariant: opts.variantType === "Cultural" ? variant : "None",
          ageRange: opts.variantType === "Age" ? variant : "5-6",
          pageCount: opts.pagesPerVariant,
          difficulty: opts.variantType === "Difficulty" ? variant : "Medium",
        });
        await processBrainTrainingChunk(subJobId);
        break;

      case "Cultural Game":
        subJobId = createCulturalGameJob({
          gameType: "Trivia Cards",
          culturalEdition: opts.variantType === "Cultural" ? variant : "General Knowledge",
          occasion: "Family Game Night",
          cardCount: opts.pagesPerVariant * 4,
          ageAppropriate: "Family (all ages)",
        });
        await processCulturalGameChunk(subJobId);
        break;

      case "Flashcard":
        subJobId = createFlashcardJob({
          subject: "Animals",
          languages: "English + Spanish",
          style: "Bold and Simple",
          cardsPerSet: opts.pagesPerVariant * 4,
          cardSize: "Standard (3x5)",
        });
        await processFlashcardChunk(subJobId);
        break;

      case "Worksheet":
        subJobId = createWorksheetJob({
          subject: "Math",
          specificSkill: "Addition",
          gradeLevel: opts.variantType === "Age" ? variant : "1st",
          theme: opts.variantType === "Theme" ? variant : "Animals",
          quantity: opts.pagesPerVariant,
        });
        await processWorksheetChunk(subJobId);
        break;

      case "Outdoor Learning":
        subJobId = createOutdoorLearningJob({
          activityType: "Scavenger Hunt",
          season: opts.variantType === "Seasonal" ? variant : "All Seasons",
          biome: "Backyard",
          ageRange: opts.variantType === "Age" ? variant : "5-7",
          culturalConnection: opts.variantType === "Cultural" ? variant : "None",
          pageCount: opts.pagesPerVariant,
        });
        await processOutdoorLearningChunk(subJobId);
        break;

      case "Therapeutic Activity":
        subJobId = createTherapeuticActivityJob({
          activityType: "Visual Schedule",
          target: "General Self-Regulation",
          representation: opts.variantType === "Cultural" ? `${variant} American` : "Mixed/Diverse",
          ageRange: opts.variantType === "Age" ? variant : "5-7",
          pageCount: opts.pagesPerVariant,
        });
        await processTherapeuticActivityChunk(subJobId);
        break;

      default:
        subJobId = createBrainTrainingJob({
          activityType: "Bilateral Coordination",
          theme: variant,
          culturalVariant: "None",
          ageRange: "5-6",
          pageCount: opts.pagesPerVariant,
          difficulty: "Medium",
        });
        await processBrainTrainingChunk(subJobId);
    }

    batch.variantJobs.push({ variant, jobId: subJobId, status: "generating" });
    batch.currentVariantIndex++;

    // Check sub-job status
    const subJob = getJob(subJobId);
    if (subJob) {
      const entry = batch.variantJobs[batch.variantJobs.length - 1];
      entry.status = subJob.status;
    }

    if (batch.currentVariantIndex >= batch.totalVariants) {
      batch.status = "complete";
      batch.statusMessage = `All ${batch.totalVariants} variants complete!`;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    batch.variantJobs.push({ variant, jobId: "", status: "error" });
    batch.currentVariantIndex++;
    batch.statusMessage = `Error on variant "${variant}": ${errorMsg}. Continuing...`;
  }
}
