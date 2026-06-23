/**
 * Therapeutic Activity Generator — v3 (Clean Programmatic Design)
 *
 * Strategy:
 * - COVER page: Full-page AI calming illustration with title overlay
 * - HOW TO USE page: NO AI image. Clean white page with structured tips
 * - CONTENT pages: NO AI images. Clean white pages with calming purple/teal
 *   header, structured sections (Target, Materials, Steps, Tip), professional layout.
 */
import { buildImagePrompt, generatePageImage, generateContent } from "./shared";
import { createJob, getJob, updateJob, addPageResult, type GenerationJob, type PageResult } from "../jobs";
import { assemblePdf, fetchImageBuffer, PageContent } from "../pdfAssembly";
import { storagePut } from "../storage";

export interface TherapeuticActivityOptions {
  activityType: string;
  target: string;
  representation: string;
  ageRange: string;
  pageCount: number;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Calming color scheme for therapeutic materials
const COLORS = {
  headerBg: "#5C6BC0",      // Calming indigo
  footerBg: "#3949AB",      // Deeper indigo
  sectionBg: "#EDE7F6",     // Light lavender
  tipBg: "#E8F5E9",         // Soft green
  howToBg: "#FFF3E0",       // Warm peach
  textDark: "#1a1a1a",
  textMuted: "#555555",
};

const ACTIVITY_PROMPTS: Record<string, string[]> = {
  "Visual Schedule": [
    "visual schedule template with illustrated daily routine icons",
    "morning routine visual schedule with step-by-step activities",
    "after-school routine visual schedule with activities",
    "bedtime routine visual schedule with soothing steps",
    "weekend activity visual schedule with choices",
  ],
  "Calm-Down Kit": [
    "calm-down strategy with deep breathing exercises",
    "sensory grounding activity with 5-4-3-2-1 senses technique",
    "progressive muscle relaxation guide",
    "calm-down corner setup with cozy safe space elements",
    "emotional thermometer with escalating feelings and strategies",
  ],
  "Sensory Activity": [
    "sensory exploration with tactile, visual, and auditory activities",
    "sensory diet with activities categorized by type",
    "sensory bin activity with themed materials and tools",
    "body awareness activity with exercises for spatial awareness",
    "sensory break menu with quick activities in choice-board format",
  ],
  "Emotional Regulation": [
    "feelings identification with emotion faces in a grid",
    "emotion zones with different emotional states and color coding",
    "coping strategies wheel with calming techniques",
    "feelings journal with emotion faces and space for expression",
    "anger management steps going through calming stages",
  ],
  "Executive Function": [
    "task breakdown showing how to break a big task into pieces",
    "planning and organization with checklist and priority markers",
    "time management visual aid with clock and activity blocks",
    "working memory game with matching activity",
    "flexible thinking activity with problem-solving scenarios",
  ],
  "Social Stories": [
    "social story with children in a social situation",
    "friendship skills scenario showing positive interaction",
    "taking turns social story with diverse characters",
    "asking for help social story in school setting",
    "managing frustration social story with calming strategies",
  ],
  "Fidget Alternatives": [
    "fidget alternatives with quiet hand activities for focus",
    "desk fidget options showing classroom movement alternatives",
    "quiet body strategies with calm body positions",
    "focus tools with various tactile and movement options",
    "movement break with quick exercises for refocusing",
  ],
  "Routine Cards": [
    "daily routine cards with individual activity icons",
    "transition cards with timer and next-activity previews",
    "choice board with activity options in a grid",
    "first-then board template with sequential activity cards",
    "reward chart with goals and progress tracking",
  ],
};

function getActivityPrompt(activityType: string, pageIndex: number): string {
  const prompts = ACTIVITY_PROMPTS[activityType] || ACTIVITY_PROMPTS["Visual Schedule"];
  return prompts[pageIndex % prompts.length];
}

/**
 * Generate structured therapeutic activity content using GPT.
 */
async function generateTherapeuticContent(opts: TherapeuticActivityOptions, activityIndex: number): Promise<{
  activityName: string;
  targetInfo: string;
  materials: string[];
  steps: string[];
  tip: string;
}> {
  const activityPrompts = ACTIVITY_PROMPTS[opts.activityType] || ACTIVITY_PROMPTS["Visual Schedule"];
  const theme = activityPrompts[activityIndex % activityPrompts.length];

  const systemPrompt = `You are a pediatric occupational therapist and special education expert creating therapeutic activities.
Target population: ${opts.target}
Age range: ${opts.ageRange}
Activity type: ${opts.activityType}
All activities must be evidence-based, safe, and developmentally appropriate.`;

  const userPrompt = `Create a structured therapeutic activity related to: ${theme}
For: ${opts.target}, ages ${opts.ageRange}

Return a JSON object:
{
  "activityName": "Short clear activity title (max 5 words)",
  "targetInfo": "Who benefits: brief description of target skills",
  "materials": ["material 1", "material 2", "material 3"],
  "steps": ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"],
  "tip": "One professional tip for parents/educators"
}

Keep steps simple, clear, and achievable. Materials should be common household items.`;

  const content = await generateContent({
    systemPrompt,
    userPrompt,
    responseFormat: { type: "json_object" },
  });

  try {
    const parsed = JSON.parse(content);
    return {
      activityName: parsed.activityName || "Therapeutic Activity",
      targetInfo: parsed.targetInfo || `For ${opts.target}, ages ${opts.ageRange}`,
      materials: Array.isArray(parsed.materials) ? parsed.materials.slice(0, 4) : ["Paper", "Crayons", "Timer"],
      steps: Array.isArray(parsed.steps) ? parsed.steps.slice(0, 5) : ["Begin the activity", "Follow along", "Complete and reflect"],
      tip: parsed.tip || "Adapt this activity to your child's comfort level.",
    };
  } catch {
    return {
      activityName: "Therapeutic Activity",
      targetInfo: `For ${opts.target}, ages ${opts.ageRange}`,
      materials: ["Paper", "Crayons", "Timer"],
      steps: ["Set up a calm environment", "Introduce the activity", "Guide through each step", "Allow processing time", "Celebrate completion"],
      tip: "Always follow the child's lead and comfort level.",
    };
  }
}

/**
 * Generate "How to Use This Resource" content.
 */
async function generateHowToUse(opts: TherapeuticActivityOptions): Promise<string[]> {
  const systemPrompt = `You are a pediatric therapist writing a brief guide for parents and educators.`;
  const userPrompt = `Write 5 brief "How to Use This Resource" tips for a ${opts.activityType} resource designed for ${opts.target} (ages ${opts.ageRange}).

Return JSON: {"tips": ["tip 1", "tip 2", "tip 3", "tip 4", "tip 5"]}

Keep each tip to 1-2 sentences. Focus on practical implementation advice.`;

  const content = await generateContent({
    systemPrompt,
    userPrompt,
    responseFormat: { type: "json_object" },
  });

  try {
    const parsed = JSON.parse(content);
    return parsed.tips || [
      "Use in a calm, quiet environment free from distractions.",
      "Follow your child's pace -- there is no rush.",
      "Offer choices whenever possible to build autonomy.",
      "Celebrate effort, not just completion.",
      "Repeat activities as needed -- repetition builds confidence.",
    ];
  } catch {
    return [
      "Use in a calm, quiet environment free from distractions.",
      "Follow your child's pace -- there is no rush.",
      "Offer choices whenever possible to build autonomy.",
      "Celebrate effort, not just completion.",
      "Repeat activities as needed -- repetition builds confidence.",
    ];
  }
}

async function generateTherapeuticPage(pageIndex: number, job: GenerationJob): Promise<PageResult> {
  const opts = job.options as TherapeuticActivityOptions;

  if (pageIndex === 0) {
    // Cover page — ONLY page with AI image
    const prompt = buildImagePrompt({
      subject: `calming therapeutic resource cover design with gentle nature elements and soothing patterns`,
      ageRange: opts.ageRange,
      colorPalette: "muted soothing pastel colors, calming tones",
      additionalDetails: `therapeutic educational material cover, gentle and supportive visual design, professional and inviting, filling the entire canvas edge-to-edge with no borders or frames`,
    });
    const { imageUrl } = await generatePageImage(prompt);
    return { pageNumber: 1, imageUrl, status: "success", metadata: { isCover: true } };
  }

  if (pageIndex === 1) {
    // "How to Use This Resource" page — NO AI image
    const howToUse = await generateHowToUse(opts);
    return { pageNumber: 2, imageUrl: "", status: "success", metadata: { isHowToUse: true, howToUse, isContentPage: true } };
  }

  // Activity pages — NO AI image, just GPT content
  const activityContent = await generateTherapeuticContent(opts, pageIndex - 2);

  return {
    pageNumber: pageIndex + 1,
    imageUrl: "",
    status: "success",
    metadata: { activityContent, isContentPage: true },
  };
}

/**
 * Custom chunk processor for therapeutic activities.
 */
async function processTherapeuticChunkInternal(job: GenerationJob): Promise<void> {
  const PAGES_PER_CHUNK = 2;
  const startIndex = job.nextPageIndex;
  const endIndex = Math.min(startIndex + PAGES_PER_CHUNK, job.totalPages);

  updateJob(job.id, {
    status: "generating",
    statusMessage: `Generating therapeutic activities ${startIndex + 1}-${endIndex} of ${job.totalPages}...`,
  });

  for (let i = startIndex; i < endIndex; i++) {
    try {
      const result = await generateTherapeuticPage(i, job);
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
    await finalizeTherapeuticPdf(updatedJob);
  }
}

/**
 * Assemble the therapeutic activity PDF — clean programmatic design.
 */
async function finalizeTherapeuticPdf(job: GenerationJob): Promise<void> {
  updateJob(job.id, { statusMessage: "Assembling therapeutic activity PDF..." });

  const successPages = job.pageResults.filter(r => r.status === "success");
  if (successPages.length === 0) {
    updateJob(job.id, { status: "error", errorMessage: "No pages were generated successfully." });
    return;
  }

  try {
    const opts = job.options as TherapeuticActivityOptions;
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
              fontSize: 28,
              font: "bold",
              align: "center",
              fontColor: "#FFFFFF",
              backgroundColor: "rgba(0,0,0,0.5)",
              padding: 16,
              radius: 8,
            },
            {
              text: `For: ${opts.target}`,
              x: MARGIN,
              y: 310,
              width: CONTENT_WIDTH,
              fontSize: 14,
              font: "normal",
              align: "center",
              fontColor: "#FFFFFF",
            },
            {
              text: `Ages: ${opts.ageRange}`,
              x: MARGIN,
              y: 335,
              width: CONTENT_WIDTH,
              fontSize: 12,
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
      } else if (page.metadata?.isHowToUse) {
        // ═══════════════════════════════════════════════════════════════════
        // HOW TO USE PAGE — Clean white background
        // ═══════════════════════════════════════════════════════════════════
        const tips: string[] = page.metadata.howToUse || [];
        const contentBlocks: NonNullable<PageContent["contentBlocks"]> = [];

        // Header bar
        contentBlocks.push({
          text: "How to Use This Resource",
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

        // Subtitle
        contentBlocks.push({
          text: `Designed for: ${opts.target} | Ages: ${opts.ageRange}`,
          x: MARGIN,
          y: 65,
          width: CONTENT_WIDTH,
          fontSize: 11,
          font: "normal",
          align: "center",
          fontColor: COLORS.textMuted,
          padding: 4,
        });

        // Tips — each one as a separate block with spacing
        const TIPS_START = 110;
        const tipSpacing = Math.min(100, (PAGE_HEIGHT - 200 - TIPS_START) / Math.max(tips.length, 1));

        tips.forEach((tip: string, idx: number) => {
          contentBlocks.push({
            text: `${idx + 1}. ${tip}`,
            x: MARGIN,
            y: TIPS_START + idx * tipSpacing,
            width: CONTENT_WIDTH,
            fontSize: 12,
            font: "normal",
            align: "left",
            fontColor: COLORS.textDark,
            backgroundColor: COLORS.howToBg,
            padding: 12,
            radius: 6,
          });
        });

        // Reminder at bottom
        contentBlocks.push({
          text: "Remember: Every child is unique. Adapt activities to individual needs and comfort levels.",
          x: MARGIN,
          y: PAGE_HEIGHT - 80,
          width: CONTENT_WIDTH,
          fontSize: 10,
          font: "normal",
          align: "center",
          fontColor: COLORS.textMuted,
          backgroundColor: COLORS.sectionBg,
          padding: 10,
          radius: 6,
        });

        // Footer
        contentBlocks.push({
          text: `${opts.activityType} | ${opts.target} | Ages ${opts.ageRange}`,
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
      } else {
        // ═══════════════════════════════════════════════════════════════════
        // ACTIVITY PAGE — Clean white background, structured layout
        // ═══════════════════════════════════════════════════════════════════
        const ac = page.metadata?.activityContent || {};
        const contentBlocks: NonNullable<PageContent["contentBlocks"]> = [];

        // Header bar
        contentBlocks.push({
          text: ac.activityName || "Activity",
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

        // Target info
        contentBlocks.push({
          text: ac.targetInfo || "",
          x: MARGIN,
          y: 60,
          width: CONTENT_WIDTH,
          fontSize: 10,
          font: "normal",
          align: "center",
          fontColor: COLORS.textMuted,
          padding: 4,
        });

        // Materials section
        const materials: string[] = ac.materials || [];
        const materialsText = "Materials Needed:\n" +
          (materials.length ? materials.map((m: string) => `  \u2022 ${m}`).join("\n") : "  \u2022 None required");
        contentBlocks.push({
          text: materialsText,
          x: MARGIN,
          y: 90,
          width: CONTENT_WIDTH,
          fontSize: 11,
          font: "normal",
          align: "left",
          fontColor: COLORS.textDark,
          backgroundColor: COLORS.sectionBg,
          padding: 12,
          radius: 6,
        });

        // Steps section
        const steps: string[] = ac.steps || [];
        const materialsHeight = 50 + materials.length * 16;
        const stepsY = 90 + materialsHeight + 15;
        const stepsText = "Steps:\n\n" +
          (steps.length
            ? steps.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n\n")
            : "1. Follow along at a comfortable pace.");

        contentBlocks.push({
          text: stepsText,
          x: MARGIN,
          y: stepsY,
          width: CONTENT_WIDTH,
          fontSize: 11,
          font: "normal",
          align: "left",
          fontColor: COLORS.textDark,
          padding: 12,
        });

        // Professional tip at bottom
        if (ac.tip) {
          contentBlocks.push({
            text: `Tip: ${ac.tip}`,
            x: MARGIN,
            y: PAGE_HEIGHT - 100,
            width: CONTENT_WIDTH,
            fontSize: 10,
            font: "normal",
            align: "center",
            fontColor: "#2E7D32",
            backgroundColor: COLORS.tipBg,
            padding: 10,
            radius: 6,
          });
        }

        // Footer bar
        contentBlocks.push({
          text: `${opts.activityType} | ${opts.target} | Ages ${opts.ageRange}`,
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

export function createTherapeuticActivityJob(options: TherapeuticActivityOptions): string {
  const totalPages = Math.max(5, options.pageCount + 2);
  const job = createJob(
    "therapeutic-activity",
    totalPages,
    options,
    `therapeutic-${options.activityType.toLowerCase().replace(/\s+/g, "-")}.pdf`
  );
  return job.id;
}

export async function processTherapeuticActivityChunk(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");
  await processTherapeuticChunkInternal(job);
}
