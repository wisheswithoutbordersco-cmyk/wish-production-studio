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
  const bottomBleedPixels =
    pageHeightPixels - trimHeightPixels - topBleedPixels;

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
 * Fit the complete page onto KDP trim without cropping, then add bleed outside
 * the trim by copying the fitted page's edge pixels. Choose the right side for
 * odd pages and the left side for even pages when assembling the book in Canva.
 */
export async function addKdpInteriorBleed(
  imageBuffer: Buffer,
  trimPreset: KdpTrimPreset,
  pageSide: KdpPageSide
): Promise<Buffer> {
  const geometry = getKdpInteriorBleedGeometry(trimPreset);
  const leftOutsideBleed = pageSide === "left";
  return sharp(imageBuffer)
    .resize(geometry.trimWidthPixels, geometry.trimHeightPixels, {
      fit: "contain",
      background: "#ffffff",
      kernel: sharp.kernel.lanczos3,
    })
    .extend({
      top: geometry.topBleedPixels,
      bottom: geometry.bottomBleedPixels,
      left: leftOutsideBleed ? geometry.outsideBleedPixels : 0,
      right: leftOutsideBleed ? 0 : geometry.outsideBleedPixels,
      extendWith: "copy",
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
