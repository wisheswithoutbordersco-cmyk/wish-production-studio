/**
 * Worksheet Generator
 *
 * Every cover and worksheet page is generated as one complete portrait image.
 * GPT-4o specifies the exact copy, layout, typography, answer areas, decoration,
 * branding, and page number; FLUX renders the complete final printable page.
 */
import { generateFullPageImage, generateContent, customPromptInstruction, finalizePdf } from "./shared";
import { createJob, getJob, updateJob, addPageResult, type GenerationJob, type PageResult } from "../jobs";

export interface WorksheetOptions {
  customPrompt?: string;
  subject: string;
  specificSkill: string;
  gradeLevel: string;
  theme: string;
  quantity: number;
}

type WorksheetRuntimeOptions = WorksheetOptions & {
  /** Internal per-job state; options are held in memory for the lifetime of a job. */
  __usedMathProblems?: Set<string>;
};

type WorksheetContent = {
  title: string;
  instructions: string;
  items: string[];
  activityType: string;
};

type MathProblem = {
  key: string;
  display: string;
  answer: number;
};

const CONTENT_GENERATION_ATTEMPTS = 3; // Initial attempt plus two corrective retries.
const NUMBER_PATTERN = "-?\\d+(?:\\.\\d+)?";
const OPERATOR_PATTERN = "[+\\-−×xX*÷/]";

const SKILL_MAP: Record<string, string[]> = {
  "Math": ["Addition", "Subtraction", "Multiplication", "Division", "Fractions", "Telling Time", "Money", "Patterns", "Geometry", "Word Problems"],
  "Reading": ["Phonics", "Sight Words", "Reading Comprehension", "Vocabulary", "Sequencing", "Main Idea", "Context Clues"],
  "Writing": ["Handwriting", "Sentence Building", "Creative Writing", "Punctuation", "Grammar", "Spelling", "Paragraph Writing"],
  "Science": ["Life Cycles", "Weather", "Animals", "Plants", "Human Body", "Space", "Matter", "Energy"],
  "Social Studies": ["Community Helpers", "Maps", "History", "Culture", "Geography", "Government", "Economics"],
  "Art": ["Color Theory", "Drawing", "Patterns", "Symmetry", "Art History", "Mixed Media"],
  "Music": ["Rhythm", "Notes", "Instruments", "Composers", "Listening", "Singing"],
  "SEL": ["Emotions", "Friendship", "Kindness", "Self-Regulation", "Empathy", "Conflict Resolution", "Growth Mindset"],
};

const ACTIVITY_TYPES = [
  "fill-in-the-blank",
  "matching",
  "multiple-choice",
  "short-answer",
  "true-or-false",
  "ordering/sequencing",
];

function gradeToAgeRange(gradeLevel: string): string {
  if (gradeLevel.includes("Pre-K") || gradeLevel.includes("Preschool")) return "ages 3-5";
  if (gradeLevel.includes("K") || gradeLevel.includes("Kindergarten")) return "ages 5-6";
  if (gradeLevel.includes("1")) return "ages 6-7";
  if (gradeLevel.includes("2")) return "ages 7-8";
  if (gradeLevel.includes("3")) return "ages 8-9";
  if (gradeLevel.includes("4")) return "ages 9-10";
  if (gradeLevel.includes("5")) return "ages 10-11";
  if (gradeLevel.includes("6")) return "ages 11-12";
  return "ages 6-10";
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
 * Normalize operators so equivalent notation is validated consistently.
 */
function normalizeOperator(operator: string): string {
  if (["×", "x", "X", "*"].includes(operator)) return "*";
  if (["÷", "/"].includes(operator)) return "/";
  if (operator === "−") return "-";
  return operator;
}

function normalizeNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8)));
}

function calculateAnswer(left: number, operator: string, right: number): number | null {
  if (operator === "+") return left + right;
  if (operator === "-") return left - right;
  if (operator === "*") return left * right;
  if (operator === "/") return right === 0 ? null : left / right;
  return null;
}

/**
 * Addition and multiplication reversals are treated as the same math fact. This
 * is stricter than textual equality and prevents pages such as 4 + 5 / 5 + 4.
 */
function createProblemKey(left: number, operator: string, right: number): string {
  const operands = operator === "+" || operator === "*"
    ? [left, right].sort((a, b) => a - b)
    : [left, right];
  return `${normalizeNumber(operands[0])}${operator}${normalizeNumber(operands[1])}`;
}

