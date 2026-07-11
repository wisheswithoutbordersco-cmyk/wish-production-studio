/**
 * Batch Variant Generator
 * Takes any product concept and generates multiple cultural/thematic variants automatically.
 * Loops the chunked generation pattern across all selected variant dimensions.
 */
import { getJob, type GenerationJob } from "../jobs";
import { createBrainTrainingJob, processBrainTrainingChunk } from "./brainTraining";
import { createCulturalGameJob, processCulturalGameChunk } from "./culturalGame";
import { createFlashcardJob, processFlashcardChunk } from "./flashcard";
import { createWorksheetJob, processWorksheetChunk } from "./worksheet";
import { createOutdoorLearningJob, processOutdoorLearningChunk } from "./outdoorLearning";
import { createTherapeuticActivityJob, processTherapeuticActivityChunk } from "./therapeuticActivity";
import { generateContent } from "./shared";

export interface BatchVariantOptions {
  customPrompt?: string;
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

interface BatchVariantDefinition {
  name: string;
  customPrompt?: string;
}

export interface BatchVariantJobResult {
  variant: string;
  jobId: string;
  status: GenerationJob["status"] | "error";
  pdfUrl: string | null;
  filename: string | null;
}

function getPresetVariants(variantType: string): BatchVariantDefinition[] {
  let variants: string[];

  switch (variantType) {
    case "Cultural":
      variants = CULTURAL_VARIANTS;
      break;
    case "Theme":
      variants = THEME_VARIANTS;
      break;
    case "Age":
      variants = AGE_VARIANTS;
      break;
    case "Difficulty":
      variants = DIFFICULTY_VARIANTS;
      break;
    case "Seasonal":
      variants = SEASONAL_VARIANTS;
      break;
    default:
      variants = CULTURAL_VARIANTS;
  }

  return variants.map(name => ({ name }));
}

/**
 * Parse a user-supplied production playlist into independent variant jobs.
 * GPT-4o is provided by the existing OpenRouter-backed generateContent helper.
 */
async function parseCustomPromptVariants(customPrompt: string): Promise<BatchVariantDefinition[]> {
  const content = await generateContent({
    systemPrompt: `You are a strict production-playlist parser for a batch digital-product generator.

The user's custom prompt is the complete creative direction and overrides all preset cultural, theme, age, difficulty, and seasonal variant lists. Extract each distinct item or deliverable the user asks to generate, preserving the original order.

Return a JSON object with an "items" array. Every item must contain:
- "name": a concise human-readable label taken from that item
- "prompt": a self-contained creative brief containing the relevant section of the user's prompt

If introductory or closing instructions apply to every item, include those shared instructions in every item's prompt. Preserve the user's details, wording, required text, style, layout, audience, and constraints. Do not invent a preset variant, do not append cultural/theme labels, do not rewrite the request as "Create this as the ... variant", and do not add creative direction that the user did not request. If the prompt requests one deliverable, return exactly one item. Return JSON only.`,
    userPrompt: customPrompt,
    responseFormat: { type: "json_object" },
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("GPT-4o returned an invalid custom-prompt playlist response.");
  }

  const items = parsed && typeof parsed === "object" && Array.isArray((parsed as { items?: unknown }).items)
    ? (parsed as { items: unknown[] }).items
    : [];

  const variants = items.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];

    const name = typeof (item as { name?: unknown }).name === "string"
      ? (item as { name: string }).name.trim()
      : "";
    const prompt = typeof (item as { prompt?: unknown }).prompt === "string"
      ? (item as { prompt: string }).prompt.trim()
      : "";

    if (!prompt) return [];

    return [{
      name: name || `Custom Item ${index + 1}`,
      customPrompt: prompt,
    }];
  });

  if (variants.length === 0) {
    throw new Error("GPT-4o could not identify any generation items in the custom prompt.");
  }

  return variants;
}

