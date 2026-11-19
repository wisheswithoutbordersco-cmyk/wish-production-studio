import sharp from "sharp";

export const KDP_DPI = 300;
export const KDP_BLEED_INCHES = 0.125;

export const KDP_TRIM_SIZES = {
  "6x9": { label: "6 × 9 in · Portrait", widthInches: 6, heightInches: 9 },
  "8.5x11": {
    label: "8.5 × 11 in · Portrait",
    widthInches: 8.5,
    heightInches: 11,
  },
  "8.5x8.5": {
    label: "8.5 × 8.5 in · Square",
    widthInches: 8.5,
    heightInches: 8.5,
  },
  "8.5x6-landscape": {
    label: "8.5 × 6 in · Landscape",
    widthInches: 8.5,
    heightInches: 6,
  },
} as const;

export type KdpTrimPreset = keyof typeof KDP_TRIM_SIZES;
export type KdpPageSide = "right" | "left";

export interface KdpInteriorBleedGeometry {
  widthInches: number;
  heightInches: number;
  widthPoints: number;
  heightPoints: number;
  trimWidthPixels: number;
  trimHeightPixels: number;
  pageWidthPixels: number;
  pageHeightPixels: number;
  outsideBleedPixels: number;
  topBleedPixels: number;
  bottomBleedPixels: number;
}

export function isKdpTrimPreset(value: unknown): value is KdpTrimPreset {
  return typeof value === "string" && Object.hasOwn(KDP_TRIM_SIZES, value);
}

export function isKdpPageSide(value: unknown): value is KdpPageSide {
  return value === "right" || value === "left";
}

export function getKdpInteriorBleedGeometry(
  trimPreset: KdpTrimPreset
): KdpInteriorBleedGeometry {
  const trim = KDP_TRIM_SIZES[trimPreset];
  const widthInches = trim.widthInches + KDP_BLEED_INCHES;
  const heightInches = trim.heightInches + KDP_BLEED_INCHES * 2;
  const trimWidthPixels = Math.round(trim.widthInches * KDP_DPI);
  const trimHeightPixels = Math.round(trim.heightInches * KDP_DPI);
  const pageWidthPixels = Math.round(widthInches * KDP_DPI);
  const pageHeightPixels = Math.round(heightInches * KDP_DPI);
  const topBleedPixels = Math.floor(KDP_BLEED_INCHES * KDP_DPI);
  const bottomBleedPixels = pageHeightPixels - trimHeightPixels - topBleedPixels;

  return {
    widthInches,
    heightInches,
    widthPoints: widthInches * 72,
    heightPoints: heightInches * 72,
    trimWidthPixels,
    trimHeightPixels,
    pageWidthPixels,
    pageHeightPixels,
    outsideBleedPixels: pageWidthPixels - trimWidthPixels,
    topBleedPixels,
    bottomBleedPixels,
  };
}

/**
 * Extend one generated page to KDP's interior bleed size. The artwork stays
 * completely inside the trim area; blurred edge color fills the top, bottom,
 * and selected outside edge. Choose the right side for odd pages and the left
 * side for even pages when assembling the book in Canva.
 */
export async function addKdpInteriorBleed(
  imageBuffer: Buffer,
  trimPreset: KdpTrimPreset,
  pageSide: KdpPageSide
): Promise<Buffer> {
  const geometry = getKdpInteriorBleedGeometry(trimPreset);
  const leftOutsideBleed = pageSide === "left";
  const foregroundLeft = leftOutsideBleed ? geometry.outsideBleedPixels : 0;
  const blurSigma = Math.max(8, Math.round(KDP_DPI * KDP_BLEED_INCHES * 0.55));

  const [background, foreground] = await Promise.all([
    sharp(imageBuffer)
      .flatten({ background: "#ffffff" })
      .resize(geometry.pageWidthPixels, geometry.pageHeightPixels, {
        fit: "cover",
        position: "centre",
        kernel: sharp.kernel.lanczos3,
      })
      .blur(blurSigma)
      .png()
      .toBuffer(),
    sharp(imageBuffer)
      .resize(geometry.trimWidthPixels, geometry.trimHeightPixels, {
        fit: "fill",
        kernel: sharp.kernel.lanczos3,
      })
      .png()
      .toBuffer(),
  ]);

  return sharp(background)
    .composite([
      {
        input: foreground,
        left: foregroundLeft,
        top: geometry.topBleedPixels,
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}
