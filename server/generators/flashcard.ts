/**
 * Flashcard Generator
 * Generates bilingual flashcard sets with AI illustrations arranged in a 2x2 card grid.
 * Uses pdfAssembly's cards layout with cut lines and bilingual text overlays.
 * 
 * Flow:
 * 1. Generate bilingual translations via GPT
 * 2. Generate small illustrations for each card
 * 3. Arrange in 2x2 grid with text labels and cutting guides
 */
import { buildImagePrompt, generatePageImage, generateContent } from "./shared";
import { createJob, getJob, updateJob, addPageResult, type GenerationJob, type PageResult } from "../jobs";
import { assemblePdf, fetchImageBuffer, PageContent } from "../pdfAssembly";
import { storagePut } from "../storage";

export interface FlashcardOptions {
  subject: string;
  languages: string; // "English + Spanish" etc.
  style: string;
  cardsPerSet: number;
  cardSize: string;
}

const CARDS_PER_PAGE = 4; // 2x2 grid

// Card grid layout constants for 8.5x11 (612x792 pt)
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const CARD_MARGIN = 24;
const CARD_GAP = 12;
const CARD_WIDTH = (PAGE_WIDTH - 2 * CARD_MARGIN - CARD_GAP) / 2;
const CARD_HEIGHT = (PAGE_HEIGHT - 2 * CARD_MARGIN - CARD_GAP) / 2;

const SUBJECT_ITEMS: Record<string, string[]> = {
  "Alphabet": "A B C D E F G H I J K L M N O P Q R S T U V W X Y Z".split(" "),
  "Numbers": Array.from({ length: 20 }, (_, i) => String(i + 1)),
  "Colors": ["Red", "Blue", "Green", "Yellow", "Orange", "Purple", "Pink", "Brown", "Black", "White", "Gray", "Gold"],
  "Shapes": ["Circle", "Square", "Triangle", "Rectangle", "Star", "Heart", "Diamond", "Oval", "Pentagon", "Hexagon"],
  "Animals": ["Dog", "Cat", "Lion", "Elephant", "Giraffe", "Monkey", "Fish", "Bird", "Butterfly", "Turtle", "Rabbit", "Bear"],
  "Food": ["Apple", "Banana", "Bread", "Rice", "Milk", "Egg", "Chicken", "Fish", "Carrot", "Tomato", "Orange", "Grape"],
  "Body Parts": ["Head", "Hand", "Foot", "Eye", "Ear", "Nose", "Mouth", "Arm", "Leg", "Finger", "Knee", "Shoulder"],
  "Emotions": ["Happy", "Sad", "Angry", "Scared", "Surprised", "Tired", "Excited", "Calm", "Confused", "Proud", "Shy", "Brave"],
  "Actions/Verbs": ["Run", "Jump", "Eat", "Sleep", "Read", "Write", "Sing", "Dance", "Play", "Draw", "Cook", "Swim"],
  "Sight Words": ["the", "and", "is", "it", "to", "in", "I", "you", "he", "she", "we", "they", "can", "see", "like"],
};

const STYLE_PROMPTS: Record<string, string> = {
  "Realistic Illustrations": "photorealistic detailed illustration",
  "Cartoon": "cute cartoon style illustration with bold outlines",
  "Watercolor": "soft watercolor painting style illustration",
  "Bold and Simple": "bold simple flat graphic illustration with solid colors",
  "Montessori-style": "clean minimalist realistic illustration on white background, Montessori educational style",
};

function getItemsForPage(subject: string, pageIndex: number): string[] {
  const items = SUBJECT_ITEMS[subject] || SUBJECT_ITEMS["Animals"];
  const startIdx = pageIndex * CARDS_PER_PAGE;
  const result: string[] = [];
  for (let i = 0; i < CARDS_PER_PAGE; i++) {
    result.push(items[(startIdx + i) % items.length]);
  }
  return result;
}

/**
 * Generate bilingual translations for a batch of items using GPT.
 */