export interface BatchJob {
  id: string;
  status: "pending" | "generating" | "complete" | "error";
  variants: BatchVariantDefinition[];
  variantJobs: BatchVariantJobResult[];
  currentVariantIndex: number;
  totalVariants: number;
  statusMessage: string;
  errorMessage: string | null;
  options: BatchVariantOptions;
  createdAt: number;
}

const batchJobs = new Map<string, BatchJob>();

export async function createBatchVariantJob(options: BatchVariantOptions): Promise<string> {
  const customPrompt = options.customPrompt?.trim();
  const variants = customPrompt
    ? await parseCustomPromptVariants(customPrompt)
    : getPresetVariants(options.variantType);
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
    options: {
      ...options,
      customPrompt,
    },
    createdAt: Date.now(),
  };

  batchJobs.set(id, batchJob);
  return id;
}

export function getBatchJob(id: string): BatchJob | undefined {
  return batchJobs.get(id);
}

function createVariantSubJob(batch: BatchJob, variant: BatchVariantDefinition): string {
  const opts = batch.options;
  const hasCustomPrompt = Boolean(opts.customPrompt);
  const variantName = variant.name;
  const variantCustomPrompt = variant.customPrompt;

  switch (opts.baseProductType) {
    case "Brain Training":
      return createBrainTrainingJob({
        customPrompt: variantCustomPrompt,
        activityType: "Bilateral Coordination",
        theme: !hasCustomPrompt && opts.variantType === "Theme" ? variantName : "Animals",
        culturalVariant: !hasCustomPrompt && opts.variantType === "Cultural" ? variantName : "None",
        ageRange: !hasCustomPrompt && opts.variantType === "Age" ? variantName : "5-6",
        pageCount: opts.pagesPerVariant,
        difficulty: !hasCustomPrompt && opts.variantType === "Difficulty" ? variantName : "Medium",
      });

    case "Cultural Game":
      return createCulturalGameJob({
        customPrompt: variantCustomPrompt,
        gameType: "Trivia Cards",
        culturalEdition: !hasCustomPrompt && opts.variantType === "Cultural" ? variantName : "General Knowledge",
        occasion: "Family Game Night",
        cardCount: opts.pagesPerVariant * 4,
        ageAppropriate: "Family (all ages)",
      });

    case "Flashcard":
      return createFlashcardJob({
        customPrompt: variantCustomPrompt,
        subject: "Animals",
        languages: "English + Spanish",
        style: "Bold and Simple",
        cardsPerSet: opts.pagesPerVariant * 4,
        cardSize: "Standard (3x5)",
      });

    case "Worksheet":
      return createWorksheetJob({
        customPrompt: variantCustomPrompt,
        subject: "Math",
        specificSkill: "Addition",
        gradeLevel: !hasCustomPrompt && opts.variantType === "Age" ? variantName : "1st",
        theme: !hasCustomPrompt && opts.variantType === "Theme" ? variantName : "Animals",
        quantity: opts.pagesPerVariant,
      });

    case "Outdoor Learning":
      return createOutdoorLearningJob({
        customPrompt: variantCustomPrompt,
        activityType: "Scavenger Hunt",
        season: !hasCustomPrompt && opts.variantType === "Seasonal" ? variantName : "All Seasons",
        biome: "Backyard",
        ageRange: !hasCustomPrompt && opts.variantType === "Age" ? variantName : "5-7",
        culturalConnection: !hasCustomPrompt && opts.variantType === "Cultural" ? variantName : "None",
        pageCount: opts.pagesPerVariant,
      });

    case "Therapeutic Activity":
      return createTherapeuticActivityJob({
        customPrompt: variantCustomPrompt,
        activityType: "Visual Schedule",
        target: "General Self-Regulation",
        representation: !hasCustomPrompt && opts.variantType === "Cultural" ? `${variantName} American` : "Mixed/Diverse",
        ageRange: !hasCustomPrompt && opts.variantType === "Age" ? variantName : "5-7",
        pageCount: opts.pagesPerVariant,
      });

    default:
      return createBrainTrainingJob({
        customPrompt: variantCustomPrompt,
        activityType: "Bilateral Coordination",
        theme: hasCustomPrompt ? "Animals" : variantName,
        culturalVariant: "None",
        ageRange: "5-6",
        pageCount: opts.pagesPerVariant,
        difficulty: "Medium",
      });
  }
}

