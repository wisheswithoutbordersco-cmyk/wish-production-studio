/**
 * Therapeutic Activity Generator
 * Generates neurodivergent-friendly activities, sensory worksheets, emotional regulation tools,
 * visual schedules, calm-down kits, etc.
 *
 * Features:
 * - Cover page with title and branding
 * - "How to Use This Resource" intro page
 * - Each page has text overlay: activity name, target age range, materials needed, 3-5 step instructions
 * - Layout: contentBlocks for title at top, illustration in middle, instructions at bottom
 * - Minimum 5+ pages
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
  "activityName": "Short clear activity title",
  "targetInfo": "Who benefits: brief description of target skills",
  "materials": ["material 1", "material 2", "material 3"],
  "steps": ["Step 1: Clear instruction", "Step 2: ...", "Step 3: ...", "Step 4: ...", "Step 5: ..."],
  "tip": "One professional tip for parents/educators using this activity"
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
    // Cover page
    const prompt = buildImagePrompt({
      subject: `calming therapeutic resource cover design with gentle nature elements and soothing patterns, ${repPrompt}`,
      ageRange: opts.ageRange,
      colorPalette: "muted soothing pastel colors, calming tones",
      additionalDetails: `${targetMod}, therapeutic educational material cover, gentle and supportive visual design, professional and inviting`,
    });
    const { imageUrl } = await generatePageImage(prompt);
    return { pageNumber: 1, imageUrl, status: "success", metadata: { isCover: true } };
  }

  if (pageIndex === 1) {
    // "How to Use This Resource" page
    const prompt = buildImagePrompt({
      subject: `gentle calming decorative border with soft nature elements around edges, large plain white center area`,
      colorPalette: "muted soothing pastel colors, calming tones",
      additionalDetails: `therapeutic resource page border, the center 80% must be plain white for text, gentle and supportive design`,
    });
    const { imageUrl } = await generatePageImage(prompt);
    const howToUse = await generateHowToUse(opts);
    return { pageNumber: 2, imageUrl, status: "success", metadata: { isHowToUse: true, howToUse } };
  }

  // Activity pages
  const activityPrompt = getActivityPrompt(opts.activityType, pageIndex - 2);
  const prompt = buildImagePrompt({
    subject: `${activityPrompt}, ${repPrompt}`,
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
 * Assemble the therapeutic activity PDF with structured content overlays.
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
              fontSize: 26,
              font: "bold",
              align: "center",
              color: "#FFFFFF",
            },
            {
              text: `For: ${opts.target}`,
              x: 50,
              y: 295,
              width: PAGE_WIDTH - 100,
              fontSize: 14,
              font: "normal",
              align: "center",
              color: "#FFFFFF",
            },
            {
              text: `Ages: ${opts.ageRange}`,
              x: 50,
              y: 320,
              width: PAGE_WIDTH - 100,
              fontSize: 12,
              font: "normal",
              align: "center",
              color: "#FFFFFF",
            },
            {
              text: "Therapeutic Activities Resource",
              x: 50,
              y: 700,
              width: PAGE_WIDTH - 100,
              fontSize: 11,
              font: "normal",
              align: "center",
              color: "#FFFFFF",
            },
          ],
          pageNumber: 1,
          totalPages: job.totalPages,
        });
      } else if (page.metadata?.isHowToUse) {
        // How to Use page — grouped onto readable white panels.
        const tips: string[] = page.metadata.howToUse || [];
        const PANEL = "rgba(255,255,255,0.92)";
        const PANEL_SOFT = "rgba(255,255,255,0.85)";
        const contentBlocks: NonNullable<PageContent["contentBlocks"]> = [
          {
            text: "How to Use This Resource",
            x: 60,
            y: 100,
            width: PAGE_WIDTH - 120,
            fontSize: 22,
            font: "bold",
            align: "center",
            fontColor: "#2c3e50",
            backgroundColor: PANEL,
            padding: 8,
            radius: 6,
          },
          {
            text: `Designed for: ${opts.target} \u2022 Ages: ${opts.ageRange}`,
            x: 60,
            y: 140,
            width: PAGE_WIDTH - 120,
            fontSize: 11,
            font: "normal",
            align: "center",
            fontColor: "#555555",
            backgroundColor: PANEL_SOFT,
            padding: 5,
            radius: 4,
          },
        ];

        // All tips grouped in a single panel that fills the page body.
        const tipsText = tips.length
          ? tips.map((t) => `\u2713 ${t}`).join("\n\n")
          : "\u2713 Adapt each activity to the child's needs.";
        contentBlocks.push({
          text: tipsText,
          x: 70,
          y: 185,
          width: PAGE_WIDTH - 140,
          fontSize: 12,
          font: "normal",
          align: "left",
          fontColor: "#333333",
          backgroundColor: PANEL,
          padding: 12,
          radius: 6,
        });

        contentBlocks.push({
          text: "Remember: Every child is unique. Adapt activities to individual needs and comfort levels.",
          x: 60,
          y: 640,
          width: PAGE_WIDTH - 120,
          fontSize: 10,
          font: "normal",
          align: "center",
          fontColor: "#555555",
          backgroundColor: PANEL_SOFT,
          padding: 6,
          radius: 4,
        });

        pageContents.push({
          imageBuffer: buffer,
          contentBlocks,
          pageNumber: page.pageNumber,
          totalPages: job.totalPages,
        });
      } else {
        // Activity page with structured overlay. Each text group sits on a
        // readable white/semi-transparent panel over the calming illustration.
        const ac = page.metadata?.activityContent || {};
        const contentBlocks: NonNullable<PageContent["contentBlocks"]> = [];
        const PANEL = "rgba(255,255,255,0.92)";
        const PANEL_SOFT = "rgba(255,255,255,0.85)";

        // Activity title at top
        contentBlocks.push({
          text: ac.activityName || "Activity",
          x: 45,
          y: 36,
          width: PAGE_WIDTH - 90,
          fontSize: 18,
          font: "bold",
          align: "center",
          fontColor: "#2c3e50",
          backgroundColor: PANEL,
          padding: 8,
          radius: 6,
        });

        // Target info and age range
        contentBlocks.push({
          text: ac.targetInfo || "",
          x: 50,
          y: 70,
          width: PAGE_WIDTH - 100,
          fontSize: 9,
          font: "normal",
          align: "center",
          fontColor: "#555555",
          backgroundColor: PANEL_SOFT,
          padding: 4,
          radius: 3,
        });

        // Materials section grouped into one panel (top-right area).
        const materials: string[] = ac.materials || [];
        const materialsText =
          "Materials:\n" +
          (materials.length ? materials.map((m) => `\u2022 ${m}`).join("\n") : "\u2022 None");
        contentBlocks.push({
          text: materialsText,
          x: 390,
          y: 110,
          width: 180,
          fontSize: 9,
          font: "normal",
          align: "left",
          fontColor: "#2c3e50",
          backgroundColor: PANEL,
          padding: 8,
          radius: 5,
        });

        // Steps section grouped into one panel (bottom area).
        const steps: string[] = ac.steps || [];
        const stepsText =
          "Instructions:\n" +
          (steps.length
            ? steps.map((s, i) => `${i + 1}. ${s}`).join("\n")
            : "1. Follow along at a comfortable pace.");
        contentBlocks.push({
          text: stepsText,
          x: 50,
          y: 540,
          width: PAGE_WIDTH - 100,
          fontSize: 10,
          font: "normal",
          align: "left",
          fontColor: "#1a1a1a",
          backgroundColor: PANEL,
          padding: 10,
          radius: 6,
        });

        // Professional tip at very bottom
        if (ac.tip) {
          contentBlocks.push({
            text: `\u{1F4A1} Tip: ${ac.tip}`,
            x: 50,
            y: 735,
            width: PAGE_WIDTH - 100,
            fontSize: 8,
            font: "normal",
            align: "center",
            fontColor: "#555555",
            backgroundColor: PANEL_SOFT,
            padding: 5,
            radius: 3,
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
