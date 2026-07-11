/**
 * Therapeutic Activity Generator
 *
 * Strategy:
 * - COVER page: Full-page AI calming illustration with title overlay
 * - HOW-TO-USE page: AI decorative border with structured tips in readability panels
 * - CONTENT pages: Full-page AI therapeutic illustration (soft/muted) with text
 *   overlaid inside semi-transparent white panels for readability.
 *
 * All pages use calming pastel colors and soothing design appropriate for
 * children with various therapeutic needs (ADHD, ASD, Anxiety, etc.)
 */
import { buildImagePrompt, generatePageImage, generateContent, customPromptInstruction, resolveCreativeDirection } from "./shared";
import { createJob, getJob, updateJob, addPageResult, type GenerationJob, type PageResult } from "../jobs";
import { assemblePdf, fetchImageBuffer, PageContent } from "../pdfAssembly";
import { storagePut } from "../storage";

export interface TherapeuticActivityOptions {
  customPrompt?: string;
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

const ACTIVITY_PROMPTS: Record<string, string[]> = {
  "Visual Schedule": [
    "visual schedule template with illustrated daily routine icons in a clear sequential layout, calming pastel colors",
    "morning routine visual schedule with illustrated step-by-step activities in rounded boxes",
    "after-school routine visual schedule with illustrated activities in a clear vertical timeline",
    "bedtime routine visual schedule with soothing illustrated steps in a calming color palette",
    "weekend activity visual schedule with illustrated choices and time blocks",
  ],
  "Calm-Down Kit": [
    "calm-down strategy illustration showing a child doing deep breathing exercises, soothing muted colors",
    "sensory grounding activity illustration showing 5-4-3-2-1 senses technique with calming imagery",
    "progressive muscle relaxation guide with illustrated body positions, gentle pastel tones",
    "calm-down corner setup illustration with cozy safe space elements",
    "emotional thermometer illustration showing escalating feelings with calming strategies at each level",
  ],
  "Sensory Activity": [
    "sensory exploration activity illustration with tactile, visual, and auditory activities in organized sections",
    "sensory diet illustration with sensory activities categorized by type",
    "sensory bin activity illustration with themed sensory materials and tools",
    "body awareness activity illustration with exercises for spatial awareness",
    "sensory break menu illustration with quick sensory activities in a choice-board format",
  ],
  "Emotional Regulation": [
    "feelings identification illustration with diverse child faces showing different emotions in a grid",
    "emotion zones illustration with characters showing different emotional states with color coding",
    "coping strategies wheel illustration with calming techniques arranged in a circular format",
    "feelings journal illustration with emotion faces and space for expression",
    "anger management steps illustration with a child character going through calming stages",
  ],
  "Executive Function": [
    "task breakdown template illustration showing how to break a big task into small pieces",
    "planning and organization illustration with checklist format and priority markers",
    "time management visual aid illustration with clock and activity blocks",
    "working memory game illustration with memory matching activity",
    "flexible thinking activity illustration with problem-solving scenarios",
  ],
  "Social Stories": [
    "social story illustration with diverse children in a social situation, clear sequential panels",
    "friendship skills illustrated scenario showing positive social interaction",
    "taking turns illustrated social story with diverse characters",
    "asking for help illustrated social story with a child in school setting",
    "managing frustration illustrated social story with calming strategies",
  ],
  "Fidget Alternatives": [
    "fidget alternatives illustration with quiet hand activities for focus, organized in a grid",
    "desk fidget options illustration showing appropriate classroom movement alternatives",
    "quiet body strategies illustration with child showing calm body positions",
    "focus tools illustration with various tactile and movement options",
    "movement break illustration with quick exercises for refocusing energy",
  ],
  "Routine Cards": [
    "daily routine cards illustration with individual activity icons, clear and simple design",
    "transition cards illustration with timer and next-activity previews",
    "choice board illustration with activity options in a grid format",
    "first-then board template illustration with sequential activity cards",
    "reward chart illustration with goals and progress tracking",
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
All activities must be evidence-based, safe, and developmentally appropriate.${customPromptInstruction(opts.customPrompt)}`;

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

Keep steps simple, clear, and achievable. Materials should be common household items.
NEVER include placeholder text like "[Picture of...]" or "(insert image)".`;

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
  const systemPrompt = `You are a pediatric therapist writing a brief guide for parents and educators.${customPromptInstruction(opts.customPrompt)}`;
  const userPrompt = `Write 5 brief "How to Use This Resource" tips for a ${opts.activityType} resource designed for ${opts.target} (ages ${opts.ageRange}).
Return JSON: {"tips": ["tip 1", "tip 2", "tip 3", "tip 4", "tip 5"]}
Keep each tip to 1-2 sentences. Focus on practical implementation advice.
NEVER include placeholder text like "[Picture of...]" or "(insert image)".`;

  const content = await generateContent({
    systemPrompt,
    userPrompt,
    responseFormat: { type: "json_object" },
  });

  try {
    const parsed = JSON.parse(content);
    return parsed.tips || [
      "Use in a calm, quiet environment free from distractions.",
      "Follow your child's pace — there is no rush.",
      "Offer choices whenever possible to build autonomy.",
      "Celebrate effort, not just completion.",
      "Repeat activities as needed — repetition builds confidence.",
    ];
  } catch {
    return [
      "Use in a calm, quiet environment free from distractions.",
      "Follow your child's pace — there is no rush.",
      "Offer choices whenever possible to build autonomy.",
      "Celebrate effort, not just completion.",
      "Repeat activities as needed — repetition builds confidence.",
    ];
  }
}

async function generateTherapeuticPage(pageIndex: number, job: GenerationJob): Promise<PageResult> {
  const opts = job.options as TherapeuticActivityOptions;
  const repPrompt = getRepresentationPrompt(opts.representation);
  const targetMod = getTargetModifier(opts.target);

  if (pageIndex === 0) {
    // Cover page — full AI calming illustration
    const prompt = buildImagePrompt({
      subject: resolveCreativeDirection(opts.customPrompt, `calming therapeutic resource cover design with gentle nature elements and soothing patterns, ${repPrompt}`),
      ageRange: opts.ageRange,
      colorPalette: "muted soothing pastel colors, calming tones",
      additionalDetails: `${targetMod}, therapeutic educational material cover, gentle and supportive visual design, professional and inviting`,
    });
    const { imageUrl } = await generatePageImage(prompt);
    return { pageNumber: 1, imageUrl, status: "success", metadata: { isCover: true } };
  }

  if (pageIndex === 1) {
    // "How to Use This Resource" page — AI decorative border
    const prompt = buildImagePrompt({
      subject: resolveCreativeDirection(opts.customPrompt, "gentle calming decorative border with soft nature elements around edges, large plain white center area"),
      colorPalette: "muted soothing pastel colors, calming tones",
      additionalDetails: `therapeutic resource page border, the center 80% must be plain white for text, gentle and supportive design`,
    });
    const { imageUrl } = await generatePageImage(prompt);
    const howToUse = await generateHowToUse(opts);
    return { pageNumber: 2, imageUrl, status: "success", metadata: { isHowToUse: true, howToUse } };
  }

  // Activity pages — AI therapeutic illustration + GPT content
  const activityPrompt = getActivityPrompt(opts.activityType, pageIndex - 2);
  const prompt = buildImagePrompt({
    subject: resolveCreativeDirection(opts.customPrompt, `${activityPrompt}, ${repPrompt}`),
    ageRange: opts.ageRange,
    colorPalette: "muted soothing pastel colors, calming tones",
    additionalDetails: `${targetMod}, therapeutic educational material, gentle and supportive visual design, soft colors to allow text overlay readability`,
  });
  const { imageUrl } = await generatePageImage(prompt);

  // Generate structured activity content
  const activityContent = await generateTherapeuticContent(opts, pageIndex - 2);

  return {
    pageNumber: pageIndex + 1,
    imageUrl,
    status: "success",
    metadata: { activityContent },
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
 * Assemble the therapeutic activity PDF — AI backgrounds + readability panels.
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
              fontSize: 26,
              font: "bold",
              align: "center",
              fontColor: "#FFFFFF",
              backgroundColor: "rgba(0,0,0,0.45)",
              padding: 14,
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
              backgroundColor: "rgba(0,0,0,0.35)",
              padding: 8,
              radius: 6,
            },
            {
              text: `Ages: ${opts.ageRange}`,
              x: MARGIN,
              y: 350,
              width: CONTENT_WIDTH,
              fontSize: 12,
              font: "normal",
              align: "center",
              fontColor: "#FFFFFF",
            },
            {
              text: "Therapeutic Activities Resource | WishesWithoutBordersCo",
              x: MARGIN,
              y: 700,
              width: CONTENT_WIDTH,
              fontSize: 10,
              font: "normal",
              align: "center",
              fontColor: "#FFFFFF",
            },
          ],
          pageNumber: 1,
          totalPages: job.totalPages,
        });
      } else if (page.metadata?.isHowToUse) {
        // How to Use page — AI border + readability panels
        const buffer = await fetchImageBuffer(page.imageUrl);
        const tips: string[] = page.metadata.howToUse || [];
        const contentBlocks: NonNullable<PageContent["contentBlocks"]> = [];

        contentBlocks.push({
          text: "How to Use This Resource",
          x: MARGIN,
          y: 80,
          width: CONTENT_WIDTH,
          fontSize: 22,
          font: "bold",
          align: "center",
          fontColor: "#2c3e50",
          backgroundColor: "rgba(255,255,255,0.93)",
          padding: 14,
          radius: 8,
        });

        contentBlocks.push({
          text: `Designed for: ${opts.target} \u2022 Ages: ${opts.ageRange}`,
          x: MARGIN,
          y: 130,
          width: CONTENT_WIDTH,
          fontSize: 11,
          font: "normal",
          align: "center",
          fontColor: "#555555",
          backgroundColor: "rgba(255,255,255,0.88)",
          padding: 8,
          radius: 6,
        });

        tips.forEach((tip: string, idx: number) => {
          contentBlocks.push({
            text: `\u2713 ${scrubPlaceholders(tip)}`,
            x: MARGIN + 10,
            y: 175 + idx * 65,
            width: CONTENT_WIDTH - 20,
            fontSize: 12,
            font: "normal",
            align: "left",
            fontColor: "#333333",
            backgroundColor: "rgba(255,255,255,0.92)",
            padding: 12,
            radius: 6,
          });
        });

        contentBlocks.push({
          text: "Remember: Every child is unique. Adapt activities to individual needs and comfort levels.",
          x: MARGIN,
          y: 620,
          width: CONTENT_WIDTH,
          fontSize: 10,
          font: "normal",
          align: "center",
          fontColor: "#666666",
          backgroundColor: "rgba(255,255,255,0.88)",
          padding: 10,
          radius: 6,
        });

        pageContents.push({
          imageBuffer: buffer,
          contentBlocks,
          pageNumber: page.pageNumber,
          totalPages: job.totalPages,
        });
      } else {
        // ═══════════════════════════════════════════════════════════════════
        // ACTIVITY PAGE — AI therapeutic background + white readability panels
        // ═══════════════════════════════════════════════════════════════════
        const buffer = await fetchImageBuffer(page.imageUrl);
        const ac = page.metadata?.activityContent || {};
        const contentBlocks: NonNullable<PageContent["contentBlocks"]> = [];

        // ── Activity title ──
        contentBlocks.push({
          text: scrubPlaceholders(ac.activityName) || "Activity",
          x: MARGIN - 10,
          y: 24,
          width: CONTENT_WIDTH + 20,
          fontSize: 18,
          font: "bold",
          align: "center",
          fontColor: "#2c3e50",
          backgroundColor: "rgba(255,255,255,0.93)",
          padding: 12,
          radius: 8,
        });

        // ── Target info ──
        contentBlocks.push({
          text: scrubPlaceholders(ac.targetInfo) || "",
          x: MARGIN,
          y: 72,
          width: CONTENT_WIDTH,
          fontSize: 9,
          font: "normal",
          align: "center",
          fontColor: "#555555",
          backgroundColor: "rgba(255,255,255,0.85)",
          padding: 6,
          radius: 4,
        });

        // ── Materials section ──
        const materials: string[] = ac.materials || [];
        const materialsText = "Materials Needed:\n" +
          (materials.length
            ? materials.map((m: string) => `  \u2022 ${scrubPlaceholders(m)}`).join("\n")
            : "  \u2022 None required");

        contentBlocks.push({
          text: materialsText,
          x: MARGIN,
          y: 100,
          width: CONTENT_WIDTH,
          fontSize: 10,
          font: "normal",
          align: "left",
          fontColor: "#1a1a1a",
          backgroundColor: "rgba(255,255,255,0.92)",
          padding: 12,
          radius: 6,
        });

        // ── Steps section ──
        const steps: string[] = ac.steps || [];
        const stepsText = "Instructions:\n\n" +
          (steps.length
            ? steps.map((s: string, i: number) => `${i + 1}. ${scrubPlaceholders(s)}`).join("\n\n")
            : "1. Follow the activity as shown.");

        // Calculate Y position based on materials
        const materialsHeight = 50 + materials.length * 16;
        const stepsY = 100 + materialsHeight + 10;

        contentBlocks.push({
          text: stepsText,
          x: MARGIN,
          y: stepsY,
          width: CONTENT_WIDTH,
          fontSize: 11,
          font: "normal",
          align: "left",
          fontColor: "#1a1a1a",
          backgroundColor: "rgba(255,255,255,0.92)",
          padding: 12,
          radius: 6,
        });

        // ── Professional tip at bottom ──
        if (ac.tip) {
          contentBlocks.push({
            text: `Tip: ${scrubPlaceholders(ac.tip)}`,
            x: MARGIN,
            y: PAGE_HEIGHT - 90,
            width: CONTENT_WIDTH,
            fontSize: 10,
            font: "normal",
            align: "center",
            fontColor: "#3E2723",
            backgroundColor: "rgba(255,248,225,0.93)",
            padding: 10,
            radius: 6,
          });
        }

        // ── Footer ──
        contentBlocks.push({
          text: `${opts.activityType} | ${opts.target} | Ages ${opts.ageRange}`,
          x: MARGIN,
          y: PAGE_HEIGHT - 40,
          width: CONTENT_WIDTH,
          fontSize: 8,
          font: "normal",
          align: "center",
          fontColor: "#555555",
          backgroundColor: "rgba(255,255,255,0.85)",
          padding: 6,
          radius: 4,
        });

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

export function createTherapeuticActivityJob(options: TherapeuticActivityOptions): string {
  // Ensure minimum 5 pages (cover + how-to-use + 3 activity pages)
  const totalPages = Math.max(5, options.pageCount + 2); // +2 for cover and how-to-use
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
