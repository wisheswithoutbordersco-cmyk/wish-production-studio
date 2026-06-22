/**
 * Outdoor Learning Generator
 * Generates scavenger hunts, nature journals, outdoor math, seasonal explorer guides, etc.
 *
 * Features:
 * - Cover page with title and branding
 * - Each page is a structured activity with text overlays
 * - Uses contentBlocks for: activity name, materials needed, step-by-step instructions
 * - Edge-to-edge background images with no letterboxing
 * - Minimum 6+ pages (cover + 5 activity pages)
 */
import { buildImagePrompt, generatePageImage, generateContent } from "./shared";
import { createJob, getJob, updateJob, addPageResult, type GenerationJob, type PageResult } from "../jobs";
import { assemblePdf, fetchImageBuffer, PageContent } from "../pdfAssembly";
import { storagePut } from "../storage";

export interface OutdoorLearningOptions {
  activityType: string;
  season: string;
  biome: string;
  ageRange: string;
  culturalConnection: string;
  pageCount: number;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

const ACTIVITY_THEMES: Record<string, string[]> = {
  "Scavenger Hunt": [
    "nature scavenger hunt with items to find in the outdoors",
    "outdoor treasure hunt with natural objects to discover",
    "seasonal nature bingo with plants and animals to spot",
    "nature walk observation challenge",
    "backyard explorer discovery mission",
    "park detective investigation activity",
  ],
  "Nature Journal": [
    "plant observation and sketching activity",
    "weather tracking and recording activity",
    "animal behavior observation journal",
    "seasonal changes documentation",
    "nature sounds listening activity",
    "cloud watching and sky observation",
  ],
  "Outdoor Math": [
    "nature counting and grouping activity",
    "outdoor measurement with natural objects",
    "pattern recognition in nature",
    "shape hunting in the environment",
    "nature sorting and classification",
    "estimation using outdoor objects",
  ],
  "Seasonal Explorer": [
    "seasonal nature craft activity",
    "seasonal food and plant identification",
    "seasonal animal behavior observation",
    "seasonal weather exploration",
    "seasonal outdoor games and movement",
    "seasonal sensory exploration walk",
  ],
  "Bird/Plant ID Guide": [
    "bird identification by color and size",
    "leaf shape identification activity",
    "tree bark and silhouette matching",
    "wildflower identification guide",
    "bird song listening activity",
    "plant life cycle observation",
  ],
  "Weather Tracker": [
    "daily weather observation and recording",
    "cloud type identification activity",
    "temperature comparison activity",
    "wind direction and speed estimation",
    "rain measurement activity",
    "seasonal weather pattern tracking",
  ],
  "Garden Planner": [
    "garden plot planning and design",
    "seed starting and growth tracking",
    "plant care schedule creation",
    "harvest tracking and recording",
    "companion planting exploration",
    "garden bug identification",
  ],
};

/**
 * Generate structured activity content using GPT.
 */
async function generateActivityContent(opts: OutdoorLearningOptions, activityIndex: number): Promise<{
  activityName: string;
  objective: string;
  materials: string[];
  steps: string[];
  funFact: string;
}> {
  const themes = ACTIVITY_THEMES[opts.activityType] || ACTIVITY_THEMES["Scavenger Hunt"];
  const theme = themes[activityIndex % themes.length];

  const systemPrompt = `You are an outdoor education expert creating engaging nature-based learning activities for children.
Activities should be safe, educational, and appropriate for ${opts.ageRange}.
Season: ${opts.season}. Biome/environment: ${opts.biome}.
${opts.culturalConnection && opts.culturalConnection !== "None" ? `Include ${opts.culturalConnection} cultural connections where appropriate.` : ""}`;

  const userPrompt = `Create a structured outdoor learning activity about: ${theme}
Season: ${opts.season}, Environment: ${opts.biome}, Ages: ${opts.ageRange}

Return a JSON object:
{
  "activityName": "Short engaging activity title",
  "objective": "One sentence learning objective",
  "materials": ["item 1", "item 2", "item 3"],
  "steps": ["Step 1 instruction", "Step 2 instruction", "Step 3 instruction", "Step 4 instruction", "Step 5 instruction"],
  "funFact": "One interesting nature fact related to this activity"
}

Keep steps simple, clear, and age-appropriate. Materials should be easy to find outdoors or at home.`;

  const content = await generateContent({
    systemPrompt,
    userPrompt,
    responseFormat: { type: "json_object" },
  });

  try {
    const parsed = JSON.parse(content);
    return {
      activityName: parsed.activityName || theme,
      objective: parsed.objective || `Learn about ${theme}`,
      materials: Array.isArray(parsed.materials) ? parsed.materials.slice(0, 5) : ["Notebook", "Pencil", "Magnifying glass"],
      steps: Array.isArray(parsed.steps) ? parsed.steps.slice(0, 5) : ["Go outside", "Observe nature", "Record findings"],
      funFact: parsed.funFact || "Nature is full of amazing discoveries!",
    };
  } catch {
    return {
      activityName: theme,
      objective: `Explore and learn about ${theme}`,
      materials: ["Notebook", "Pencil", "Magnifying glass"],
      steps: ["Go outside to a safe area", "Look carefully at your surroundings", "Record what you observe", "Share your discoveries"],
      funFact: "Scientists discover new species every year!",
    };
  }
}

async function generateOutdoorPage(pageIndex: number, job: GenerationJob): Promise<PageResult> {
  const opts = job.options as OutdoorLearningOptions;

  if (pageIndex === 0) {
    // Cover page
    const prompt = buildImagePrompt({
      subject: `beautiful ${opts.season} ${opts.biome} landscape scene with children exploring nature, outdoor education themed`,
      culturalVariant: opts.culturalConnection,
      additionalDetails: `vibrant nature scene, educational and inviting, ${opts.season} season, ${opts.biome} environment, child-friendly outdoor adventure`,
    });
    const { imageUrl } = await generatePageImage(prompt);
    return {
      pageNumber: 1,
      imageUrl,
      status: "success",
      metadata: { isCover: true },
    };
  }

  // Activity pages
  const themes = ACTIVITY_THEMES[opts.activityType] || ACTIVITY_THEMES["Scavenger Hunt"];
  const theme = themes[(pageIndex - 1) % themes.length];

  const prompt = buildImagePrompt({
    subject: `${opts.season} ${opts.biome} nature scene illustration related to ${theme}`,
    culturalVariant: opts.culturalConnection,
    ageRange: opts.ageRange,
    additionalDetails: `nature-themed educational illustration, detailed botanical and zoological accuracy, soft muted colors to allow text overlay readability, ${opts.season} season atmosphere`,
  });
  const { imageUrl } = await generatePageImage(prompt);

  // Generate structured activity content
  const activityContent = await generateActivityContent(opts, pageIndex - 1);

  return {
    pageNumber: pageIndex + 1,
    imageUrl,
    status: "success",
    metadata: { activityContent },
  };
}

/**
 * Custom chunk processor for outdoor learning.
 */
async function processOutdoorLearningChunkInternal(job: GenerationJob): Promise<void> {
  const PAGES_PER_CHUNK = 3;
  const startIndex = job.nextPageIndex;
  const endIndex = Math.min(startIndex + PAGES_PER_CHUNK, job.totalPages);

  updateJob(job.id, {
    status: "generating",
    statusMessage: `Generating outdoor activities ${startIndex + 1}-${endIndex} of ${job.totalPages}...`,
  });

  for (let i = startIndex; i < endIndex; i++) {
    try {
      const result = await generateOutdoorPage(i, job);
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
    await finalizeOutdoorLearningPdf(updatedJob);
  }
}

/**
 * Assemble the outdoor learning PDF with structured activity overlays.
 */
async function finalizeOutdoorLearningPdf(job: GenerationJob): Promise<void> {
  updateJob(job.id, { statusMessage: "Assembling outdoor learning PDF..." });

  const successPages = job.pageResults.filter(r => r.status === "success");
  if (successPages.length === 0) {
    updateJob(job.id, { status: "error", errorMessage: "No pages were generated successfully." });
    return;
  }

  try {
    const opts = job.options as OutdoorLearningOptions;
    const pageContents: PageContent[] = [];

    for (const page of successPages) {
      const buffer = await fetchImageBuffer(page.imageUrl);

      if (page.metadata?.isCover) {
        // Cover page
        pageContents.push({
          imageBuffer: buffer,
          contentBlocks: [
            {
              text: opts.activityType,
              x: 50,
              y: 250,
              width: PAGE_WIDTH - 100,
              fontSize: 30,
              font: "bold",
              align: "center",
              color: "#FFFFFF",
            },
            {
              text: `${opts.season} \u2022 ${opts.biome}`,
              x: 50,
              y: 300,
              width: PAGE_WIDTH - 100,
              fontSize: 16,
              font: "normal",
              align: "center",
              color: "#FFFFFF",
            },
            {
              text: `Ages: ${opts.ageRange}`,
              x: 50,
              y: 330,
              width: PAGE_WIDTH - 100,
              fontSize: 12,
              font: "normal",
              align: "center",
              color: "#FFFFFF",
            },
            {
              text: "Outdoor Learning Activities",
              x: 50,
              y: 700,
              width: PAGE_WIDTH - 100,
              fontSize: 12,
              font: "normal",
              align: "center",
              color: "#FFFFFF",
            },
          ],
          pageNumber: 1,
          totalPages: job.totalPages,
        });
      } else {
        // Activity page with structured content overlay
        const ac = page.metadata?.activityContent || {};
        const contentBlocks: NonNullable<PageContent["contentBlocks"]> = [];

        // Activity title (top banner area)
        contentBlocks.push({
          text: ac.activityName || "Outdoor Activity",
          x: 40,
          y: 40,
          width: PAGE_WIDTH - 80,
          fontSize: 20,
          font: "bold",
          align: "center",
          color: "#1a1a1a",
        });

        // Learning objective
        contentBlocks.push({
          text: `Objective: ${ac.objective || ""}`,
          x: 50,
          y: 75,
          width: PAGE_WIDTH - 100,
          fontSize: 10,
          font: "normal",
          align: "center",
          color: "#444444",
        });

        // Materials section
        const materials: string[] = ac.materials || [];
        contentBlocks.push({
          text: "Materials Needed:",
          x: 50,
          y: 110,
          width: 200,
          fontSize: 12,
          font: "bold",
          align: "left",
          color: "#1a1a1a",
        });

        materials.forEach((mat: string, idx: number) => {
          contentBlocks.push({
            text: `\u2022 ${mat}`,
            x: 60,
            y: 130 + idx * 18,
            width: 250,
            fontSize: 10,
            font: "normal",
            align: "left",
            color: "#333333",
          });
        });

        // Steps section (positioned in lower portion)
        const steps: string[] = ac.steps || [];
        const stepsStartY = 280;
        contentBlocks.push({
          text: "Steps:",
          x: 50,
          y: stepsStartY,
          width: PAGE_WIDTH - 100,
          fontSize: 14,
          font: "bold",
          align: "left",
          color: "#1a1a1a",
        });

        steps.forEach((step: string, idx: number) => {
          contentBlocks.push({
            text: `${idx + 1}. ${step}`,
            x: 60,
            y: stepsStartY + 25 + idx * 40,
            width: PAGE_WIDTH - 120,
            fontSize: 11,
            font: "normal",
            align: "left",
            color: "#222222",
          });
        });

        // Fun fact at bottom
        if (ac.funFact) {
          contentBlocks.push({
            text: `\u2B50 Fun Fact: ${ac.funFact}`,
            x: 50,
            y: 680,
            width: PAGE_WIDTH - 100,
            fontSize: 9,
            font: "normal",
            align: "center",
            color: "#555555",
          });
        }

        pageContents.push({
          imageBuffer: buffer,
          contentBlocks,
          pageNumber: page.pageNumber,
          totalPages: job.totalPages,
        });
      }
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
    updateJob(job.id, { status: "error", errorMessage: errorMsg });
  }
}

export function createOutdoorLearningJob(options: OutdoorLearningOptions): string {
  // Ensure minimum 6 pages (cover + 5 activity pages)
  const totalPages = Math.max(6, options.pageCount + 1); // +1 for cover
  const job = createJob(
    "outdoor-learning",
    totalPages,
    options,
    `outdoor-${options.activityType.toLowerCase().replace(/\s+/g, "-")}.pdf`
  );
  return job.id;
}

export async function processOutdoorLearningChunk(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");
  await processOutdoorLearningChunkInternal(job);
}
