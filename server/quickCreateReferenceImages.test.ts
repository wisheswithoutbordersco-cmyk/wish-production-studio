import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildProcessStepReferenceList,
  buildReferenceImageInstructions,
  buildScriptoriumFallbackPrompt,
  buildScriptoriumImageEditFormData,
  buildScriptoriumUserPrompt,
  normalizeQuickCreateOptions,
  SCRIPTORIUM_IMAGE_MODEL,
  type QuickCreateOptions,
  type QuickCreateReferenceImage,
} from "./generators/quickCreate";

const quickCreateUi = readFileSync(
  fileURLToPath(
    new URL("../client/src/pages/QuickCreateGenerator.tsx", import.meta.url)
  ),
  "utf8"
);

function reference(
  number: number,
  data = "AQID",
  stepDescription = `Step ${number} instruction`
): QuickCreateReferenceImage {
  return {
    data,
    mimeType: "image/jpeg",
    role: "overall",
    stepDescription,
  };
}

function options(
  referenceImages: QuickCreateReferenceImage[],
  overrides: Partial<QuickCreateOptions> = {}
): QuickCreateOptions {
  return {
    customPrompt: "Create an ordered warehouse process diagram",
    pageCount: 5,
    referenceImages,
    referenceMappingMode: "process-steps",
    ...overrides,
  };
}

describe("Quick Create six-image ordered process references", () => {
  it("accepts each active count from one through six and forces one diagram page", () => {
    for (let count = 1; count <= 6; count++) {
      const normalized = normalizeQuickCreateOptions(
        options(
          Array.from({ length: count }, (_, index) => reference(index + 1))
        )
      );
      expect(normalized.referenceImages).toHaveLength(count);
      expect(normalized.pageCount).toBe(1);
      expect(normalized.referenceMappingMode).toBe("process-steps");
    }
  });

  it.each([7, 8])(
    "rejects %i references at the server during the six-image rollout",
    count => {
      expect(() =>
        normalizeQuickCreateOptions(
          options(
            Array.from({ length: count }, (_, index) => reference(index + 1))
          )
        )
      ).toThrow("Use no more than 6 reference images");
    }
  );

  it("requires at least one photo and a step description for every process photo", () => {
    expect(() => normalizeQuickCreateOptions(options([]))).toThrow(
      "Process-step mode requires at least one reference photo"
    );
    expect(() =>
      normalizeQuickCreateOptions(options([reference(1, "AQID", "   ")]))
    ).toThrow("Process-step photo 1 requires a step description");
    expect(() =>
      normalizeQuickCreateOptions(
        options([reference(1, "AQID", "x".repeat(201))])
      )
    ).toThrow("step description must be 200 characters or fewer");
  });

  it("allows six prepared photos above the old 16 MiB aggregate cap", () => {
    const threeMiB = Buffer.alloc(3 * 1024 * 1024).toString("base64");
    const normalized = normalizeQuickCreateOptions(
      options(
        Array.from({ length: 6 }, (_, index) => reference(index + 1, threeMiB))
      )
    );
    expect(normalized.referenceImages).toHaveLength(6);
  });

  it("rejects aggregate data above 28 MiB while retaining the five MiB per-file cap", () => {
    const fiveMiB = Buffer.alloc(5 * 1024 * 1024).toString("base64");
    expect(() =>
      normalizeQuickCreateOptions(
        options(
          Array.from({ length: 6 }, (_, index) => reference(index + 1, fiveMiB))
        )
      )
    ).toThrow("Reference images together must be 28 MiB or smaller");
  });

  it("numbers each description against its corresponding photo in both planner and edit prompts", () => {
    const references = [
      reference(1, "AQID", "Scan the receiving barcode"),
      reference(2, "BAUG", "Confirm the pallet identifier"),
      reference(3, "BwgJ", "Move the pallet to the marked lane"),
    ];
    const mapping = buildProcessStepReferenceList(references);
    expect(mapping).toContain('Photo 1 → Step 1: "Scan the receiving barcode"');
    expect(mapping).toContain(
      'Photo 2 → Step 2: "Confirm the pallet identifier"'
    );
    expect(mapping).toContain(
      'Photo 3 → Step 3: "Move the pallet to the marked lane"'
    );

    const plannerPrompt = buildScriptoriumUserPrompt({
      prompt: "Create a process diagram",
      pageIndex: 0,
      totalPages: 1,
      branding: "none",
      referenceMappingMode: "process-steps",
      referenceImages: references,
    });
    expect(plannerPrompt).toContain(
      "never omit, duplicate, merge, swap, or invent steps"
    );
    expect(plannerPrompt).toContain("Photo 2 → Step 2");

    const fallbackPrompt = buildScriptoriumFallbackPrompt({
      prompt: "Create a process diagram",
      pageIndex: 0,
      totalPages: 1,
      branding: "none",
      referenceMappingMode: "process-steps",
      referenceImages: references,
    });
    expect(fallbackPrompt).toContain("Photo 3 → Step 3");

    const form = buildScriptoriumImageEditFormData(
      "Create one ordered process diagram.",
      references,
      SCRIPTORIUM_IMAGE_MODEL,
      "1024x1536",
      "process-steps"
    );
    expect(form.get("prompt")).toContain(
      "Photo N is authoritative only for Step N"
    );
    expect(form.get("prompt")).toContain("barcode values");
    const files = form.getAll("image[]") as File[];
    expect(files.map(file => file.name)).toEqual([
      "reference-1.jpg",
      "reference-2.jpg",
      "reference-3.jpg",
    ]);
  });

  it("keeps the existing general-reference mode and role guidance unchanged by default", () => {
    const normalized = normalizeQuickCreateOptions({
      customPrompt: "Create a character page",
      pageCount: 5,
      referenceImages: [reference(1)],
    });
    expect(normalized.referenceMappingMode).toBe("guidance");
    expect(normalized.pageCount).toBe(5);

    const prompt = buildReferenceImageInstructions([
      { ...reference(1), role: "face-identity" },
    ]);
    expect(prompt).toContain("face/person identity reference");
    expect(prompt).not.toContain("ORDERED PROCESS-STEP PHOTO MAPPING");
  });

  it("keeps process diagrams out of generic reference-enhancement routing", () => {
    const normalized = normalizeQuickCreateOptions(
      options([reference(1)], { customPrompt: "Polish this picture up." })
    );
    expect(normalized.referenceEnhancement).toBe(false);
    expect(normalized.prompt).toBe("Polish this picture up.");
  });

  it("requires full-color output for numbered process steps", () => {
    expect(() =>
      normalizeQuickCreateOptions(
        options([reference(1)], { outputStyle: "coloring" })
      )
    ).toThrow("Process-step mode requires full-color output");
  });

  it("retains mobile-first layout and 44px keyboard/touch move and remove controls", () => {
    expect(quickCreateUi).toContain(
      'className="grid grid-cols-1 lg:grid-cols-2 gap-6"'
    );
    expect(quickCreateUi).toContain("grid-cols-[3.5rem_minmax(0,1fr)_3rem]");
    expect(quickCreateUi).toContain('className="h-11 w-11 shrink-0"');
    expect(quickCreateUi).toContain(
      "aria-label={`Move Photo ${index + 1} earlier`}"
    );
    expect(quickCreateUi).toContain(
      "aria-label={`Move Photo ${index + 1} later`}"
    );
    expect(quickCreateUi).toContain("aria-label={`Remove Photo ${index + 1}`}");
    expect(quickCreateUi).toContain('aria-live="polite"');
  });
});
