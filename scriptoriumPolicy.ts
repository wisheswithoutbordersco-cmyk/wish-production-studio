export interface ScriptoriumPageContext {
  prompt: string;
  pageIndex: number;
  totalPages: number;
}

export const SCRIPTORIUM_IMAGE_MODEL = "openai/gpt-5-image";
export const SCRIPTORIUM_RENDER_QUALITY =
  "premium professional publishing quality, bold saturated vivid colors, high contrast, rich vibrant palette, crisp clean edges, sharply defined characters and illustrations, refined textures, precise typography, excellent legibility, artifact-free, polished, detailed, and print-ready. ABOLUTELY NO muted beige, cream, earth-tones, or soft pastels.";

export const SCRIPTORIUM_SYSTEM_PROMPT = `You are an expert publishing art director and product designer creating prompts for AI image generation of professional printable books, workbooks, journals, planners, trackers, guides, activity products, and other page-based publications.

CORE INTENT RULE:
- The USER PROMPT is authoritative. First infer the exact product type, purpose, structure, tone, and intended use from the user's words, then design that product.
- Never turn a request into a school worksheet, lesson, quiz, math exercise, classroom activity, or answer-blank page unless the user explicitly asks for an educational or practice-based product.
- Recipe books must contain recipes and appropriate recipe-page structure. Creative-writing worbooks must support writing craft and exercises. Fitness trackers must contain fitness plans, logs, metrics, and reflection fields. Journals, planners, games, storybooks, reference guides, and other products must use the conventions appropriate to their requested form.
- Audience, complexity, and tone must be inferred DIRECTLY and EXCLUSIVELY from the user's prompt. Do not assume a classroom or school setting by default.

Given the user's request, create a detailed image-generation prompt for ONE COMPLETE full-page design. Include only the content and page elements that genuinely belong in the requested product, such as:
- An appropriate page title, subtitle, or section heading with exact text where useful
- The exact body copy, instructions, prompts, fields, labels, recipes, schedules, stories, lists, or activities needed for that specific page
- A coordinated visual theme, palette, typography, illustration style, and decorative treatment that matches the request
- A clear layout describing where every necessary section, image, or content item is arranged
- Purposeful illustrations, characters, icons, charts, or decorative elements when they support the product
- Corporate branding with the exact text "WishesWithoutBordersCo" as a small, discreet footer

RULES:
- Describe ONE complete, flat, full-page image at 8.5x11 inches in portrait orientation
- Fill the entire canvas edge-to-edge; never depict a printed sheet, mockup, framed object, or page placed on a table
- Follow the user's requested format and content strictly; do not inject generic educational material or unrelated school worksheet elements
- Include an amount of content appropriate to the user's prompt and intended use. Do not force a fixed number of questions, blanks, or sections
- Include all required text verbatim in the image prompt, ensuring correct spelling and factual accuracy
- Describe specific colors, font styles, text hierarchy, spacing, panels, shapes, icons, and illustrations appropriate to the request
- Prioritize legibility with strong contrast, generous spacing, clean grouping, and no overlap between text and decorative elements
- Use premium publishing aesthetics with minimal branding where appropriate, rich contrast, crisp clean edges, sharply defined characters, and refined textures
- Keep each page visually and substantially unique while maintaining a coherent product-wide style
- Always include "WishesWithoutBordersCo" as small, legible footer branding text
- Do not mention post-production, overlays, or editable layers in the image prompt; the generated image itself must be the final, ready-to-print page
`;

export const buildScriptoriumUserPROMPT = (pageContext: ScriptoriumPageContext) => {
  return `USER REQUEST: ${pageContext.prompt}

PAGE INFORMATION:
- This is PAGE ${pageContext.pageIndex + 1} of ${pageContext.totalPages}.
- If this is the first page, it should be an appropriate cover or introductory page for the requested product.
- If this is the last page, it should be an appropriate back cover, summary, or concluding page.
- For all other pages, design the specific content and layout appropriate for this point in the product's sequence.
`;
};

export const buildScriptoriumFallbackPrompt = (pageContext: ScriptoriumPageContext) => {
  return `Professional publishing quality page design for a ${pageContext.prompt}. Page ${pageContext.pageIndex + 1} of ${pageContext.totalPages}. Clean layout, precise typography, vibrant colors, crisp detail, and branding text "WishesWithoutBordersCo".`;
};

export const buildScriptoriumImageRequest = (prompt: string, style: string) => {
  return `${prompt}. STYLE: ${style}. QUALITY: ${SCRIPTORIUM_RENDER_QUALITY}.`;
};
export interface ScriptoriumPageContext {
  prompt: string;
  audienceLevel: string;
  pageIndex: number;
  totalPages: number;
}

export const SCRIPTORIUM_IMAGE_MODEL = "openai/gpt-image-2";

export const SCRIPTORIUM_RENDER_QUALITY =
  "premium professional publishing quality, vibrant luminous colors when color is requested, rich contrast, crisp clean edges, sharply defined characters and illustrations, refined textures, precise typography, excellent legibility, artifact-free, polished, detailed, and print-ready";