async function processVariantSubJob(baseProductType: string, subJobId: string): Promise<void> {
  switch (baseProductType) {
    case "Brain Training":
      await processBrainTrainingChunk(subJobId);
      break;
    case "Cultural Game":
      await processCulturalGameChunk(subJobId);
      break;
    case "Flashcard":
      await processFlashcardChunk(subJobId);
      break;
    case "Worksheet":
      await processWorksheetChunk(subJobId);
      break;
    case "Outdoor Learning":
      await processOutdoorLearningChunk(subJobId);
      break;
    case "Therapeutic Activity":
      await processTherapeuticActivityChunk(subJobId);
      break;
    default:
      await processBrainTrainingChunk(subJobId);
  }
}

function syncVariantResult(entry: BatchVariantJobResult, subJob: GenerationJob): void {
  entry.status = subJob.status;
  entry.pdfUrl = subJob.pdfUrl;
  entry.filename = subJob.filename;
}

function finishBatchIfReady(batch: BatchJob): void {
  if (batch.currentVariantIndex < batch.totalVariants) return;

  batch.status = "complete";
  const completedCount = batch.variantJobs.filter(entry => entry.pdfUrl).length;
  batch.statusMessage = completedCount === batch.totalVariants
    ? `All ${batch.totalVariants} variants complete!`
    : `Batch complete: ${completedCount} of ${batch.totalVariants} variant PDFs are ready.`;
}

/**
 * Process the next chunk of the current variant.
 * A variant remains current until its individual generator has finalized its PDF.
 */
export async function processBatchVariantChunk(batchId: string): Promise<void> {
  const batch = batchJobs.get(batchId);
  if (!batch) throw new Error("Batch job not found");

  finishBatchIfReady(batch);
  if (batch.status === "complete") return;

  batch.status = "generating";
  const variant = batch.variants[batch.currentVariantIndex];
  batch.statusMessage = `Generating variant ${batch.currentVariantIndex + 1}/${batch.totalVariants}: ${variant.name}`;

  let entry = batch.variantJobs[batch.currentVariantIndex];

  try {
    if (!entry) {
      const subJobId = createVariantSubJob(batch, variant);
      entry = {
        variant: variant.name,
        jobId: subJobId,
        status: "pending",
        pdfUrl: null,
        filename: null,
      };
      batch.variantJobs.push(entry);
    }

    const currentSubJob = getJob(entry.jobId);
    if (!currentSubJob) {
      throw new Error("Variant sub-job not found");
    }

    if (currentSubJob.status !== "complete" && currentSubJob.status !== "partial" && currentSubJob.status !== "error") {
      await processVariantSubJob(batch.options.baseProductType, entry.jobId);
    }

    const updatedSubJob = getJob(entry.jobId);
    if (!updatedSubJob) {
      throw new Error("Variant sub-job disappeared during generation");
    }

    syncVariantResult(entry, updatedSubJob);

    if (updatedSubJob.status === "complete" || updatedSubJob.status === "partial" || updatedSubJob.status === "error") {
      batch.currentVariantIndex++;
      finishBatchIfReady(batch);
    } else {
      batch.statusMessage = `${variant.name}: ${updatedSubJob.statusMessage}`;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";

    if (entry) {
      entry.status = "error";
    } else {
      batch.variantJobs.push({
        variant: variant.name,
        jobId: "",
        status: "error",
        pdfUrl: null,
        filename: null,
      });
    }

    batch.currentVariantIndex++;
    batch.statusMessage = `Error on variant "${variant.name}": ${errorMsg}. Continuing...`;
    finishBatchIfReady(batch);
  }
}
