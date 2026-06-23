/**
 * Outdoor Learning Generator — v3 (Clean Programmatic Design)
 *
 * Strategy:
 * - COVER page: Full-page AI nature scene with title overlay
 * - CONTENT pages: NO AI images. Clean white pages with green nature-themed
 *   header bar, structured sections (Objective, Materials, Steps, Fun Fact),
 *   proper spacing, and professional educational layout.
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
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Colors for outdoor/nature theme
const COLORS = {
  headerBg: "#2E7D32",      // Forest green
  footerBg: "#1B5E20",      // Dark green
  sectionBg: "#E8F5E9",     // Light green tint
  funFactBg: "#FFF8E1",     // Warm yellow
  textDark: "#1a1a1a",
  textMuted: "#555555",
};

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
  "activityName": "Short engaging activity title (max 5 words)",
  "objective": "One sentence learning objective",
  "materials": ["item 1", "item 2", "item 3", "item 4"],
  "steps": ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"],
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
      steps: Array.isArray(parsed.steps) ? parsed.steps.slice(0, 6) : ["Go outside", "Observe nature", "Record findings"],
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
    // Cover page — ONLY page with AI image
    const prompt = buildImagePrompt({
      subject: `beautiful ${opts.season} ${opts.biome} landscape scene with children exploring nature, outdoor education themed`,
      culturalVariant: opts.culturalConnection,
      additionalDetails: `vibrant nature scene, educational and inviting, ${opts.season} season, ${opts.biome} environment, child-friendly outdoor adventure, filling the entire canvas edge-to-edge with no borders or frames`,
    });
    const { imageUrl } = await generatePageImage(prompt);
    return {
      pageNumber: 1,
      imageUrl,
      status: "success",
      metadata: { isCover: true },
    };
  }

  // Content pages — NO AI image, just GPT content
  const activityContent = await generateActivityContent(opts, pageIndex - 1);

  return {
    pageNumber: pageIndex + 1,
    imageUrl: "",
    status: "success",
    metadata: { activityContent, isContentPage: true },
  };
}

/**
 * Custom chunk processor for outdoor learning.
 */
async function processOutdoorLearningChunkInternal(job: GenerationJob): Promise<void> {
  const PAGES_PER_CHUNK = 2;
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
 * Assemble the outdoor learning PDF — clean programmatic design.
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
      if (page.metadata?.isCover) {
        // Cover page — full AI image with title overlay
        const buffer = await fetchImageBuffer(page.imageUrl);
        pageContents.push({
          imageBuffer: buffer,
          contentBlocks: [
            {
              text: opts.activityType,
              x: MARGIN,
              y: 250,
              width: CONTENT_WIDTH,
              fontSize: 30,
              font: "bold",
              align: "center",
              fontColor: "#FFFFFF",
              backgroundColor: "rgba(0,0,0,0.5)",
              padding: 16,
              radius: 8,
            },
            {
              text: `${opts.season} | ${opts.biome}`,
              x: MARGIN,
              y: 310,
              width: CONTENT_WIDTH,
              fontSize: 16,
              font: "normal",
              align: "center",
              fontColor: "#FFFFFF",
            },
            {
              text: `Ages: ${opts.ageRange}`,
              x: MARGIN,
              y: 340,
              width: CONTENT_WIDTH,
              fontSize: 13,
              font: "normal",
              align: "center",
              fontColor: "#FFFFFF",
            },
            {
              text: "WishesWithoutBordersCo",
              x: MARGIN,
              y: 700,
              width: CONTENT_WIDTH,
              fontSize: 11,
              font: "normal",
              align: "center",
              fontColor: "#FFFFFF",
            },
          ],
          pageNumber: 1,
          totalPages: job.totalPages,
        });
      } else {
        // ═══════════════════════════════════════════════════════════════════
        // CONTENT PAGE — Clean white background, nature-themed header
        // ═══════════════════════════════════════════════════════════════════
        const ac = page.metadata?.activityContent || {};
        const contentBlocks: NonNullable<PageContent["contentBlocks"]> = [];

        // ── Green header bar ──
        contentBlocks.push({
          text: ac.activityName || "Outdoor Activity",
          x: 0,
          y: 0,
          width: PAGE_WIDTH,
          fontSize: 20,
          font: "bold",
          align: "center",
          fontColor: "#FFFFFF",
          backgroundColor: COLORS.headerBg,
          padding: 18,
        });

        // ── Objective ──
        contentBlocks.push({
          text: `Objective: ${ac.objective || ""}`,
          x: MARGIN,
          y: 60,
          width: CONTENT_WIDTH,
          fontSize: 11,
          font: "normal",
          align: "center",
          fontColor: COLORS.textMuted,
          padding: 6,
        });

        // ── Materials section ──
        const materials: string[] = ac.materials || [];
        const materialsText = "Materials Needed:\n" +
          (materials.length ? materials.map((m: string) => `  \u2022 ${m}`).join("\n") : "  \u2022 None");
        contentBlocks.push({
          text: materialsText,
          x: MARGIN,
          y: 95,
          width: CONTENT_WIDTH,
          fontSize: 11,
          font: "normal",
          align: "left",
          fontColor: COLORS.textDark,
          backgroundColor: COLORS.sectionBg,
          padding: 12,
          radius: 6,
        });

        // ── Steps section ──
        const steps: string[] = ac.steps || [];
        const stepsText = "Steps:\n" +
          (steps.length
            ? steps.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n\n")
            : "1. Go outside and explore!");
        
        // Calculate Y position based on materials length
        const materialsHeight = 50 + materials.length * 16;
        const stepsY = 95 + materialsHeight + 10;

        contentBlocks.push({
          text: stepsText,
          x: MARGIN,
          y: stepsY,
          width: CONTENT_WIDTH,
          fontSize: 11,
          font: "normal",
          align: "left",
          fontColor: COLORS.textDark,
          backgroundColor: "#FFFFFF",
          padding: 12,
          radius: 6,
        });

        // ── Fun Fact box at bottom ──
        if (ac.funFact) {
          contentBlocks.push({
            text: `Fun Fact: ${ac.funFact}`,
            x: MARGIN,
            y: PAGE_HEIGHT - 100,
            width: CONTENT_WIDTH,
            fontSize: 10,
            font: "normal",
            align: "center",
            fontColor: "#5D4037",
            backgroundColor: COLORS.funFactBg,
            padding: 10,
            radius: 6,
          });
        }

        // ── Footer bar ──
        contentBlocks.push({
          text: `${opts.activityType} | ${opts.season} | ${opts.biome} | Ages ${opts.ageRange}`,
          x: 0,
          y: PAGE_HEIGHT - 36,
          width: PAGE_WIDTH,
          fontSize: 8,
          font: "normal",
          align: "center",
          fontColor: "#FFFFFF",
          backgroundColor: COLORS.footerBg,
          padding: 8,
        });

        pageContents.push({
          backgroundColor: "#FFFFFF",
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
  const totalPages = Math.max(6, options.pageCount + 1);
  const job = createJob(
    "outdoor-learning",
    totalPages,
    options,
    `outdoor-${options.activityType.toLowerCase().replace(/\s+/g, "-")}-${options.season.toLowerCase()}.pdf`
  );
  return job.id;
}

export async function processOutdoorLearningChunk(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");
  await processOutdoorLearningChunkInternal(job);
}
