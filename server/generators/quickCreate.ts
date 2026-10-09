import sharp from "sharp";
import { ENV } from "../_core/env";
import { invokeLLM } from "../_core/llm";
import {
  addPageResult,
  createJob,
  getJob,
  updateJob,
  type GenerationJob,
  type PageResult,
} from "../jobs";
import { storagePut } from "../storage";
import { finalizePdf } from "./shared";

// ─── Branding Types ──────────────────────────────────────────────────────────

export type BrandingOption =
  | "WishesWithoutBordersCo"
  | "LaneDigitalWorks"
  | "none";

export type QuickCreateOutputStyle =
  | "full-color"
  | "coloring"
  | "reference-coloring";

// ─── Size Presets ─────────────────────────────────────────────────────────────

export type SizePreset =
  | "8.5x11-portrait"
  | "8.5x11-landscape"
  | "11x14"
  | "16x20"
  | "square";

interface SizeDimensions {
  width: number; // pixels at 300 DPI
  height: number; // pixels at 300 DPI
  label: string; // human-readable for prompts
}

const SIZE_PRESETS: Record<SizePreset, SizeDimensions> = {
  "8.5x11-portrait": { width: 2550, height: 3300, label: "8.5×11 portrait" },
  "8.5x11-landscape": { width: 3300, height: 2550, label: "8.5×11 landscape" },
  "11x14": { width: 3300, height: 4200, label: "11×14 portrait" },
  "16x20": { width: 4800, height: 6000, label: "16×20 portrait" },
  square: { width: 3000, height: 3000, label: "10×10 square" },
};

function getSizeDimensions(preset: SizePreset): SizeDimensions {
  return SIZE_PRESETS[preset] || SIZE_PRESETS["8.5x11-portrait"];
}

// ─── Page Context ─────────────────────────────────────────────────────────────

// Inlined to keep the Railway build self-contained; no separate policy module is required.
export interface ScriptoriumPageContext {
  prompt: string;
  pageIndex: number;
  totalPages: number;
  branding: BrandingOption;
}

// Sunburst is the highest-quality GPT Image 2.5 variant and is the right fit
// for text-heavy, full-color printable publications. Keep GPT Image 2 as a
// one-step compatibility fallback while the newer model rolls out.
export const SCRIPTORIUM_IMAGE_MODEL = "gpt-image-2.5-sunburst";
export const SCRIPTORIUM_IMAGE_FALLBACK_MODEL = "gpt-image-2";
const IMAGE_MODELS = [
  SCRIPTORIUM_IMAGE_MODEL,
  SCRIPTORIUM_IMAGE_FALLBACK_MODEL,
];

export const SCRIPTORIUM_RENDER_QUALITY =
  "premium professional publishing quality, bold saturated vivid colors, high contrast, a rich vibrant palette, intense clean color separation, crisp clean edges, sharply defined characters and illustrations, refined textures, precise typography, excellent legibility, artifact-free, polished, detailed, and print-ready; avoid beige, cream, muted earth tones, dusty colors, desaturated color, washed-out color, and soft pastel palettes unless the user explicitly requests them";

// ─── Dynamic System Prompt ────────────────────────────────────────────────────

