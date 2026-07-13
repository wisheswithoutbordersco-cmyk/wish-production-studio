import { describe, expect, it } from "vitest";
import {
  SCRIPTORIUM_IMAGE_MODEL,
  SCRIPTORIUM_SYSTEM_PROMPT,
  buildScriptoriumFallbackPrompt,
  buildScriptoriumImageRequest,
  buildScriptoriumUserPROMPT,
} from "./scriptoriumPolicy";

describe("Scriptorium intent policy", () => {
  it("makes the user's requested product authoritative instead of defaulting to school worksheets", () => {
    expect(SCRIPTORIUM_SYSTEM_PROMPT).toContain(
      "The USER PROMPT is authoritative"
    );
    expect(SCRIPTORIUM_SYSTEM_PROMPT).toContain(
      "Never turn a request into a school worksheet"
    );
    expect(SCRIPTORIUM_SYSTEM_PROMPT).toContain(
      "Audience, complexity, and tone must be inferred DIRECTLY"
    );
    expect(SCRIPTORIUM_SYSTEM_PROMPT).not.toContain(
      "The audience or complexity setting adjusts"
    );
  });

  it.each([
    "A Mediterranean recipe book for adults",
    "A creative-writing workbook for adult mystery authors",
    "A 30-day strength and mobility fitness tracker",
  ])("passes a request through unchanged: %s", (prompt) => {
    const result = buildScriptoriumUserPROMPT({
      prompt,
      pageIndex: 1,
      totalPages: 8,
    });
    expect(result).toContain(prompt);
    expect(result).toContain("PAGE 2 of 8");
    expect(result).not.toContain("AUDIENCE / COMPLEXITY LEVEL");
  });

  it("keeps the fallback intent-responsive when composition planning fails", () => {
    const result = buildScriptoriumFallbackPrompt({
      prompt: "An illustrated vegan dessert recipe book",
      pageIndex: 0,
      totalPages: 5,
    });
    expect(result).toContain("An illustrated vegan dessert recipe book");
    expect(result).toContain("PAGE 1 of 5");
    expect(result).not.toContain("Audience");
  });
});

describe("Scriptorium image quality policy", () => {
  it("uses the full dedicated model and maximum supported quality controls", () => {
    const request = buildScriptoriumImageRequest("A vivid recipe page", "Mediterranean");
    expect(SCRIPTORIUM_IMAGE_MODEL).toBe("penai/gpt-5-image");
    expect(request).toContain("A vivid recipe page");
    expect(request).toContain("STYLE: Mediterranean");
    expect(request).toContain("bold saturated vivid colors");
    expect(request).toContain("ABOLUTELY NO muted beige");
  });
});
import { describe, expect, it } from "vitest";
import {
  SCRIPTORIUM_IMAGE_MODEL,
  SCRIPTORIUM_SYSTEM_PROMPT,
  buildScriptoriumFallbackPrompt,
  buildScriptoriumImageRequest,
  buildScriptoriumUserPrompt,
} from "./scriptoriumPolicy";

describe("Scriptorium intent policy", () => {
  it("makes the user's requested product authoritative instead of defaulting to school worksheets", () => {
    expect(SCRIPTORIUM_SYSTEM_PROMPT).toContain(
      "The USER REQUEST is authoritative"
    );
    expect(SCRIPTORIUM_SYSTEM_PROMPT).toContain(
      "Never turn a request into a school worksheet"
    );
    expect(SCRIPTORIUM_SYSTEM_PROMPT).toContain(
      "The audience or complexity setting adjusts vocabulary"
    );
    expect(SCRIPTORIUM_SYSTEM_PROMPT).not.toContain(
      "Include 5-8 substantive content items per page"
    );
  });

  it.each([
    "A Mediterranean recipe book for adults",
    "A creative-writing workbook for adult mystery authors",
    "A 30-day strength and mobility fitness tracker",
  ])("passes a non-educational request through unchanged: %s", prompt => {
    const result = buildScriptoriumUserPrompt({
      prompt,
      audienceLevel: "Adult",
      pageIndex: 1,
      totalPages: 8,
    });

    expect(result).toContain(prompt);
    expect(result).toContain("AUDIENCE / COMPLEXITY LEVEL:\nAdult");
    expect(result).toContain(
      "It does not change the product type requested above"
    );
    expect(result).toContain("2 of 8");
  });

  it("keeps the fallback intent-responsive when composition planning fails", () => {
    const result = buildScriptoriumFallbackPrompt({
      prompt: "An illustrated vegan dessert recipe book",
      audienceLevel: "Adult",
      pageIndex: 0,
      totalPages: 5,
    });

    expect(result).toContain("An illustrated vegan dessert recipe book");
    expect(result).toContain("Preserve the requested product type");
    expect(result).toContain("Do not turn the request into a school worksheet");
    expect(result).not.toContain("5-8 substantive");
  });
});

describe("Scriptorium image quality policy", () => {
  it("uses the full dedicated model and maximum supported quality controls", () => {
    const request = buildScriptoriumImageRequest("A vivid recipe page");

    expect(SCRIPTORIUM_IMAGE_MODEL).toBe("openai/gpt-image-2");
    expect(request).toMatchObject({
      model: "openai/gpt-image-2",
      n: 1,
      quality: "high",
      background: "opaque",
    });
    expect(request.prompt).toContain("vibrant luminous colors");
    expect(request.prompt).toContain("crisp clean edges");
    expect(request.prompt).toContain(
      "sharply defined characters and illustrations"
    );
    expect(request).not.toHaveProperty("aspect_ratio");
  });
});
