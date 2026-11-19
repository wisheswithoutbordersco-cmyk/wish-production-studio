import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  addKdpInteriorBleed,
  createKdpPaperbackCoverPdf,
  getKdpInteriorBleedGeometry,
  getKdpPaperbackCoverGeometry,
} from "./kdp";

describe("KDP paperback export geometry", () => {
  it("creates 8.5×6 landscape interior pages with paperback bleed dimensions", () => {
    const geometry = getKdpInteriorBleedGeometry("8.5x6-landscape");
    expect(geometry.widthInches).toBe(8.625);
    expect(geometry.heightInches).toBe(6.25);
    expect(geometry.widthPoints).toBe(621);
    expect(geometry.heightPoints).toBe(450);
    expect(geometry.trimWidthPixels).toBe(2550);
    expect(geometry.trimHeightPixels).toBe(1800);
    expect(geometry.pageWidthPixels).toBe(2588);
    expect(geometry.pageHeightPixels).toBe(1875);
    expect(geometry.outsideBleedPixels).toBe(38);
  });

  it("alternates the outside bleed edge while preserving the entire original trim image", async () => {
    const trimImage = await sharp({
      create: {
        width: 2550,
        height: 1800,
        channels: 3,
        background: { r: 25, g: 115, b: 220 },
      },
    })
      .png()
      .toBuffer();

    const oddPage = await addKdpInteriorBleed(
      trimImage,
      "8.5x6-landscape",
      1
    );
    const evenPage = await addKdpInteriorBleed(
      trimImage,
      "8.5x6-landscape",
      2
    );
    const oddMetadata = await sharp(oddPage).metadata();
    const evenMetadata = await sharp(evenPage).metadata();

    expect([oddMetadata.width, oddMetadata.height]).toEqual([2588, 1875]);
    expect([evenMetadata.width, evenMetadata.height]).toEqual([2588, 1875]);
  });

  it("calculates the wrap cover with matching trim, bleed, page-count spine, and paper stock", () => {
    const premium = getKdpPaperbackCoverGeometry(
      "8.5x6-landscape",
      24,
      "premium-color"
    );
    const standard = getKdpPaperbackCoverGeometry(
      "8.5x6-landscape",
      24,
      "standard-color"
    );

    expect(premium.spineWidthInches).toBeCloseTo(24 * 0.002347, 8);
    expect(premium.widthInches).toBeCloseTo(
      8.5 + 8.5 + premium.spineWidthInches + 0.25,
      8
    );
    expect(premium.heightInches).toBe(6.25);
    expect(standard.spineWidthInches).toBeCloseTo(24 * 0.002252, 8);
    expect(premium.spineWidthInches).toBeGreaterThan(standard.spineWidthInches);
  });

  it("builds a one-page cover PDF with the full-wrap MediaBox size", async () => {
    const frontImage = await sharp({
      create: {
        width: 2550,
        height: 1800,
        channels: 3,
        background: { r: 245, g: 70, b: 50 },
      },
    })
      .png()
      .toBuffer();
    const geometry = getKdpPaperbackCoverGeometry(
      "8.5x6-landscape",
      24,
      "premium-color"
    );

    const coverPdf = await createKdpPaperbackCoverPdf(
      frontImage,
      "8.5x6-landscape",
      24,
      "premium-color"
    );
    const pdfText = coverPdf.toString("latin1");
    const mediaBox = pdfText.match(/\/MediaBox\s+\[0 0 ([\d.]+) ([\d.]+)\]/);
    expect(mediaBox).not.toBeNull();
    expect(Number(mediaBox?.[1])).toBeCloseTo(geometry.widthPoints, 5);
    expect(Number(mediaBox?.[2])).toBeCloseTo(geometry.heightPoints, 5);
  });
});
