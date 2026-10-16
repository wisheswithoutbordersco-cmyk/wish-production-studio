import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  QUICK_CREATE_REFERENCE_ENHANCEMENT_PROMPT,
  SCRIPTORIUM_IMAGE_FALLBACK_MODEL,
  SCRIPTORIUM_IMAGE_MODEL,
  buildColoringPagePrompt,
  buildScriptoriumFallbackPrompt,
  buildScriptoriumImageEditFormData,
  buildScriptoriumImageRequest,
  buildReferenceImageInstructions,
  generateCompositionImage,
  getScriptoriumSystemPrompt,
  isColoringOutputStyle,
  isGenericReferenceEnhancementPrompt,
  normalizeQuickCreateOptions,
} from "./generators/quickCreate";

const source = readFileSync(
  fileURLToPath(new URL("./generators/quickCreate.ts", import.meta.url)),
  "utf8"
);
const clientSource = readFileSync(
  fileURLToPath(
    new URL("../client/src/pages/QuickCreateGenerator.tsx", import.meta.url)
  ),
  "utf8"
);

const testReference = {
  data: "AQID",
  mimeType: "image/jpeg" as const,
  role: "overall" as const,
};

describe("Scriptorium Quick Create", () => {
  it("uses the selected output style rather than prompt keywords to choose coloring routing", () => {
    expect(isColoringOutputStyle("full-color")).toBe(false);
    expect(isColoringOutputStyle("coloring")).toBe(true);
    expect(isColoringOutputStyle("reference-coloring")).toBe(true);
    expect(source).not.toContain("isColoringRequest");
  });

  it("turns a vague one-image prompt into the canonical preservation-first enhancement", () => {
    expect(isGenericReferenceEnhancementPrompt("Polish this picture up.")).toBe(
      true
    );
    expect(isGenericReferenceEnhancementPrompt("Make it look better")).toBe(
      true
    );
    expect(
      isGenericReferenceEnhancementPrompt(
        "Polish this picture up and make the background blue"
      )
    ).toBe(false);

    const normalized = normalizeQuickCreateOptions({
      customPrompt: "Polish this picture up.",
      pageCount: 1,
      expectedReferenceImageCount: 1,
      referenceImages: [testReference],
    });

    expect(normalized.referenceEnhancement).toBe(true);
    expect(normalized.prompt).toContain("Polish this picture up.");
    expect(normalized.prompt).toContain(
      "Recreate this exact image, same subject and pose, enhanced detail and lighting."
    );
    expect(normalized.prompt).toContain("Keep the original subject identity");
    expect(normalized.prompt).toContain("composition, object placement");
    expect(normalized.prompt).toContain(
      "Do not add, remove, replace, rearrange"
    );
    expect(source).toMatch(
      /if \(options\.referenceEnhancement\) \{\s*return \{\s*pageType: "text-heavy",\s*imagePrompt: options\.prompt/s
    );

    const specific = normalizeQuickCreateOptions({
      customPrompt: "Polish this picture up and make the background blue.",
      pageCount: 1,
      expectedReferenceImageCount: 1,
      referenceImages: [testReference],
    });
    expect(specific.referenceEnhancement).toBe(false);
    expect(specific.prompt).toBe(
      "Polish this picture up and make the background blue."
    );
  });

  it("fails closed if the client says an image was uploaded but its payload is absent", () => {
    expect(() =>
      normalizeQuickCreateOptions({
        customPrompt: "Polish this picture up.",
        pageCount: 1,
        expectedReferenceImageCount: 1,
        referenceImages: [],
      })
    ).toThrow(/Reference image upload is incomplete/);
    expect(clientSource).toMatch(
      /expectedReferenceImageCount:\s*referenceImages\.length/
    );
    expect(clientSource).toMatch(/if \(referenceUploadFailed\) return;/);
    expect(clientSource).toContain("referenceUploadFailed ||");
  });

  it("includes every uploaded image on every mocked edit request and logs only count and hashes", async () => {
    const requests: Array<{ url: string; form: FormData }> = [];
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        if (!(init?.body instanceof FormData)) {
          throw new Error("Expected a multipart image-edit request");
        }
        requests.push({ url: String(input), form: init.body });
        return new Response(
          JSON.stringify({ data: [{ b64_json: "bW9jay1pbWFnZQ==" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      });
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    let logPayloads: unknown[] = [];

    try {
      // Each call represents a page request in a multi-page reference job.
      await generateCompositionImage(
        "Enhance the attached reference",
        [testReference],
        1,
        true
      );
      await generateCompositionImage(
        "Enhance the attached reference",
        [testReference],
        1,
        true
      );
      logPayloads = infoSpy.mock.calls.map(([, payload]) => payload);
    } finally {
      fetchSpy.mockRestore();
      infoSpy.mockRestore();
    }

    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.url).toBe("https://api.openai.com/v1/images/edits");
      expect(request.form.get("size")).toBe("auto");
      const images = request.form.getAll("image[]");
      expect(images).toHaveLength(1);
      expect((images[0] as Blob).type).toBe("image/jpeg");
      expect(Buffer.from(await (images[0] as Blob).arrayBuffer())).toEqual(
        Buffer.from(testReference.data, "base64")
      );
    }

    expect(logPayloads).toHaveLength(2);
    for (const payload of logPayloads) {
      expect(payload).toEqual(
        expect.objectContaining({
          referenceCount: 1,
          referenceHashes: [expect.stringMatching(/^[a-f0-9]{16}$/)],
        })
      );
    }
    const serializedLogs = JSON.stringify(logPayloads);
    expect(serializedLogs).not.toContain(testReference.data);
    expect(serializedLogs).not.toContain("https://");
  });

  it("does not downgrade a missing or failed reference edit to text-only generation", async () => {
    const requests: Array<{ url: string; form: FormData }> = [];
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        if (!(init?.body instanceof FormData)) {
          throw new Error("Unexpected non-edit request");
        }
        requests.push({ url: String(input), form: init.body });
        return new Response("mock provider failure", { status: 503 });
      });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.useFakeTimers();

    try {
      await expect(generateCompositionImage("Enhance", [], 1)).rejects.toThrow(
        /Reference image upload is incomplete/
      );

      const failedEdit = expect(
        generateCompositionImage("Enhance", [testReference], 1)
      ).rejects.toThrow(/image generation failed \(503\)/i);
      await vi.runAllTimersAsync();
      await failedEdit;
    } finally {
      vi.useRealTimers();
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      infoSpy.mockRestore();
    }

    expect(requests).toHaveLength(6);
    expect(requests.every(({ url }) => url.endsWith("/images/edits"))).toBe(
      true
    );
    expect(
      requests.some(({ url }) => url.endsWith("/images/generations"))
    ).toBe(false);
    expect(
      requests.every(({ form }) => form.getAll("image[]").length === 1)
    ).toBe(true);
  });

  it("builds source-preserving instructions for photo-to-coloring conversion", () => {
    const prompt = buildColoringPagePrompt({
      prompt: "8.5x11, no shading",
      sizeLabel: "8.5×11 portrait",
      pageIndex: 0,
      totalPages: 1,
      preserveReference: true,
    });

    expect(prompt).toContain("source image itself");
    expect(prompt).toContain("not as inspiration for a new scene");
    expect(prompt).toContain("Preserve the same subject identity");
    expect(prompt).toContain("Do not add, remove, rearrange, or invent");

    const sourceInstructions = buildReferenceImageInstructions([
      { data: "AQID", mimeType: "image/jpeg", role: "source-image" },
    ]);
    expect(sourceInstructions).toContain("exact source artwork to convert");
  });

  it("uses the GPT image pipeline for coloring output, with or without a reference", () => {
    expect(source).toMatch(
      /const rawBuffer = await generateCompositionImage\(\s*coloringPrompt,\s*referenceImages,\s*expectedReferenceImageCount\s*\);/
    );
    expect(source).not.toContain("fal.ai coloring-page generation failed");
    expect(source).toContain("COLORING_LINE_THRESHOLD = 180");
  });

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
    expect(form.get("size")).toBe("1024x1536");
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
    expect(QUICK_CREATE_REFERENCE_ENHANCEMENT_PROMPT).toBe(
      "Recreate this exact image, same subject and pose, enhanced detail and lighting."
    );
  });

  it("uses the requested branding mode in the art-director system prompt", () => {
    expect(getScriptoriumSystemPrompt("none")).not.toContain("Footer branding");
    expect(getScriptoriumSystemPrompt("LaneDigitalWorks")).toContain(
      'Footer branding with the exact text "LaneDigitalWorks"'
    );
  });
});
