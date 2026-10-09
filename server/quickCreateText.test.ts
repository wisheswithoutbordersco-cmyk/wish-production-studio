import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SCRIPTORIUM_IMAGE_FALLBACK_MODEL,
  SCRIPTORIUM_IMAGE_MODEL,
  buildScriptoriumFallbackPrompt,
  buildScriptoriumImageEditFormData,
  buildScriptoriumImageRequest,
  buildReferenceImageInstructions,
  getScriptoriumSystemPrompt,
} from "./generators/quickCreate";

const source = readFileSync(
  fileURLToPath(new URL("./generators/quickCreate.ts", import.meta.url)),
  "utf8"
);

describe("Scriptorium Quick Create", () => {
  it("uses GPT Image 2.5 Sunburst for premium publishing images", () => {
    expect(SCRIPTORIUM_IMAGE_MODEL).toBe("gpt-image-2.5-sunburst");

    const request = buildScriptoriumImageRequest(
      "A polished ocean activity book page"
    );
    expect(request.model).toBe("gpt-image-2.5-sunburst");
    expect(request.quality).toBe("high");
    expect(request.background).toBe("opaque");
  });

  it("keeps GPT Image 2 as a one-step reliability fallback", () => {
    expect(SCRIPTORIUM_IMAGE_FALLBACK_MODEL).toBe("gpt-image-2");
    expect(source).toMatch(
      /const IMAGE_MODELS = \[\s*SCRIPTORIUM_IMAGE_MODEL,\s*SCRIPTORIUM_IMAGE_FALLBACK_MODEL,?\s*\]/
    );
    expect(source).toContain(
      "Scriptorium image model ${model} was unavailable"
    );
  });

  it("attaches multiple images with their intended guidance roles to an edit request", () => {
    const references = [
      {
        data: "AQID",
        mimeType: "image/jpeg" as const,
        role: "face-identity" as const,
      },
      {
        data: "BAUG",
        mimeType: "image/png" as const,
        role: "body-pose" as const,
      },
    ];

    const instructions = buildReferenceImageInstructions(references);
    expect(instructions).toContain("Reference image 1");
    expect(instructions).toContain("face/person identity");
    expect(instructions).toContain("body, clothing, or pose");

    const form = buildScriptoriumImageEditFormData(
      "Keep the face; use the second pose.",
      references,
      SCRIPTORIUM_IMAGE_MODEL
    );
    expect(form.get("model")).toBe(SCRIPTORIUM_IMAGE_MODEL);
    expect(form.get("prompt")).toContain(
      "Follow the user's explicit instructions"
    );
    expect(form.getAll("image[]")).toHaveLength(2);
    expect((form.getAll("image[]")[0] as File).type).toBe("image/jpeg");
    expect((form.getAll("image[]")[1] as File).name).toBe("reference-2.png");
  });

  it("preserves complete, text-bearing publication prompt requirements", () => {
    const prompt = buildScriptoriumFallbackPrompt({
      prompt: "Create an ocean infographic",
      pageIndex: 0,
      totalPages: 1,
      branding: "WishesWithoutBordersCo",
    });

    expect(prompt).toContain(
      "Render all necessary page text directly in the image"
    );
    expect(prompt).toContain("bold saturated vivid colors");
    expect(prompt).toContain('"WishesWithoutBordersCo"');
    expect(prompt).toContain("never a photographed paper");
  });

  it("uses the requested branding mode in the art-director system prompt", () => {
    expect(getScriptoriumSystemPrompt("none")).not.toContain("Footer branding");
    expect(getScriptoriumSystemPrompt("LaneDigitalWorks")).toContain(
      'Footer branding with the exact text "LaneDigitalWorks"'
    );
  });
});