export function getScriptoriumSystemPrompt(branding: BrandingOption): string {
  let brandingLine1: string;
  let brandingLine2: string;

  if (branding === "none") {
    brandingLine1 = "";
    brandingLine2 = "";
  } else {
    brandingLine1 = `\n- Footer branding with the exact text "${branding}"`;
    brandingLine2 = `\n- Always include "${branding}" as small, legible footer branding text`;
  }

  return `You are an expert publishing art director and product designer creating prompts for AI image generation of professional printable books, workbooks, journals, planners, trackers, guides, activity products, and other page-based publications.

CORE INTENT RULE:
- The USER REQUEST is authoritative. First infer the exact product type, purpose, structure, tone, intended audience, complexity, and use solely from the user\'s words, then design that product.
- Never turn a request into a school worksheet, lesson, quiz, math exercise, classroom activity, or answer-blank page unless the user explicitly asks for an educational or practice-based product.
- Recipe books must contain recipes and appropriate recipe-page structure. Creative-writing workbooks must support writing craft and exercises. Fitness trackers must contain fitness plans, logs, metrics, and reflection fields. Journals, planners, games, storybooks, reference guides, and other products must use the conventions appropriate to their requested form.
- If the user says adult, child, kid, teen, beginner, advanced, or provides another audience cue, follow that cue. If no audience is stated, infer the best fit from the requested product and content. Do not invent a classroom context.

Given the user\'s request, create a detailed image-generation prompt for ONE COMPLETE full-page design. Include only the content and page elements that genuinely belong in the requested product, such as:
- An appropriate page title, subtitle, or section heading with exact text where useful
- The exact body copy, instructions, prompts, fields, labels, recipes, schedules, stories, lists, or activities needed for that specific page
- A coordinated visual theme, palette, typography, illustration style, and decorative treatment that matches the request
- A clear layout describing how every necessary section and content item is arranged
- Purposeful illustrations, characters, icons, charts, or decorative elements when they support the product${brandingLine1}

RULES:
- Describe ONE complete, flat, full-page image at 8.5x11 inches in portrait orientation
- Fill the entire canvas edge-to-edge; never depict a photographed sheet, mockup, framed object, or page placed on another background
- Follow the user\'s requested format and content literally; do not inject generic educational material or unrelated school exercises
- Include an amount of content appropriate to the page\'s purpose. Do not force a fixed number of questions, blanks, panels, or activities
- Include all required text verbatim in the image prompt, with correct spelling and factual accuracy
- Describe specific colors, font styles, text hierarchy, spacing, panels, shapes, icons, and illustrations appropriate to the requested aesthetic
- Prioritize legibility with strong contrast, generous spacing, clean grouping, and no overlap between text and decorative elements
- For every full-color page, explicitly demand bold saturated vivid colors, high contrast, and a rich vibrant palette with intense clean color separation. Reject beige, cream, muted earth tones, dusty colors, desaturated or washed-out color, and soft pastel palettes unless the user explicitly requests one of those looks
- Use premium publishing aesthetics with crisp clean edges, sharply defined characters and illustrations, refined detail, and polished print-ready composition
- Keep each page visually and substantively unique while maintaining a coherent product-wide style${brandingLine2}
- Do not mention post-production, overlays, editable layers, or adding text later; the generated image itself must be the complete finished page

Return JSON only with this shape: {"imagePrompt":"the complete image-generation prompt"}.`;
}

// Keep the original const for backward compatibility with other generators that import it.
export const SCRIPTORIUM_SYSTEM_PROMPT = getScriptoriumSystemPrompt(
  "WishesWithoutBordersCo"
);

export function buildScriptoriumUserPrompt({
  prompt,
  pageIndex,
  totalPages,
}: ScriptoriumPageContext): string {
  return `USER REQUEST:
${prompt}

PAGE:
${pageIndex + 1} of ${totalPages}

The user request above is the sole source of product type, audience, complexity, tone, and purpose. Create the complete image composition prompt for this page. Ensure its content and visual treatment are unique to this page while remaining consistent with the requested product. For a full-color page, require bold saturated vivid colors, high contrast, and a rich vibrant palette; explicitly avoid beige, cream, muted earth tones, dusty, desaturated, washed-out, and soft pastel color treatments unless the user requested them.`;
}

export function buildScriptoriumFallbackPrompt({
  prompt,
  pageIndex,
  totalPages,
  branding,
}: ScriptoriumPageContext): string {
  let brandingSuffix: string;
  if (branding === "none") {
    brandingSuffix = "";
  } else {
    brandingSuffix = ` Add the exact small footer branding text "${branding}".`;
  }

  return `Create ONE complete, flat, full-page professional publication page based exactly on this request: "${prompt}". Infer the product type, audience, complexity, tone, and purpose solely from the user\'s words. This is page ${pageIndex + 1} of ${totalPages}. Preserve the requested product type and use the structure, content, fields, copy, and page conventions that genuinely belong to it. Do not turn the request into a school worksheet, quiz, lesson, math exercise, or answer-blank activity unless the user explicitly requested that format. Use an 8.5x11-inch portrait composition filling the entire canvas edge-to-edge, never a photographed paper, mockup, frame, or page on a background. Render all necessary page text directly in the image with correct spelling and a polished font hierarchy. For a full-color page, use bold saturated vivid colors, high contrast, a rich vibrant palette, and intense clean color separation. Avoid beige, cream, muted earth tones, dusty colors, desaturated or washed-out color, and soft pastel palettes unless the user explicitly requested them. Use crisp typography, clean edges, sharply defined illustrations or characters when appropriate, balanced spacing, and refined subject-relevant visual details. Make the result look like a premium, vibrant, professionally published, print-ready product.${brandingSuffix}`;
}