function extractMathProblems(item: string): MathProblem[] {
  const equationRegex = new RegExp(`(${NUMBER_PATTERN})\\s*(${OPERATOR_PATTERN})\\s*(${NUMBER_PATTERN})`, "g");
  const problems: MathProblem[] = [];
  let match: RegExpExecArray | null;

  while ((match = equationRegex.exec(item)) !== null) {
    const left = Number(match[1]);
    const operator = normalizeOperator(match[2]);
    const right = Number(match[3]);
    const answer = calculateAnswer(left, operator, right);
    if (answer === null || !Number.isFinite(answer)) continue;

    problems.push({
      key: createProblemKey(left, operator, right),
      display: `${normalizeNumber(left)} ${operator} ${normalizeNumber(right)}`,
      answer,
    });
  }

  return problems;
}

function extractChoiceValues(item: string): number[] {
  const values: number[] = [];
  const labeledChoiceRegex = new RegExp(`(?:^|\\s)[a-dA-D][).:]\\s*(${NUMBER_PATTERN})(?=\\s|$|[,;])`, "g");
  let match: RegExpExecArray | null;
  while ((match = labeledChoiceRegex.exec(item)) !== null) {
    values.push(Number(match[1]));
  }

  const choicesSection = item.match(/(?:answer\s+choices?|choices?)\s*:\s*(.+)$/i)?.[1];
  if (choicesSection) {
    const numberRegex = new RegExp(NUMBER_PATTERN, "g");
    for (const value of choicesSection.match(numberRegex) || []) {
      values.push(Number(value));
    }
  }

  return Array.from(new Set(values.filter(Number.isFinite)));
}

function validateMathContent(
  content: WorksheetContent,
  usedProblems: Set<string>
): { errors: string[]; problemKeys: string[] } {
  const errors: string[] = [];
  const currentPageProblems = new Set<string>();
  const problemKeys: string[] = [];

  content.items.forEach((item, itemIndex) => {
    const problems = extractMathProblems(item);
    if (problems.length === 0) {
      errors.push(`Item ${itemIndex + 1} does not contain a parseable math equation.`);
      return;
    }

    problems.forEach(problem => {
      if (currentPageProblems.has(problem.key)) {
        errors.push(`Item ${itemIndex + 1} repeats ${problem.display} on this page.`);
      } else if (usedProblems.has(problem.key)) {
        errors.push(`Item ${itemIndex + 1} repeats previously used problem ${problem.display}.`);
      } else {
        currentPageProblems.add(problem.key);
        problemKeys.push(problem.key);
      }

      if (content.activityType === "matching" || content.activityType === "multiple-choice") {
        const choices = extractChoiceValues(item);
        const hasCorrectChoice = choices.some(choice => Math.abs(choice - problem.answer) < 1e-8);
        if (!hasCorrectChoice) {
          errors.push(
            `Item ${itemIndex + 1} (${problem.display}) must include the correct answer ${normalizeNumber(problem.answer)} among its choices.`
          );
        }
      }
    });
  });

  return { errors, problemKeys };
}

function parseWorksheetContent(
  rawContent: string,
  opts: WorksheetOptions,
  activityType: string
): WorksheetContent {
  const parsed = JSON.parse(rawContent) as Record<string, unknown>;
  const items = Array.isArray(parsed.items)
    ? parsed.items.filter((item): item is string => typeof item === "string").slice(0, 8)
    : [];

  if (items.length === 0) {
    throw new Error("The response did not contain any worksheet items.");
  }

  return {
    title: typeof parsed.title === "string" && parsed.title.trim()
      ? parsed.title
      : `${opts.specificSkill} Practice`,
    instructions: typeof parsed.instructions === "string" && parsed.instructions.trim()
      ? parsed.instructions
      : `Complete each ${activityType} activity below.`,
    items,
    activityType,
  };
}

/**
 * Generate age-appropriate worksheet content using GPT.
 */
