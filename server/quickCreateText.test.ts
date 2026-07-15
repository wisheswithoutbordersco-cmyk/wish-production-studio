import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SCRIPTORIUM_CONTENT_MODEL,
  SCRIPTORIUM_IMAGE_MODEL,
  SCRIPTORIUM_WATERMARK,
  buildScriptoriumBakedTextPrompt,
  buildScriptoriumImageRequest,
  type ScriptoriumPagePlan,
} from "./generators/quickCreate";

const readSiblingSource = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

describe("Quick Create complete AI poster rendering", () => {
  it("uses GPT-4o for content planning and Flux Pro v1.1 Ultra for images", () => {
    expect(SCRIPTORIUM_CONTENT_MODEL).toBe("openai/gpt-4o");
    expect(SCRIPTORIUM_IMAGE_MODEL).toBe("fal-ai/flux-pro/v1.1-ultra");
  });

  it("places exact titles, facts, descriptions, and watermark in the Flux prompt", () => {
    const plan: ScriptoriumPagePlan = {
      title: "10 Ocean Superpowers",
      subtitle: "Amazing adaptations beneath the waves",
      sections: [
        {
          heading: "Three Hearts",
          body: "Octopuses have three hearts and blue blood.",
        },
        {
          heading: "Fish & Coral",
          body: "Clownfish shelter safely among sea anemone tentacles.",
        },
      ],
      footerNote: "OCEAN-TRACE-9472",
      imagePrompt:
        "Professional educational infographic poster with two illustrated ocean creature cards and vivid neon reef decorations.",
    };

    const prompt = buildScriptoriumBakedTextPrompt(plan, {
      prompt: "Create an ocean infographic",
      pageIndex: 0,
      totalPages: 1,
    });

    expect(prompt).toContain('TITLE: "10 Ocean Superpowers"');
    expect(prompt).toContain('SECTION 1 HEADING: "Three Hearts"');
    expect(prompt).toContain(
      'SECTION 1 BODY: "Octopuses have three hearts and blue blood."'
    );
    expect(prompt).toContain('SECTION 2 HEADING: "Fish & Coral"');
    expect(prompt).toContain('FOOTER NOTE: "OCEAN-TRACE-9472"');
    expect(prompt).toContain(`WATERMARK: "${SCRIPTORIUM_WATERMARK}"`);
    expect(prompt).toContain("Render every line in the mandatory text manifest directly inside the artwork");
    expect(prompt).not.toContain("text-free background");
  });

  it("builds a single 3:4 Flux request with baked-in typography", () => {
    const request = buildScriptoriumImageRequest(
      'Large title text at top reading exactly "Deep Sea Marvels".'
    );

    expect(request.model).toBe("fal-ai/flux-pro/v1.1-ultra");
    expect(request.aspectRatio).toBe("3:4");
    expect(request.prompt).toContain("Deep Sea Marvels");
    expect(request.prompt).toContain("baked directly into the illustration");
    expect(request.prompt).toContain(SCRIPTORIUM_WATERMARK);
    expect(request.prompt).not.toContain("Do not render any visible words");
  });

  it("contains no Sharp/SVG text-compositing path", () => {
    const source = readSiblingSource("./generators/quickCreate.ts");

    expect(source).not.toContain("quickCreateTextOverlay");
    expect(source).not.toContain("buildQuickCreateTextOverlaySvg");
    expect(source).not.toContain(".composite(");
    expect(source).toContain('textRenderer:\n        composition.pageType === "complete-poster"');
    expect(source).toContain('"flux-pro-ultra-baked-in"');
    expect(source).toContain("finalizePdf(updatedJob, { addPdfBranding: false })");
  });

  it("sends only supported Flux Pro Ultra sizing parameters", () => {
    const source = readSiblingSource("./_core/imageGeneration.ts");

    expect(source).toContain('aspect_ratio: options.aspectRatio || "1:1"');
    expect(source).not.toContain("num_inference_steps");
    expect(source).not.toContain("guidance_scale");
    expect(source).not.toContain("image_size");
  });
});