export function buildScriptoriumImageRequest(prompt: string) {
  return {
    model: SCRIPTORIUM_IMAGE_MODEL,
    prompt: `${prompt}\n\nRENDER QUALITY REQUIREMENTS: ${SCRIPTORIUM_RENDER_QUALITY}. Render as one complete 8.5x11-inch portrait page, edge-to-edge. For full-color artwork, push color intensity hard: bold saturated vivid colors, high contrast, and a rich vibrant palette, never a muted beige, cream, earth-tone, dusty, desaturated, washed-out, or soft pastel treatment unless explicitly requested by the user.`,
    n: 1,
    quality: "high" as const,
    background: "opaque" as const,
  };
}

const PAGES_PER_CHUNK = 1;
const MAX_PAGE_COUNT = 30;
const IMAGE_GENERATION_ATTEMPTS = 3;
const MAX_REFERENCE_IMAGES = 4;
const MAX_REFERENCE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_REFERENCE_IMAGE_BYTES = 16 * 1024 * 1024;

const COLORING_NEGATIVE_PROMPT =
  "no text, no words, no letters, no numbers, no writing, no captions, no labels, no watermark, no signature, no blur, no distortion, no artifacts";
const COLORING_LINE_THRESHOLD = 180;

// ─── Types ───────────────────────────────────────────────────────────────────

type PageType = "coloring-page" | "text-heavy";

interface PageComposition {
  pageType: PageType;
  imagePrompt: string;
}

export interface QuickCreateOptions {
  prompt?: string;
  customPrompt?: string;
  pageCount: number;
  branding?: BrandingOption;
  outputStyle?: QuickCreateOutputStyle;
  sizePreset?: SizePreset;
  showPageNumbers?: boolean;
  upscale?: boolean;
  referenceImages?: QuickCreateReferenceImage[];
}

export type ReferenceImageRole =
  | "overall"
  | "face-identity"
  | "body-pose"
  | "style-color"
  | "object-scene"
  | "source-image";

export interface QuickCreateReferenceImage {
  data: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  role: ReferenceImageRole;
}

interface NormalizedOptions {
  prompt: string;
  pageCount: number;
  branding: BrandingOption;
  outputStyle: QuickCreateOutputStyle;
  sizePreset: SizePreset;
  showPageNumbers: boolean;
  upscale: boolean;
  referenceImages?: QuickCreateReferenceImage[];
}

interface ImageApiResponse {
  data?: Array<{
    b64_json?: string;
  }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const REFERENCE_ROLE_INSTRUCTIONS: Record<ReferenceImageRole, string> = {
  overall:
    "Use this as broad visual inspiration, following the user's keep/change instructions.",
  "face-identity":
    "Use this as the face/person identity reference. Preserve recognizable facial features, hair, and likeness when requested; do not copy its background or pose unless asked.",
  "body-pose":
    "Use this as the body, clothing, or pose reference, preserving only the aspects the user's prompt asks to keep.",
  "style-color":
    "Use this for art style, palette, lighting, texture, and visual treatment; do not copy unrelated subjects or layout.",
  "object-scene":
    "Use this for the referenced object, subject, or scene elements, incorporating only what the user's prompt requests.",
  "source-image":
    "This is the exact source artwork to convert, not broad inspiration. Preserve its composition, subject identity, pose, expression, framing, proportions, silhouette, and placement of important objects. Redraw the existing content as clean coloring-page outlines; do not invent a different scene or add text.",
};

export function buildReferenceImageInstructions(
  referenceImages: QuickCreateReferenceImage[]
): string {
  if (referenceImages.length === 0) return "";

  const instructions = referenceImages
    .map(
      (image, index) =>
        `- Reference image ${index + 1}: ${REFERENCE_ROLE_INSTRUCTIONS[image.role]}`
    )
    .join("\n");

  return `\n\nREFERENCE IMAGE GUIDANCE:\nUse each attached image according to its assigned role. Follow the user's explicit instructions about what to preserve or change above all else.\n${instructions}`;
}

function normalizeReferenceImages(
  input: QuickCreateOptions["referenceImages"]
): QuickCreateReferenceImage[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > MAX_REFERENCE_IMAGES) {
    throw new Error(
      `Use no more than ${MAX_REFERENCE_IMAGES} reference images`
    );
  }

