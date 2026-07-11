/**
 * Therapeutic Activity Generator
 *
 * Every cover, guide, and activity page is generated as one complete portrait
 * image. GPT-4o specifies the exact copy, therapeutic layout, typography,
 * response areas, calming decoration, branding, and page number for FLUX to
 * render as the final printable page with no later text overlay.
 */
import { generateFullPageImage, generateContent, customPromptInstruction, finalizePdf } from "./shared";
import { createJob, getJob, updateJob, addPageResult, type GenerationJob, type PageResult } from "../jobs";

export interface TherapeuticActivityOptions {
  customPrompt?: string;
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
  const pageNumber = pageIndex + 1;
  const repPrompt = getRepresentationPrompt(opts.representation);
  const targetMod = getTargetModifier(opts.target);

  if (pageIndex === 0) {
    const { imageUrl } = await generateFullPageImage({
      generatorType: "therapeutic activity resource",
      pageType: "front cover",
      pageNumber,
      totalPages: job.totalPages,
      audience: `${opts.target} learners ages ${opts.ageRange}`,
      creativeDirection: `A calming ${opts.activityType} therapeutic resource, ${repPrompt}, ${targetMod}`,
      customPrompt: opts.customPrompt,
      exactText: [opts.activityType, `For: ${opts.target}`, `Ages: ${opts.ageRange}`, "Therapeutic Activities Resource"],
      layoutGuidance: "Create a reassuring portrait cover with the resource title as the primary focal point, a clear target-population subtitle and age badge, inclusive child-centered illustrations, gentle nature or sensory motifs, and unobtrusive branding at the bottom.",
      styleGuidance: "Professional pediatric therapy publishing design with soft rounded display typography, highly readable supporting type, soothing pastel colors, gentle organic shapes, subtle borders, and a calm uncluttered finish.",
      functionalRequirements: ["Avoid visual overload, harsh contrast, frightening imagery, and stigmatizing symbols."],
    });

    return { pageNumber, imageUrl, status: "success", metadata: { isCover: true } };
  }

  if (pageIndex === 1) {
    const howToUse = await generateHowToUse(opts);
    const tips = howToUse.map(tip => scrubPlaceholders(tip)).filter(Boolean);
    const exactText = [
      "How to Use This Resource",
      `Designed for: ${opts.target} • Ages: ${opts.ageRange}`,
      ...tips.map(tip => `✓ ${tip}`),
      "Remember: Every child is unique. Adapt activities to individual needs and comfort levels.",
    ];
    const { imageUrl } = await generateFullPageImage({
      generatorType: "therapeutic activity resource",
      pageType: "how-to-use guidance page",
      pageNumber,
      totalPages: job.totalPages,
      audience: `parents, educators, and therapists supporting ${opts.target} learners ages ${opts.ageRange}`,
      creativeDirection: `A calm practical guidance page for a ${opts.activityType} resource, ${repPrompt}, ${targetMod}`,
      customPrompt: opts.customPrompt,
      exactText,
      layoutGuidance: "Create a complete portrait guidance page with a calming illustrated title banner, a centered audience line, five large rounded tip cards arranged vertically with check icons, a gentle reminder callout near the bottom, and a compact branded footer.",
      styleGuidance: "Sensory-friendly professional therapy-resource design with soft pastel panels, rounded sans-serif typography, strong legibility, generous spacing, minimal clutter, and supportive inclusive decorative accents.",
      functionalRequirements: [
        "Keep every practical tip fully visible and easy to scan.",
        "Use predictable alignment and clear visual boundaries between tips.",
      ],
    });

    return { pageNumber, imageUrl, status: "success", metadata: { isHowToUse: true, howToUse } };
  }

  const activityPrompt = getActivityPrompt(opts.activityType, pageIndex - 2);
  const activityContent = await generateTherapeuticContent(opts, pageIndex - 2);
  const materials = activityContent.materials.map(item => scrubPlaceholders(item)).filter(Boolean);
  const steps = activityContent.steps.map(item => scrubPlaceholders(item)).filter(Boolean);
  const exactText = [
    scrubPlaceholders(activityContent.activityName) || "Therapeutic Activity",
    scrubPlaceholders(activityContent.targetInfo) || `For ${opts.target}, ages ${opts.ageRange}`,
    "Materials Needed:",
    ...materials.map(item => `• ${item}`),
    "Instructions:",
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    `Tip: ${scrubPlaceholders(activityContent.tip)}`,
    `${opts.activityType} | ${opts.target} | Ages ${opts.ageRange}`,
  ];

  const { imageUrl } = await generateFullPageImage({
    generatorType: "therapeutic activity page",
    pageType: `${opts.activityType} activity ${pageIndex - 1}`,
    pageNumber,
    totalPages: job.totalPages,
    audience: `${opts.target} learners ages ${opts.ageRange} and their supporting adults`,
    creativeDirection: `${activityPrompt}; ${repPrompt}; ${targetMod}`,
    customPrompt: opts.customPrompt,
    exactText,
    layoutGuidance: "Create a complete portrait therapy activity page with a calming illustrated title banner, a concise target-skills line, a compact materials panel, a large numbered instruction section with predictable spacing, a professional tip callout near the bottom, and a small footer. Integrate supportive illustrations without obstructing any content.",
    styleGuidance: "Evidence-informed pediatric therapy resource with sensory-friendly pastel colors, rounded readable typography, clear visual boundaries, minimal distractions, inclusive characters, simple supportive icons, and a calm professional editorial layout.",
    functionalRequirements: [
      "Every material and numbered instruction must be fully visible, correctly ordered, and easy to follow.",
      "Keep the page predictable, uncluttered, non-stigmatizing, and adaptable to different comfort levels.",
      "Decorations must never overlap instructions, visual supports, or functional activity areas.",
    ],
  });

  return { pageNumber, imageUrl, status: "success", metadata: { activityContent } };
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
    await finalizePdf(updatedJob);
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