async function generateWorksheetContent(opts: WorksheetOptions, pageVariant: number): Promise<WorksheetContent> {
  const ageRange = gradeToAgeRange(opts.gradeLevel);
  const activityType = ACTIVITY_TYPES[pageVariant % ACTIVITY_TYPES.length];
  const runtimeOptions = opts as WorksheetRuntimeOptions;
  const usedProblems = runtimeOptions.__usedMathProblems ?? new Set<string>();
  runtimeOptions.__usedMathProblems = usedProblems;
  const isMathWorksheet = opts.subject.toLowerCase() === "math";
  const previouslyUsedProblems = Array.from(usedProblems).sort();

  const systemPrompt = `You are an expert elementary school teacher creating engaging, age-appropriate educational worksheets.
Your worksheets are clear, encouraging, and perfectly matched to the student's level.${customPromptInstruction(opts.customPrompt)}

ABSOLUTE MATH ACCURACY AND UNIQUENESS RULES — THESE ARE NON-NEGOTIABLE:
- NEVER repeat a math problem within a page or across pages. A problem is the same when it has the same operands and operator. For addition and multiplication, reversed operands also count as the same problem (for example, 4 + 5 and 5 + 4 are duplicates).
- Before returning JSON, compare every equation against every other equation and against the previously used list. Replace every duplicate.
- Calculate and DOUBLE-CHECK every arithmetic answer before outputting the JSON.
- For every matching or multiple-choice item, the mathematically correct answer MUST appear among that item's provided choices. Never provide a question whose correct answer is absent.
- Return only valid JSON matching the requested shape. Do not rely on the image model to correct content mistakes.`;

  const formatGuidance = activityType === "matching"
    ? '- matching: "Match: 4 + 5 → Choices: 7, 8, 9" format. Include at least three numeric choices in EVERY item, including the correct answer.'
    : activityType === "multiple-choice"
      ? '- multiple-choice: "Q: What is 4 + 5?  a) 7  b) 8  c) 9  d) 10" format. Include the correct answer in EVERY item.'
      : `- ${activityType}: ${
          activityType === "fill-in-the-blank"
            ? "equations with ___________ for the missing answer"
            : activityType === "short-answer"
              ? "questions requiring brief written answers"
              : activityType === "true-or-false"
                ? 'statements followed by "True / False: ___"'
                : '"Put in order: [items to sequence]"'
        }`;

  const baseUserPrompt = `Create worksheet content for:
- Subject: ${opts.subject}
- Skill: ${opts.specificSkill}
- Grade Level: ${opts.gradeLevel} (${ageRange})
- Activity Type: ${activityType}
- Variant: ${pageVariant + 1} (make this unique from other variants)

Return a JSON object:
{
  "title": "Worksheet title (short, max 5 words)",
  "instructions": "Clear one-sentence instruction",
  "items": ["Item 1", "Item 2", "Item 3", "Item 4", "Item 5", "Item 6"]
}

For ${activityType} format:
${formatGuidance}

PREVIOUSLY USED MATH PROBLEMS — DO NOT USE ANY OF THESE:
${previouslyUsedProblems.length > 0 ? previouslyUsedProblems.join(", ") : "None yet."}

RULES:
- All items must be age-appropriate for ${ageRange}
- Each item must be self-contained (no references to images)
- NEVER include placeholder text like "[Picture of...]"
- Keep items concise — one line each
- For math worksheets, include exactly one parseable equation in every item`;

  let validationErrors: string[] = [];
  let lastError: unknown;

  for (let attempt = 1; attempt <= CONTENT_GENERATION_ATTEMPTS; attempt++) {
    const correctionPrompt = attempt === 1
      ? ""
      : `\n\nCORRECTION REQUIRED — ATTEMPT ${attempt}:
Your previous attempt had duplicates, missing correct choices, invalid arithmetic, or malformed JSON. Fix every issue and return a completely corrected JSON object.
Validation failures from the previous attempt:
${validationErrors.map(error => `- ${error}`).join("\n")}
Do not repeat any rejected equation. Recalculate every answer before responding.`;

    try {
      const rawContent = await generateContent({
        systemPrompt,
        userPrompt: `${baseUserPrompt}${correctionPrompt}`,
        responseFormat: { type: "json_object" },
      });
      const parsedContent = parseWorksheetContent(rawContent, opts, activityType);

      if (isMathWorksheet) {
        const validation = validateMathContent(parsedContent, usedProblems);
        validationErrors = validation.errors;
        if (validationErrors.length > 0) {
          lastError = new Error(validationErrors.join(" "));
          continue;
        }
        validation.problemKeys.forEach(problem => usedProblems.add(problem));
      }

      return parsedContent;
    } catch (error) {
      lastError = error;
      validationErrors = [error instanceof Error ? error.message : "Invalid worksheet JSON response."];
    }
  }

  if (isMathWorksheet) {
    throw new Error(
      `Worksheet math validation failed after ${CONTENT_GENERATION_ATTEMPTS} attempts: ${
        lastError instanceof Error ? lastError.message : "unknown validation error"
      }`
    );
  }

  return {
    title: `${opts.subject}: ${opts.specificSkill}`,
    instructions: `Practice your ${opts.specificSkill} skills below:`,
    items: Array.from({ length: 6 }, (_, i) => `${i + 1}. ___________________________________________`),
    activityType,
  };
}