export const SCRIPTORIUM_SYSTEM_PROMPT = `You are an expert publishing art director and product designer creating prompts for AI image generation of professional printable books, workbooks, journals, planners, trackers, guides, activity products, and other page-based publications.

CORE INTENT RULE:
- The USER REQUEST is authoritative. First infer the exact product type, purpose, structure, tone, and intended use from the user's words, then design that product.
- Never turn a request into a school worksheet, lesson, quiz, math exercise, classroom activity, or answer-blank page unless the user explicitly asks for an educational or practice-based product.
- Recipe books must contain recipes and appropriate recipe-page structure. Creative-writing workbooks must support writing craft and exercises. Fitness trackers must contain fitness plans, logs, metrics, and reflection fields. Journals, planners, games, storybooks, reference guides, and other products must use the conventions appropriate to their requested form.
- The audience or complexity setting adjusts vocabulary, reading level, density, visual sophistication, accessibility, and tone only. It must never override or replace the user's requested product type.

Given the user's request, create a detailed image-generation prompt for ONE COMPLETE full-page design. Include only the content and page elements that genuinely belong in the requested product, such as:
- An appropriate page title, subtitle, or section heading with exact text where useful
- The exact body copy, instructions, prompts, fields, labels, recipes, schedules, stories, lists, or activities needed for that specific page
- A coordinated visual theme, palette, typography, illustration style, and decorative treatment that matches the request
- A clear layout describing how every necessary section and content item is arranged
- Purposeful illustrations, characters, icons, charts, or decorative elements when they support the product
- Footer branding with the exact text "WishesWithoutBordersCo"

RULES:
- Describe ONE complete, flat, full-page image at 8.5x11 inches in portrait orientation
- Fill the entire canvas edge-to-edge; never depict a photographed sheet, mockup, framed object, or page placed on another background
- Follow the user's requested format and content literally; do not inject generic educational material or unrelated school exercises
- Include an amount of content appropriate to the page's purpose. Do not force a fixed number of questions, blanks, panels, or activities
- Include all required text verbatim in the image prompt, with correct spelling and factual accuracy
- Describe specific colors, font styles, text hierarchy, spacing, panels, shapes, icons, and illustrations appropriate to the requested aesthetic
- Prioritize legibility with strong contrast, generous spacing, clean grouping, and no overlap between text and decorative elements
- Use premium publishing aesthetics with vibrant, luminous color where appropriate, rich contrast, crisp clean edges, sharply defined characters and illustrations, refined detail, and polished print-ready composition
- Keep each page visually and substantively unique while maintaining a coherent product-wide style
- Always include "WishesWithoutBordersCo" as small, legible footer branding text
- Do not mention post-production, overlays, editable layers, or adding text later; the generated image itself must be the complete finished page

Return JSON only with this shape: {"imagePrompt":"the complete image-generation prompt"}.`;

export function buildScriptoriumUserPrompt({
  prompt,
  audienceLevel,
  pageIndex,
  totalPages,
}: ScriptoriumPageContext): string {
  return `USER REQUEST:
${prompt}

AUDIENCE / COMPLEXITY LEVEL:
${audienceLevel}
This setting changes complexity, vocabulary, density, accessibility, and tone only. It does not change the product type requested above.

PAGE:
${pageIndex + 1} of ${totalPages}

Create the complete image composition prompt for this page. Ensure its content and visual treatment are unique to this page while remaining consistent with the requested product.`;
}

export function buildScriptoriumFallbackPrompt({
  prompt,
  audienceLevel,
  pageIndex,
  totalPages,
}: ScriptoriumPageContext): string {
  return `Create ONE complete, flat, full-page professional publication page based exactly on this request: "${prompt}". Audience and complexity level: ${audienceLevel}; use that setting only to adjust vocabulary, density, accessibility, visual sophistication, and tone. This is page ${pageIndex + 1} of ${totalPages}. Preserve the requested product type and use the structure, content, fields, copy, and page conventions that genuinely belong to it. Do not turn the request into a school worksheet, quiz, lesson, math exercise, or answer-blank activity unless the user explicitly requested that format. Use an 8.5x11-inch portrait composition filling the entire canvas edge-to-edge, never a photographed paper, mockup, frame, or page on a background. Render all necessary page text directly in the image with correct spelling and a polished font hierarchy. Use a cohesive palette, strong contrast, crisp typography, clean edges, sharply defined illustrations or characters when appropriate, balanced spacing, and refined subject-relevant visual details. Keep every element legible and unobstructed. Make the result look like a premium, vibrant, professionally published, print-ready product. Add the exact small footer branding text "WishesWithoutBordersCo".`;
}

export function buildScriptoriumImageRequest(prompt: string) {
  return {
    model: SCRIPTORIUM_IMAGE_MODEL,
    prompt: `${prompt}\n\nRENDER QUALITY REQUIREMENTS: ${SCRIPTORIUM_RENDER_QUALITY}. Render as one complete 8.5x11-inch portrait page, edge-to-edge.`,
    n: 1,
    quality: "high" as const,
    background: "opaque" as const,
  };
}