async function getTranslations(items: string[], languages: string): Promise<Array<{ primary: string; secondary: string }>> {
  const langParts = languages.split("+").map(l => l.trim());
  const primaryLang = langParts[0] || "English";
  const secondaryLang = langParts[1] || "Spanish";

  const systemPrompt = `You are a bilingual education expert. Translate vocabulary items accurately for children's flashcards.`;
  const userPrompt = `Translate these items from ${primaryLang} to ${secondaryLang}. Return a JSON object with a "translations" array.
Items: ${JSON.stringify(items)}

Format:
{"translations": [{"primary": "${primaryLang} word", "secondary": "${secondaryLang} word"}, ...]}

Keep translations simple and age-appropriate. For numbers, use the word form (e.g., "One" / "Uno").`;

  const content = await generateContent({
    systemPrompt,
    userPrompt,
    responseFormat: { type: "json_object" },
  });

  try {
    const parsed = JSON.parse(content);
    const translations = parsed.translations || [];
    return items.map((item, i) => ({
      primary: translations[i]?.primary || item,
      secondary: translations[i]?.secondary || item,
    }));
  } catch {
    return items.map(item => ({ primary: item, secondary: item }));
  }
}

/**
 * Generate a flashcard page with 4 cards in a 2x2 grid.
 */
async function generateFlashcardPage(pageIndex: number, job: GenerationJob): Promise<PageResult> {
  const opts = job.options as FlashcardOptions;
  const items = getItemsForPage(opts.subject, pageIndex);
  const stylePrompt = STYLE_PROMPTS[opts.style] || STYLE_PROMPTS["Bold and Simple"];

  // Step 1: Get bilingual translations
  const translations = await getTranslations(items, opts.languages);

  // Step 2: Generate one illustration per card
  const cardImages: string[] = [];
  for (const item of items) {
    const prompt = buildImagePrompt({
      subject: `single clear illustration of "${item}" centered, ${stylePrompt}`,
      additionalDetails: "clean isolated illustration on a plain light background, educational flashcard artwork, simple and recognizable",
    });
    const { buffer } = await generatePageImage(prompt);
    cardImages.push(buffer.toString("base64"));
  }

  return {
    pageNumber: pageIndex + 2, // +2 because page 1 is cover
    imageUrl: "generated",
    status: "success",
    metadata: { translations, cardImages },
  };
}

/**
 * Generate the cover page for the flashcard set.
 */
async function generateCoverPage(job: GenerationJob): Promise<PageResult> {
  const opts = job.options as FlashcardOptions;
  const prompt = buildImagePrompt({
    subject: `colorful educational flashcard set cover design with playful ${opts.subject.toLowerCase()} themed elements`,
    additionalDetails: `vibrant child-friendly cover illustration for a bilingual ${opts.languages} flashcard set, educational and inviting`,
  });
  const { imageUrl } = await generatePageImage(prompt);
  return {
    pageNumber: 1,
    imageUrl,
    status: "success",
    metadata: { isCover: true },
  };
}

/**
 * Custom chunk processor for flashcards.
 */
