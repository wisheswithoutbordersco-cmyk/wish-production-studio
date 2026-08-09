/**
 * Greeting Card Generator
 * Generates print-ready 5x7 greeting cards as PDF.
 * Uses tRPC mutation (single card, not chunked).
 */
import { generateImage } from "../_core/imageGeneration";
import { assemblePdf, fetchImageBuffer, PageContent, type BrandingOption, type PageSize } from "../pdfAssembly";
import { storagePut } from "../storage";

export interface CardOptions {
  occasion: string;
  style: string;
  message?: string;
  customDetails?: string;
  branding?: BrandingOption;
  showPageNumbers?: boolean;
  pageSize?: PageSize;
}

export interface CardFromImageOptions {
  imageUrl: string;
  message?: string;
  branding?: BrandingOption;
  showPageNumbers?: boolean;
  pageSize?: PageSize;
}

function buildCardPrompt(options: CardOptions): string {
  const parts = [
    "Template",
    `beautiful greeting card illustration for ${options.occasion}`,
    `art style: ${options.style}`,
    "warm inviting design suitable for a greeting card front",
  ];

  if (options.customDetails) {
    parts.push(options.customDetails);
  }

  parts.push("filling the entire canvas edge-to-edge with no borders, frames, shadows, or text of any kind");
  parts.push("absolutely no words, letters, numbers, or written text anywhere in the image");
  parts.push("vibrant colors, professional quality illustration");

  return parts.join(", ");
}

export async function generateCard(options: CardOptions): Promise<{ pdfUrl: string; imageUrls: string[] }> {
  // Generate the card front illustration
  const prompt = buildCardPrompt(options);
  const result = await generateImage({ prompt });
  if (!result.url) throw new Error("Image generation failed");

  const imageBuffer = await fetchImageBuffer(result.url);

  // Save the PNG to storage (Upgrade 3)
  const { url: pngUrl } = await storagePut(
    `products/cards/card-${options.occasion.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.png`,
    imageBuffer,
    "image/png"
  );

  // Build a 5x7 card PDF (front page with image, inside page with message)
  const pages: PageContent[] = [
    {
      imageBuffer,
      title: options.occasion,
      pageNumber: undefined, // No page number on cards
    },
  ];

  // If there's a message, add an inside page
  if (options.message) {
    pages.push({
      contentBlocks: [
        {
          text: options.message,
          x: 72,
          y: 300,
          width: 468,
          fontSize: 16,
          font: "normal",
          color: "#333333",
          align: "center" as const,
        },
      ],
      pageNumber: undefined,
    });
  }

  const pdfBuffer = await assemblePdf(pages, {
    branding: options.branding || "wishes",
    showPageNumbers: options.showPageNumbers !== false,
    pageSize: options.pageSize || "8.5x11-portrait",
  });
  const { url: pdfUrl } = await storagePut(
    `products/cards/card-${options.occasion.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.pdf`,
    pdfBuffer,
    "application/pdf"
  );

  // Upgrade 5: Save metadata JSON
  await storagePut(
    `products/cards/card-${options.occasion.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}-meta.json`,
    JSON.stringify({ prompt, timestamp: Date.now(), branding: options.branding || "wishes", pageSize: options.pageSize || "8.5x11-portrait" }),
    "application/json"
  );

  return { pdfUrl, imageUrls: [pngUrl] };
}

export async function generateCardFromImage(options: CardFromImageOptions): Promise<{ pdfUrl: string; imageUrls: string[] }> {
  const imageBuffer = await fetchImageBuffer(options.imageUrl);

  // Save the PNG to storage (Upgrade 3)
  const { url: pngUrl } = await storagePut(
    `products/cards/card-custom-${Date.now()}.png`,
    imageBuffer,
    "image/png"
  );

  const pages: PageContent[] = [
    {
      imageBuffer,
      pageNumber: undefined,
    },
  ];

  if (options.message) {
    pages.push({
      contentBlocks: [
        {
          text: options.message,
          x: 72,
          y: 300,
          width: 468,
          fontSize: 16,
          font: "normal",
          color: "#333333",
          align: "center" as const,
        },
      ],
      pageNumber: undefined,
    });
  }

  const pdfBuffer = await assemblePdf(pages, {
    branding: options.branding || "wishes",
    showPageNumbers: options.showPageNumbers !== false,
    pageSize: options.pageSize || "8.5x11-portrait",
  });
  const { url: pdfUrl } = await storagePut(
    `products/cards/card-custom-${Date.now()}.pdf`,
    pdfBuffer,
    "application/pdf"
  );

  return { pdfUrl, imageUrls: [pngUrl] };
}
