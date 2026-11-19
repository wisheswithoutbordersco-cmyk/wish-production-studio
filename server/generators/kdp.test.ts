import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { assemblePdf } from "../pdfAssembly";
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

  it("keeps PNG and PDF geometry correct for every supported trim size", async () => {
    const source = await sharp({
      create: {
        width: 40,
        height: 30,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toBuffer();

    for (const trimPreset of [
      "6x9",
      "8.5x11",
      "8.5x8.5",
      "8.5x6-landscape",
    ] as const) {
      const geometry = getKdpInteriorBleedGeometry(trimPreset);
      const png = await addKdpInteriorBleed(source, trimPreset, "right");
      const pngMetadata = await sharp(png).metadata();
      expect([pngMetadata.width, pngMetadata.height]).toEqual([
        geometry.pageWidthPixels,
        geometry.pageHeightPixels,
      ]);

      const pdf = await assemblePdf([{ imageBuffer: png }], "off", false, {
        width: geometry.widthPoints,
        height: geometry.heightPoints,
      });
      expect(pdf.toString("latin1")).toContain(
        `/MediaBox [0 0 ${geometry.widthPoints} ${geometry.heightPoints}]`
      );
    }
  });

  it("recognizes the two page-side choices for outside bleed", () => {
    expect(isKdpPageSide("right")).toBe(true);
    expect(isKdpPageSide("left")).toBe(true);
    expect(isKdpPageSide("center")).toBe(false);
    expect(isKdpPageSide(undefined)).toBe(false);
  });

  it("adds crisp copied-edge bleed outside the selected KDP trim", async () => {
    const redLeftHalf = await sharp({
      create: {
        width: 85,
        height: 120,
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
        right: 85,
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

    const pixelAt = (image: Buffer, x: number, y: number) =>
      sharp(image)
        .extract({ left: x, top: y, width: 1, height: 1 })
        .removeAlpha()
        .raw()
        .toBuffer();
    expect(
      Buffer.compare(
        await pixelAt(rightPage, 100, 0),
        await pixelAt(rightPage, 100, 37)
      )
    ).toBe(0);
    expect(
      Buffer.compare(
        await pixelAt(rightPage, 100, 1874),
        await pixelAt(rightPage, 100, 1836)
      )
    ).toBe(0);
    expect(
      Buffer.compare(
        await pixelAt(rightPage, 2587, 937),
        await pixelAt(rightPage, 2549, 937)
      )
    ).toBe(0);
    expect(
      Buffer.compare(
        await pixelAt(leftPage, 0, 937),
        await pixelAt(leftPage, 38, 937)
      )
    ).toBe(0);
    expect(Buffer.compare(rightPage, leftPage)).not.toBe(0);
  });

  it("preserves both outer subject edges when the generated ratio differs from trim", async () => {
    const width = 100;
    const height = 20;
    const pixels = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 3;
        const color =
          x < 12 ? [240, 20, 20] : x >= 88 ? [20, 30, 240] : [255, 255, 255];
        pixels.set(color, offset);
      }
    }
    const source = await sharp(pixels, {
      raw: { width, height, channels: 3 },
    })
      .png()
      .toBuffer();
    const page = await addKdpInteriorBleed(source, "8.5x6-landscape", "right");
    const pixelAt = (x: number, y: number) =>
      sharp(page)
        .extract({ left: x, top: y, width: 1, height: 1 })
        .removeAlpha()
        .raw()
        .toBuffer();
    const [leftSubjectEdge, rightSubjectEdge, whitePadding] = await Promise.all(
      [pixelAt(100, 937), pixelAt(2450, 937), pixelAt(1200, 100)]
    );

    expect(leftSubjectEdge[0]).toBeGreaterThan(leftSubjectEdge[2] * 3);
    expect(rightSubjectEdge[2]).toBeGreaterThan(rightSubjectEdge[0] * 3);
    expect(Array.from(whitePadding)).toEqual([255, 255, 255]);
  });
});
