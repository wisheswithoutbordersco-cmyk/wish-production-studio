import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  addKdpInteriorBleed,
  getKdpInteriorBleedGeometry,
  isKdpPageSide,
} from "./kdp";

describe("KDP single-page print geometry", () => {
  it("creates 8.5×6 landscape output at trim plus the required bleed", () => {
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
    expect(geometry.topBleedPixels).toBe(37);
    expect(geometry.bottomBleedPixels).toBe(38);
  });

  it("recognizes the two page-side choices for outside bleed", () => {
    expect(isKdpPageSide("right")).toBe(true);
    expect(isKdpPageSide("left")).toBe(true);
    expect(isKdpPageSide("center")).toBe(false);
    expect(isKdpPageSide(undefined)).toBe(false);
  });

  it("preserves a full page image and changes only the outside-bleed placement", async () => {
    const redLeftHalf = await sharp({
      create: {
        width: 1275,
        height: 1800,
        channels: 3,
        background: { r: 220, g: 35, b: 30 },
      },
    })
      .png()
      .toBuffer();
    const trimImage = await sharp(redLeftHalf)
      .extend({
        top: 0,
        bottom: 0,
        left: 0,
        right: 1275,
        background: { r: 25, g: 90, b: 220 },
      })
      .png()
      .toBuffer();

    const rightPage = await addKdpInteriorBleed(
      trimImage,
      "8.5x6-landscape",
      "right"
    );
    const leftPage = await addKdpInteriorBleed(
      trimImage,
      "8.5x6-landscape",
      "left"
    );
    const rightMetadata = await sharp(rightPage).metadata();
    const leftMetadata = await sharp(leftPage).metadata();

    expect([rightMetadata.width, rightMetadata.height]).toEqual([2588, 1875]);
    expect([leftMetadata.width, leftMetadata.height]).toEqual([2588, 1875]);
    expect(Buffer.compare(rightPage, leftPage)).not.toBe(0);
  });
});