  let totalBytes = 0;
  return input.map((image, index) => {
    if (!image || typeof image.data !== "string") {
      throw new Error(`Reference image ${index + 1} is invalid`);
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(image.mimeType)) {
      throw new Error(
        `Reference image ${index + 1} must be JPEG, PNG, or WebP`
      );
    }
    if (!Object.hasOwn(REFERENCE_ROLE_INSTRUCTIONS, image.role)) {
      throw new Error(`Reference image ${index + 1} has an unsupported role`);
    }

    const data = image.data.trim();
    const isBase64 =
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        data
      );
    if (!data || !isBase64) {
      throw new Error(
        `Reference image ${index + 1} is not valid base64 image data`
      );
    }

    const bytes = Buffer.from(data, "base64");
    if (bytes.length === 0 || bytes.length > MAX_REFERENCE_IMAGE_BYTES) {
      throw new Error(`Each reference image must be smaller than 5 MB`);
    }
    totalBytes += bytes.length;
    if (totalBytes > MAX_TOTAL_REFERENCE_IMAGE_BYTES) {
      throw new Error("Reference images together must be smaller than 16 MB");
    }

    return {
      data,
      mimeType: image.mimeType,
      role: image.role,
    };
  });
}

function normalizeOptions(options: QuickCreateOptions): NormalizedOptions {
  const rawPrompt = (options.prompt || options.customPrompt || "").trim();
  const pageCount = Number(options.pageCount);

  if (!rawPrompt) throw new Error("Prompt is required");
  if (
    !Number.isInteger(pageCount) ||
    pageCount < 1 ||
    pageCount > MAX_PAGE_COUNT
  ) {
    throw new Error(`Page count must be between 1 and ${MAX_PAGE_COUNT}`);
  }

  const branding: BrandingOption = options.branding || "WishesWithoutBordersCo";
  const outputStyle: QuickCreateOutputStyle =
    options.outputStyle || "full-color";
  const sizePreset: SizePreset = options.sizePreset || "8.5x11-portrait";
  const showPageNumbers = options.showPageNumbers !== false;
  const upscale = options.upscale === true;
  const referenceImages = normalizeReferenceImages(options.referenceImages);
  if (outputStyle === "reference-coloring" && referenceImages.length !== 1) {
    throw new Error("Photo-to-coloring mode requires exactly one source image");
  }
  const prompt = rawPrompt.slice(0, 2000);
  const normalizedReferenceImages =
    outputStyle === "reference-coloring"
      ? referenceImages.map(image => ({
          ...image,
          role: "source-image" as const,
        }))
      : referenceImages;

  return {
    prompt,
    pageCount,
    branding,
    outputStyle,
    sizePreset,
    showPageNumbers,
    upscale,
    referenceImages: normalizedReferenceImages,
  };
}

function extractLlmText(result: Awaited<ReturnType<typeof invokeLLM>>): string {
  const content = result.choices[0]?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map(part =>
      part.type === "text" && typeof part.text === "string" ? part.text : ""
    )
    .join("")
    .trim();
}

export function isColoringOutputStyle(
  outputStyle: QuickCreateOutputStyle
): boolean {
  return outputStyle === "coloring" || outputStyle === "reference-coloring";
}

export function buildColoringPagePrompt(options: {
  prompt: string;
  sizeLabel: string;
  pageIndex: number;
  totalPages: number;
  preserveReference: boolean;
}): string {
  const pageDescription = options.preserveReference
    ? `Convert the attached source image itself into a printable black-and-white coloring page; treat it as the artwork to transform, not as inspiration for a new scene. Preserve the same subject identity, facial features, expression, pose, proportions, framing and crop, silhouette, and placement of its distinctive accessories, patterns, and background elements. Redraw the existing content as clean, crisp, closed black outlines on pure white, leaving the interior regions open for coloring. Do not add, remove, rearrange, or invent subjects or objects. Do not add titles, captions, or other text. The user's additional instructions are: "${options.prompt}". Apply them as conversion and print instructions without changing the source composition.`
    : `Create a new black-and-white line-art coloring page based exactly on this request: "${options.prompt}". Infer the intended subject and level of detail from the user's words, but do not add unrelated content.`;

  return `${pageDescription} Use clean, consistently weighted outlines and generous white fillable areas. No color, gray tones, gradients, shadows, cross-hatching, stippling, background textures, or large solid-black shading; use solid black only for small essential details. Compose for a ${options.sizeLabel} page. This is page ${options.pageIndex + 1} of ${options.totalPages}.`;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

// ─── Replicate Real-ESRGAN Upscaler ──────────────────────────────────────────

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[];
  error?: string;
}

