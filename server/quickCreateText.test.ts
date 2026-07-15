import { describe, expect, it } from "vitest";
import {
  SCRIPTORIUM_IMAGE_MODEL,
  buildScriptoriumImageRequest,
} from "./generators/quickCreate";
import { buildQuickCreateTextOverlaySvg } from "./generators/quickCreateTextOverlay";

describe("Quick Create text-safe rendering", () => {
  it("records Flux Pro v1.1 Ultra as the image model", () => {
    expect(SCRIPTORIUM_IMAGE_MODEL).toBe("fal-ai/flux-pro/v1.1-ultra");
  });

  it("asks the image model for artwork without visible typography", () => {
    const request = buildScriptoriumImageRequest(
      "Vivid coral reef artwork around calm central content areas"
    );

    expect(request.model).toBe("fal-ai/flux-pro/v1.1-ultra");
    expect(request.prompt).toContain("Do not render any visible words");
    expect(request.prompt).toContain("edge-to-edge");
  });

  it("preserves exact facts and branding in the SVG overlay", () => {
    const overlay = buildQuickCreateTextOverlaySvg({
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
    }).toString("utf8");

    expect(overlay).toContain("10 Ocean Superpowers");
    expect(overlay).toContain("Octopuses have three hearts and blue blood.");
    expect(overlay).toContain("Fish &amp; Coral");
    expect(overlay).toContain("OCEAN-TRACE-9472");
    expect(overlay).toContain("WishesWithoutBordersCo");
  });
});
