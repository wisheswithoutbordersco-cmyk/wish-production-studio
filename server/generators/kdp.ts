import sharp from "sharp";
import { assemblePdf } from "../pdfAssembly";

export const KDP_DPI = 300;
export const KDP_BLEED_INCHES = 0.125;
export const KDP_MIN_PAPERBACK_PAGES = 24;

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

export const KDP_PAPER_TYPES = {
  "premium-color": {
    label: "Premium color · white paper",
    spineCoefficient: 0.002347,
  },
  "standard-color": {
    label: "Standard color · white paper",
    spineCoefficient: 0.002252,
  },
  "black-white-white": {
    label: "Black ink · white paper",
    spineCoefficient: 0.002252,
  },
  "black-white-cream": {
    label: "Black ink · cream paper",
    spineCoefficient: 0.0025,
  },
} as const;

export type KdpPaperType = keyof typeof KDP_PAPER_TYPES;

export interface KdpPaperbackCoverGeometry {
  widthInches: number;
  heightInches: number;
  spineWidthInches: number;
  trimWidthInches: number;
  trimHeightInches: number;
  widthPoints: number;
  heightPoints: number;
}

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

export function isKdpPaperType(value: unknown): value is KdpPaperType {
  return typeof value === "string" && Object.hasOwn(KDP_PAPER_TYPES, value);
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

export function getKdpPaperbackCoverGeometry(
  trimPreset: KdpTrimPreset,
  pageCount: number,
  paperType: KdpPaperType
): KdpPaperbackCoverGeometry {
  if (!Number.isInteger(pageCount) || pageCount < KDP_MIN_PAPERBACK_PAGES) {
    throw new Error(`KDP paperback interiors must have at least ${KDP_MIN_PAPERBACK_PAGES} pages`);
  }

  const trim = KDP_TRIM_SIZES[trimPreset];
  const paper = KDP_PAPER_TYPES[paperType];
  const spineWidthInches = pageCount * paper.spineCoefficient;
  const widthInches =
    KDP_BLEED_INCHES +
    trim.widthInches +
    spineWidthInches +
    trim.widthInches +
    KDP_BLEED_INCHES;
  const heightInches =
    KDP_BLEED_INCHES + trim.heightInches + KDP_BLEED_INCHES;

  return {
    widthInches,
    heightInches,
    spineWidthInches,
    trimWidthInches: trim.widthInches,
    trimHeightInches: trim.heightInches,
    widthPoints: widthInches * 72,
    heightPoints: heightInches * 72,
  };
}

/**
 * Extend a generated interior page to KDP's paperback bleed page dimensions.
 * The complete original page stays inside the trim area; only the outside bleed
 * edge alternates by manuscript page number. Blurred edge color fills bleed so
 * no part of the generated artwork needs to be cropped to make the page fit.
 */
export async function addKdpInteriorBleed(
  imageBuffer: Buffer,
  trimPreset: KdpTrimPreset,
  interiorPageNumber: number
): Promise<Buffer> {
  if (!Number.isInteger(interiorPageNumber) || interiorPageNumber < 1) {
    throw new Error("Interior page number must be a positive integer");
  }

  const geometry = getKdpInteriorBleedGeometry(trimPreset);
  const leftOutsideBleed = interiorPageNumber % 2 === 0;
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

/**
 * Make a single-page KDP paperback cover PDF with the first generated page as
 * the front panel. Back and spine stay blank; KDP can add its barcode. The cover
 * is a separate file from the interior manuscript, as required by KDP.
 */
export async function createKdpPaperbackCoverPdf(
  frontImage: Buffer,
  trimPreset: KdpTrimPreset,
  pageCount: number,
  paperType: KdpPaperType
): Promise<Buffer> {
  const geometry = getKdpPaperbackCoverGeometry(trimPreset, pageCount, paperType);
  const trim = KDP_TRIM_SIZES[trimPreset];
  const coverWidthPixels = Math.round(geometry.widthInches * KDP_DPI);
  const coverHeightPixels = Math.round(geometry.heightInches * KDP_DPI);
  const trimWidthPixels = Math.round(trim.widthInches * KDP_DPI);
  const trimHeightPixels = Math.round(trim.heightInches * KDP_DPI);
  const bleedPixels = Math.round(KDP_BLEED_INCHES * KDP_DPI);
  const topBleedPixels = Math.floor(KDP_BLEED_INCHES * KDP_DPI);
  const spinePixels = Math.round(geometry.spineWidthInches * KDP_DPI);
  const frontLeft =
    bleedPixels + trimWidthPixels + spinePixels;
  const frontWidth = coverWidthPixels - frontLeft;
  const blurSigma = Math.max(8, Math.round(KDP_DPI * KDP_BLEED_INCHES * 0.55));

  const [panelBackground, frontArtwork] = await Promise.all([
    sharp(frontImage)
      .flatten({ background: "#ffffff" })
      .resize(frontWidth, coverHeightPixels, {
        fit: "cover",
        position: "centre",
        kernel: sharp.kernel.lanczos3,
      })
      .blur(blurSigma)
      .png()
      .toBuffer(),
    sharp(frontImage)
      .resize(trimWidthPixels, trimHeightPixels, {
        fit: "fill",
        kernel: sharp.kernel.lanczos3,
      })
      .png()
      .toBuffer(),
  ]);

  const frontPanel = await sharp(panelBackground)
    .composite([
      {
        input: frontArtwork,
        left: 0,
        top: topBleedPixels,
      },
    ])
    .png()
    .toBuffer();

  const wraparoundImage = await sharp({
    create: {
      width: coverWidthPixels,
      height: coverHeightPixels,
      channels: 3,
      background: "#ffffff",
    },
  })
    .composite([{ input: frontPanel, left: frontLeft, top: 0 }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  return assemblePdf(
    [{ imageBuffer: wraparoundImage, addBranding: false }],
    "off",
    false,
    { width: geometry.widthPoints, height: geometry.heightPoints }
  );
}