async function upscaleWithRealEsrgan(inputBuffer: Buffer): Promise<Buffer> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    console.warn("REPLICATE_API_TOKEN not set — skipping upscale");
    return inputBuffer;
  }

  const b64 = inputBuffer.toString("base64");
  const dataUri = `data:image/png;base64,${b64}`;

  const createRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      version:
        "42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b",
      input: { image: dataUri, scale: 4 },
    }),
  });

  if (!createRes.ok) {
    const detail = await createRes.text().catch(() => "");
    throw new Error(
      `Replicate prediction creation failed (${createRes.status}): ${detail}`
    );
  }

  const prediction = (await createRes.json()) as ReplicatePrediction;

  // Poll until complete (max 3 minutes, 5-second intervals)
  const maxAttempts = 36;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await wait(5000);

    const pollRes = await fetch(
      `https://api.replicate.com/v1/predictions/${prediction.id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!pollRes.ok) continue;

    const polled = (await pollRes.json()) as ReplicatePrediction;

    if (polled.status === "succeeded") {
      const outputUrl = Array.isArray(polled.output)
        ? polled.output[0]
        : polled.output;
      if (!outputUrl) throw new Error("Replicate returned no output URL");

      const imgRes = await fetch(outputUrl);
      if (!imgRes.ok)
        throw new Error(`Failed to download upscaled image (${imgRes.status})`);
      return Buffer.from(await imgRes.arrayBuffer());
    }

    if (polled.status === "failed" || polled.status === "canceled") {
      throw new Error(
        `Replicate upscale ${polled.status}: ${polled.error ?? "unknown"}`
      );
    }
  }

  throw new Error("Replicate upscale timed out after 3 minutes");
}

// ─── Composition Prompt Generation (LLM) ─────────────────────────────────────

async function generatePageComposition(
  options: NormalizedOptions,
  pageIndex: number,
  totalPages: number
): Promise<PageComposition> {
  const dims = getSizeDimensions(options.sizePreset);

  if (isColoringOutputStyle(options.outputStyle)) {
    return {
      pageType: "coloring-page",
      imagePrompt: buildColoringPagePrompt({
        prompt: options.prompt,
        sizeLabel: dims.label,
        pageIndex,
        totalPages,
        preserveReference: options.outputStyle === "reference-coloring",
      }),
    };
  }

  const systemPrompt = getScriptoriumSystemPrompt(options.branding);
  const userPrompt = buildScriptoriumUserPrompt({
    prompt: options.prompt,
    pageIndex,
    totalPages,
    branding: options.branding,
  });

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "page_composition_prompt",
          strict: true,
          schema: {
            type: "object",
            properties: {
              imagePrompt: { type: "string" },
            },
            required: ["imagePrompt"],
            additionalProperties: false,
          },
        },
      },
    });

    const parsed = JSON.parse(extractLlmText(result)) as {
      imagePrompt?: unknown;
    };
    const imagePrompt =
      typeof parsed.imagePrompt === "string" ? parsed.imagePrompt.trim() : "";

    if (!imagePrompt) {
      throw new Error("LLM returned an empty image composition prompt");
    }

    return {
      pageType: "text-heavy",
      imagePrompt,
    };
  } catch (error) {
    console.warn(
      `Composition prompt generation failed for page ${pageIndex + 1}, using fallback:`,
      error
    );
    return buildFallbackComposition(options, pageIndex, totalPages);
  }
}

function buildFallbackComposition(
  options: NormalizedOptions,
  pageIndex: number,
  totalPages: number
): PageComposition {
  return {
    pageType: "text-heavy",
    imagePrompt: buildScriptoriumFallbackPrompt({
      prompt: options.prompt,
      pageIndex,
      totalPages,
      branding: options.branding,
    }),
  };
}

// ─── Image Generation ─────────────────────────────────────────────────────────

export function buildScriptoriumImageEditFormData(
  prompt: string,
  referenceImages: QuickCreateReferenceImage[],
  model: string
): FormData {
  const formData = new FormData();
  formData.set("model", model);
  formData.set(
    "prompt",
    `${prompt}${buildReferenceImageInstructions(referenceImages)}`
  );
  formData.set("n", "1");
  formData.set("quality", "high");
  formData.set("size", "1024x1536");
  formData.set("background", "opaque");
  formData.set("output_format", "png");

  for (let index = 0; index < referenceImages.length; index++) {
    const image = referenceImages[index];
    const extension =
      image.mimeType === "image/png"
        ? "png"
        : image.mimeType === "image/webp"
          ? "webp"
          : "jpg";
    const imageBytes = Buffer.from(image.data, "base64");
    formData.append(
      "image[]",
      new Blob([new Uint8Array(imageBytes)], { type: image.mimeType }),
      `reference-${index + 1}.${extension}`
    );
  }

  return formData;
}

async function generateCompositionImage(
  prompt: string,
  referenceImages: QuickCreateReferenceImage[] = []
): Promise<Buffer> {
  let lastError: unknown;

  for (const model of IMAGE_MODELS) {
    for (let attempt = 1; attempt <= IMAGE_GENERATION_ATTEMPTS; attempt++) {
      try {
        const response =
          referenceImages.length > 0
            ? await fetch("https://api.openai.com/v1/images/edits", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${ENV.openaiApiKey}`,
                },
                body: buildScriptoriumImageEditFormData(
                  prompt,
                  referenceImages,
                  model
                ),
              })
            : await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${ENV.openaiApiKey}`,
                },
                body: JSON.stringify({
                  model,
                  prompt,
                  n: 1,
                  quality: "high",
                  size: "1024x1536",
                }),
              });

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          throw new Error(
            `${model} image generation failed (${response.status}): ${detail}`
          );
        }

        const result = (await response.json()) as ImageApiResponse;
        const b64 = result.data?.[0]?.b64_json;
        if (!b64) throw new Error(`${model} returned no image data`);

        return Buffer.from(b64, "base64");
      } catch (error) {
        lastError = error;
        if (attempt === IMAGE_GENERATION_ATTEMPTS) break;

        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `${model} composition image attempt ${attempt} of ${IMAGE_GENERATION_ATTEMPTS} failed: ${message}`
        );
        await wait(1000 * 2 ** (attempt - 1));
      }
    }

    console.warn(
      `Scriptorium image model ${model} was unavailable; trying the next supported model.`
    );
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Image generation failed after 3 attempts");
}

async function generateColoringPage(
  imagePrompt: string,
  dims: SizeDimensions,
  referenceImages: QuickCreateReferenceImage[] = [],
  preserveSource = false
): Promise<Buffer> {
  const coloringPrompt = `${imagePrompt}. Style requirements: pure black-and-white line art coloring page, thick clean outlines only, no shading, no gray tones, no color fills, no background textures, high-contrast black lines on a pure white background, exceptionally crisp vector-like edges, sharply defined subjects, premium professional coloring-book quality suitable for high-resolution printing. Negative requirements: ${COLORING_NEGATIVE_PROMPT}.`;

  const rawBuffer = await generateCompositionImage(
    coloringPrompt,
    referenceImages
  );

  // Post-process to ensure clean B&W output
  const cleaned = await sharp(rawBuffer)
    .flatten({ background: "#ffffff" })
    .grayscale()
    .threshold(COLORING_LINE_THRESHOLD)
    .sharpen()
    .png()
    .toBuffer();

  // Resize to target print dimensions
  return sharp(cleaned)
    .resize(dims.width, dims.height, {
      fit: preserveSource ? "contain" : "fill",
      background: "#ffffff",
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function generateTextHeavyPage(
  imagePrompt: string,
  dims: SizeDimensions,
  referenceImages: QuickCreateReferenceImage[] = []
): Promise<Buffer> {
  const rawBuffer = await generateCompositionImage(
    imagePrompt,
    referenceImages
  );

  return sharp(rawBuffer)
    .resize(dims.width, dims.height, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// ─── Page Generation ─────────────────────────────────────────────────────────

async function generateQuickCreatePage(
  pageIndex: number,
  job: GenerationJob
): Promise<PageResult> {
  const options = job.options as unknown as NormalizedOptions;
  const pageNumber = pageIndex + 1;
  const dims = getSizeDimensions(options.sizePreset);

  const composition = await generatePageComposition(
    options,
    pageIndex,
    job.totalPages
  );

  let finalBuffer =
    composition.pageType === "coloring-page"
      ? await generateColoringPage(
          composition.imagePrompt,
          dims,
          options.referenceImages,
          options.outputStyle === "reference-coloring"
        )
      : await generateTextHeavyPage(
          composition.imagePrompt,
          dims,
          options.referenceImages
        );

  // Optional 4× upscale via Replicate Real-ESRGAN
  if (options.upscale && process.env.REPLICATE_API_TOKEN) {
    try {
      updateJob(job.id, {
        statusMessage: `Upscaling page ${pageNumber} of ${job.totalPages}...`,
      });
      const upscaled = await upscaleWithRealEsrgan(finalBuffer);
      finalBuffer = await sharp(upscaled)
        .png({ compressionLevel: 9 })
        .toBuffer();
    } catch (upscaleError) {
      console.warn(
        `Upscale failed for page ${pageNumber}, using original:`,
        upscaleError
      );
    }
  }

  const { url: imageUrl } = await storagePut(
    `pages/quick-create/${job.id}/page-${String(pageNumber).padStart(3, "0")}.png`,
    finalBuffer,
    "image/png"
  );

  return {
    pageNumber,
    imageUrl,
    status: "success",
    metadata: { pageType: composition.pageType },
  };
}

// ─── Metadata Save ────────────────────────────────────────────────────────────

async function saveJobMetadata(
  job: GenerationJob,
  opts: NormalizedOptions,
  pdfFilename: string
): Promise<void> {
  try {
    const meta = {
      prompt: opts.prompt,
      branding: opts.branding,
      outputStyle: opts.outputStyle,
      pageCount: opts.pageCount,
      sizePreset: opts.sizePreset,
      showPageNumbers: opts.showPageNumbers,
      upscale: opts.upscale,
      timestamp: new Date().toISOString(),
      jobId: job.id,
    };
    const metaBuffer = Buffer.from(JSON.stringify(meta, null, 2), "utf-8");
    const metaKey = `products/quick-create/${pdfFilename.replace(/\.pdf$/, "")}_meta.json`;
    await storagePut(metaKey, metaBuffer, "application/json");
  } catch (err) {
    // Metadata save is non-critical — log and continue
    console.warn("Failed to save job metadata:", err);
  }
}

// ─── Chunk Processing & Job Creation ─────────────────────────────────────────

async function processQuickCreateChunkInternal(
  job: GenerationJob
): Promise<void> {
  const startIndex = job.nextPageIndex;
  const endIndex = Math.min(startIndex + PAGES_PER_CHUNK, job.totalPages);

  updateJob(job.id, {
    status: "generating",
    statusMessage: `Generating page ${startIndex + 1} of ${job.totalPages}...`,
  });

  for (let pageIndex = startIndex; pageIndex < endIndex; pageIndex++) {
    try {
      const result = await generateQuickCreatePage(pageIndex, job);
      addPageResult(job.id, result);
      updateJob(job.id, {
        nextPageIndex: pageIndex + 1,
        statusMessage: `Generated page ${pageIndex + 1} of ${job.totalPages}`,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`Quick Create page ${pageIndex + 1} failed:`, errorMessage);
      addPageResult(job.id, {
        pageNumber: pageIndex + 1,
        imageUrl: "",
        status: "error",
        error: errorMessage,
      });
      updateJob(job.id, {
        nextPageIndex: pageIndex + 1,
        statusMessage: `Page ${pageIndex + 1} failed; continuing...`,
      });
    }
  }

  const updatedJob = getJob(job.id);
  if (updatedJob && updatedJob.nextPageIndex >= updatedJob.totalPages) {
    const opts = updatedJob.options as unknown as NormalizedOptions;
    try {
      await saveJobMetadata(updatedJob, opts, updatedJob.filename);
      await finalizePdf(updatedJob, {
        addPdfBranding: opts.branding !== "none",
        showPageNumbers: opts.showPageNumbers,
      });
    } finally {
      // Reference photos are held only while the job is generating.
      delete opts.referenceImages;
    }
  }
}

export function createQuickCreateJob(options: QuickCreateOptions): string {
  const normalizedOptions = normalizeOptions(options);
  const job = createJob(
    "quick-create",
    normalizedOptions.pageCount,
    normalizedOptions,
    `quick-create-${Date.now()}.pdf`
  );
  return job.id;
}

export async function processQuickCreateChunk(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");
  await processQuickCreateChunkInternal(job);
}