async function generateWorksheetPage(pageIndex: number, job: GenerationJob): Promise<PageResult> {
  const opts = job.options as WorksheetOptions;
  const pageNumber = pageIndex + 1;

  if (pageIndex === 0) {
    const { imageUrl } = await generateFullPageImage({
      generatorType: "educational worksheet set",
      pageType: "front cover",
      pageNumber,
      totalPages: job.totalPages,
      audience: `${opts.gradeLevel} students`,
      creativeDirection: `A colorful ${opts.subject} worksheet collection focused on ${opts.specificSkill}, with a ${opts.theme} theme`,
      customPrompt: opts.customPrompt,
      exactText: [opts.subject, opts.specificSkill, `Grade: ${opts.gradeLevel}`, "Worksheet Collection"],
      layoutGuidance: "Create a polished portrait cover with a strong title hierarchy, a visible skill subtitle and grade badge, integrated subject-specific illustrations, and balanced themed decorations. Keep branding at the bottom inside safe margins.",
      styleGuidance: "Premium classroom-resource cover design with bold friendly display lettering, clean supporting typography, vibrant print-friendly colors, decorative icons, borders, and a cohesive professional finish.",
      functionalRequirements: ["The cover must remain clear and attractive at thumbnail size."],
    });

    return { pageNumber, imageUrl, status: "success", metadata: { isCover: true } };
  }

  const worksheetContent = await generateWorksheetContent(opts, pageIndex - 1);
  const items = worksheetContent.items
    .map(item => scrubPlaceholders(item))
    .filter(item => item.length > 0);
  const exactText = [
    "Name: ____________________    Date: ____________",
    scrubPlaceholders(worksheetContent.title) || "Practice",
    `${worksheetContent.activityType.toUpperCase()}: ${scrubPlaceholders(worksheetContent.instructions) || "Complete the activity below."}`,
    ...items.flatMap((item, index) => [
      `${index + 1}. ${item}`,
      "Answer: ______________________________",
    ]),
    `${opts.subject} | ${opts.specificSkill} | ${opts.gradeLevel}`,
  ];

  const { imageUrl } = await generateFullPageImage({
    generatorType: "educational worksheet",
    pageType: `${worksheetContent.activityType} practice page ${pageIndex}`,
    pageNumber,
    totalPages: job.totalPages,
    audience: `${opts.gradeLevel} students`,
    creativeDirection: `${opts.theme}-themed ${opts.subject} worksheet focused on ${opts.specificSkill}`,
    customPrompt: opts.customPrompt,
    exactText,
    layoutGuidance: "Create a complete portrait worksheet with a slim name/date row, a prominent themed title banner, a clearly separated instruction box, and the numbered problems arranged in spacious rows or activity cards. Put a writable answer line immediately under each item and a small subject/skill/grade footer at the bottom.",
    styleGuidance: "Crisp teacher-created resource design with friendly educational typography, strong contrast, consistent numbered problem styling, coordinated boxes and dividers, small themed icons or mascot accents, and generous white writing space.",
    functionalRequirements: [
      "All questions, choices, blanks, punctuation, and answer lines must remain fully visible and usable.",
      "Decoration must stay outside functional text and writing areas.",
      "Preserve underscores, answer choices, arrows, and mathematical symbols exactly.",
    ],
  });

  return { pageNumber, imageUrl, status: "success", metadata: { worksheetContent } };
}

/**
 * Custom chunk processor for worksheets.
 */
async function processWorksheetChunkInternal(job: GenerationJob): Promise<void> {
  const PAGES_PER_CHUNK = 1;
  const startIndex = job.nextPageIndex;
  const endIndex = Math.min(startIndex + PAGES_PER_CHUNK, job.totalPages);

  updateJob(job.id, {
    status: "generating",
    statusMessage: `Generating worksheets ${startIndex + 1}-${endIndex} of ${job.totalPages}...`,
  });

  for (let i = startIndex; i < endIndex; i++) {
    try {
      const result = await generateWorksheetPage(i, job);
      addPageResult(job.id, result);
      updateJob(job.id, {
        nextPageIndex: i + 1,
        statusMessage: `Generated worksheet ${i + 1} of ${job.totalPages}`,
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

export function createWorksheetJob(options: WorksheetOptions): string {
  const totalPages = options.quantity + 1; // +1 for cover
  const runtimeOptions: WorksheetRuntimeOptions = {
    ...options,
    __usedMathProblems: new Set<string>(),
  };
  const job = createJob(
    "worksheet",
    totalPages,
    runtimeOptions,
    `worksheet-${options.subject.toLowerCase()}-${options.specificSkill.toLowerCase().replace(/\s+/g, "-")}.pdf`
  );
  return job.id;
}

export async function processWorksheetChunk(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");
  await processWorksheetChunkInternal(job);
}

export function getSkillsForSubject(subject: string): string[] {
  return SKILL_MAP[subject] || [];
}