async function processFlashcardChunkInternal(job: GenerationJob): Promise<void> {
  const PAGES_PER_CHUNK = 2; // Fewer per chunk since each page generates 4 images
  const startIndex = job.nextPageIndex;
  const endIndex = Math.min(startIndex + PAGES_PER_CHUNK, job.totalPages);

  updateJob(job.id, {
    status: "generating",
    statusMessage: `Generating flashcard pages ${startIndex + 1}-${endIndex} of ${job.totalPages}...`,
  });

  for (let i = startIndex; i < endIndex; i++) {
    try {
      let result: PageResult;
      if (i === 0) {
        result = await generateCoverPage(job);
      } else {
        result = await generateFlashcardPage(i - 1, job);
      }
      addPageResult(job.id, result);
      updateJob(job.id, {
        nextPageIndex: i + 1,
        statusMessage: `Generated page ${i + 1} of ${job.totalPages}`,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      addPageResult(job.id, {
        pageNumber: i + 1,
        imageUrl: "",
        status: "error",
        error: errorMsg,
      });
      updateJob(job.id, { nextPageIndex: i + 1 });
    }
  }

  const updatedJob = getJob(job.id);
  if (updatedJob && updatedJob.nextPageIndex >= updatedJob.totalPages) {
    await finalizeFlashcardPdf(updatedJob);
  }
}

/**
 * Assemble the flashcard PDF with 2x2 card grid, text overlays, and cut lines.
 */
async function finalizeFlashcardPdf(job: GenerationJob): Promise<void> {
  updateJob(job.id, { statusMessage: "Assembling flashcard PDF..." });

  const successPages = job.pageResults.filter(r => r.status === "success");
  if (successPages.length === 0) {
    updateJob(job.id, { status: "error", errorMessage: "No pages were generated successfully." });
    return;
  }

  try {
    const opts = job.options as FlashcardOptions;
    const pageContents: PageContent[] = [];

    const cardPositions = [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
    ];

    for (const page of successPages) {
      if (page.metadata?.isCover) {
        // Cover page
        const coverBuffer = await fetchImageBuffer(page.imageUrl);
        pageContents.push({
          imageBuffer: coverBuffer,
          contentBlocks: [
            {
              text: `${opts.subject} Flashcards`,
              x: 50,
              y: 60,
              width: PAGE_WIDTH - 100,
              fontSize: 28,
              font: "bold",
              align: "center",
              color: "#FFFFFF",
            },
            {
              text: opts.languages,
              x: 50,
              y: 100,
              width: PAGE_WIDTH - 100,
              fontSize: 16,
              font: "normal",
              align: "center",
              color: "#FFFFFF",
            },
            {
              text: `${opts.cardsPerSet} Cards \u2022 Print & Cut`,
              x: 50,
              y: 700,
              width: PAGE_WIDTH - 100,
              fontSize: 12,
              font: "normal",
              align: "center",
              color: "#FFFFFF",
            },
          ],
          pageNumber: 1,
          totalPages: job.totalPages,
        });
      } else {
        // Card grid page
        const translations: Array<{ primary: string; secondary: string }> = page.metadata?.translations || [];
        const cardImageB64s: string[] = page.metadata?.cardImages || [];

        const cardLayouts: NonNullable<PageContent["cards"]> = [];

        for (let i = 0; i < Math.min(4, translations.length); i++) {
          const pos = cardPositions[i];
          const x = CARD_MARGIN + pos.col * (CARD_WIDTH + CARD_GAP);
          const y = CARD_MARGIN + pos.row * (CARD_HEIGHT + CARD_GAP);

          let imgBuffer: Buffer | undefined;
          if (cardImageB64s[i]) {
            imgBuffer = Buffer.from(cardImageB64s[i], "base64");
          }

          const translation = translations[i];
          cardLayouts.push({
            x,
            y,
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            imageBuffer: imgBuffer,
            topText: translation.primary,
            bottomText: translation.secondary,
            fontSize: 16,
          });
        }

        pageContents.push({
          backgroundColor: "#FFFFFF",
          cards: cardLayouts,
          showCutLines: true,
          pageNumber: page.pageNumber,
          totalPages: job.totalPages,
        });
      }
    }

    const pdfBuffer = await assemblePdf(pageContents);

    const { url: pdfUrl } = await storagePut(
      `products/${job.generatorType}/${job.filename}`,
      pdfBuffer,
      "application/pdf"
    );

    const coverPage = successPages.find(p => p.metadata?.isCover);
    const coverUrl = coverPage?.imageUrl || null;

    updateJob(job.id, {
      status: successPages.length === job.totalPages ? "complete" : "partial",
      pdfUrl,
      coverImageUrl: coverUrl,
      statusMessage: "PDF ready for download!",
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "PDF assembly failed";
    updateJob(job.id, { status: "error", errorMessage: errorMsg });
  }
}

export function createFlashcardJob(options: FlashcardOptions): string {
  const contentPages = Math.ceil(options.cardsPerSet / CARDS_PER_PAGE);
  const totalPages = contentPages + 1; // +1 for cover
  const job = createJob(
    "flashcard",
    totalPages,
    options,
    `flashcards-${options.subject.toLowerCase().replace(/\s+/g, "-")}.pdf`
  );
  return job.id;
}

export async function processFlashcardChunk(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");
  await processFlashcardChunkInternal(job);
}
