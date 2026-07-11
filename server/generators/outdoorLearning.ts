/**
 * Outdoor Learning Generator
 *
 * Every cover and activity page is generated as one complete portrait image.
 * GPT-4o defines the exact content, nature-themed layout, typography, activity
 * spaces, decoration, branding, and page number for FLUX to render directly.
 */
import { generateFullPageImage, generateContent, customPromptInstruction, finalizePdf } from "./shared";
import { createJob, getJob, updateJob, addPageResult, type GenerationJob, type PageResult } from "../jobs";

export interface OutdoorLearningOptions {
  customPrompt?: string;
  activityType: string;
  season: string;
  biome: string;
  ageRange: string;
  culturalConnection: string;
  pageCount: number;
}

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
${opts.culturalConnection && opts.culturalConnection !== "None" ? `Include ${opts.culturalConnection} cultural connections where appropriate.` : ""}${customPromptInstruction(opts.customPrompt)}`;

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

Keep steps simple, clear, and age-appropriate. Materials should be easy to find outdoors or at home.
NEVER include placeholder text like "[Picture of...]" or "(insert image)".`;

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
  const pageNumber = pageIndex + 1;

  if (pageIndex === 0) {
    const { imageUrl } = await generateFullPageImage({
      generatorType: "outdoor learning activity book",
      pageType: "front cover",
      pageNumber,
      totalPages: job.totalPages,
      audience: `children ages ${opts.ageRange}`,
      creativeDirection: `${opts.activityType} outdoor education in a ${opts.season} ${opts.biome} setting${opts.culturalConnection && opts.culturalConnection !== "None" ? ` with ${opts.culturalConnection} cultural connections` : ""}`,
      customPrompt: opts.customPrompt,
      exactText: [opts.activityType, `${opts.season} | ${opts.biome}`, `Ages: ${opts.ageRange}`, "Outdoor Learning Resource"],
      layoutGuidance: "Create an inviting portrait cover with a large activity-book title, season and biome subtitle, visible age badge, children exploring nature, accurate local plants and animals, and branding at the bottom within safe margins.",
      styleGuidance: "Premium nature-education publishing design with expressive organic title lettering, clean supporting typography, rich botanical borders, field-journal accents, coordinated natural colors, and a professional print-ready finish.",
      functionalRequirements: ["The cover must remain easy to read at thumbnail size."],
    });

    return { pageNumber, imageUrl, status: "success", metadata: { isCover: true } };
  }

  const themes = ACTIVITY_THEMES[opts.activityType] || ACTIVITY_THEMES["Scavenger Hunt"];
  const theme = themes[(pageIndex - 1) % themes.length];
  const activityContent = await generateActivityContent(opts, pageIndex - 1);
  const materials = activityContent.materials.map(item => scrubPlaceholders(item)).filter(Boolean);
  const steps = activityContent.steps.map(item => scrubPlaceholders(item)).filter(Boolean);
  const exactText = [
    scrubPlaceholders(activityContent.activityName) || "Outdoor Activity",
    `Objective: ${scrubPlaceholders(activityContent.objective)}`,
    "Materials Needed:",
    ...materials.map(item => `• ${item}`),
    "Steps:",
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    `Fun Fact: ${scrubPlaceholders(activityContent.funFact)}`,
    `${opts.activityType} | ${opts.season} | ${opts.biome} | Ages ${opts.ageRange}`,
  ];

  const { imageUrl } = await generateFullPageImage({
    generatorType: "outdoor learning activity page",
    pageType: `${theme} activity ${pageIndex}`,
    pageNumber,
    totalPages: job.totalPages,
    audience: `children ages ${opts.ageRange}`,
    creativeDirection: `${theme} in a ${opts.season} ${opts.biome} environment${opts.culturalConnection && opts.culturalConnection !== "None" ? ` with ${opts.culturalConnection} cultural connections` : ""}`,
    customPrompt: opts.customPrompt,
    exactText,
    layoutGuidance: "Build a complete portrait activity page with a nature-illustrated title banner, an objective callout, a compact materials checklist, a large numbered how-to section with clear spacing between steps, and a distinct fun-fact box near the bottom. Integrate accurate plants, animals, field-guide icons, and a small footer without covering text.",
    styleGuidance: "Professional outdoor-education resource with warm readable typography, natural greens and seasonal accent colors, field-journal boxes, botanical dividers, hand-drawn nature icons, and a polished child-friendly editorial layout.",
    functionalRequirements: [
      "Every material and numbered step must be fully visible, correctly ordered, and easy for a child and adult to follow outdoors.",
      "Keep decorative wildlife and foliage outside all text blocks.",
      "Maintain strong print contrast and avoid overly dark backgrounds behind body text.",
    ],
  });

  return { pageNumber, imageUrl, status: "success", metadata: { activityContent } };
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
    await finalizePdf(updatedJob);
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
