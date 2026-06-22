/**
 * Cultural Game Generator
 * Generates trivia cards, party games, conversation starters, quiz packs, bingo, and Would You Rather.
 * Uses GPT for content (questions/answers) and Flux for decorative card backgrounds.
 *
 * Features:
 * - Cover page with title and branding
 * - "How to Play" instructions page
 * - 2x2 card grid with GPT-generated questions overlaid on decorative backgrounds
 * - White/semi-transparent text backgrounds for readability on busy patterns
 * - Minimum 8+ pages (cover + instructions + 6+ card pages)
 */
import { buildImagePrompt, generatePageImage, generateContent } from "./shared";
import { createJob, getJob, updateJob, addPageResult, type GenerationJob, type PageResult } from "../jobs";
import { assemblePdf, fetchImageBuffer, PageContent } from "../pdfAssembly";
import { storagePut } from "../storage";

export interface CulturalGameOptions {
  gameType: string;
  culturalEdition: string;
  occasion: string;
  cardCount: number;
  ageAppropriate: string;
}

const CARDS_PER_PAGE = 4; // 2x2 grid on 8.5x11

// Card grid layout constants for 8.5x11 (612x792 pt)
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const CARD_MARGIN = 20;
const CARD_GAP = 10;
const CARD_WIDTH = (PAGE_WIDTH - 2 * CARD_MARGIN - CARD_GAP) / 2;
const CARD_HEIGHT = (PAGE_HEIGHT - 2 * CARD_MARGIN - CARD_GAP) / 2;

interface GameCard {
  question: string;
  answer?: string;
  category?: string;
}

/**
 * Generate game card content using GPT.
 */
async function generateGameContent(
  opts: CulturalGameOptions,
  batchStart: number,
  batchSize: number
): Promise<GameCard[]> {
  const systemPrompt = `You are an expert game designer specializing in culturally authentic educational games.
Generate engaging, accurate, and respectful content for a ${opts.gameType} game.
Cultural edition: ${opts.culturalEdition}
Occasion: ${opts.occasion}
Age appropriateness: ${opts.ageAppropriate}
IMPORTANT: All content must be factually accurate, culturally respectful, and age-appropriate.
All questions and answers MUST be specifically about ${opts.culturalEdition} culture, traditions, history, food, music, or customs.
Do NOT generate generic questions — every card must be directly relevant to ${opts.culturalEdition}.`;

  const userPrompt = `Generate exactly ${batchSize} ${opts.gameType} cards (numbered ${batchStart + 1} to ${batchStart + batchSize}).
Theme: ${opts.culturalEdition} ${opts.gameType} for ${opts.occasion}
Audience: ${opts.ageAppropriate}

Each card needs:
- A question or prompt specifically about ${opts.culturalEdition} culture
- An answer (for trivia/quiz) or response option
- A category label (e.g., "Food", "Music", "History", "Traditions", "Language")

Return a JSON object with a "cards" array:
{"cards": [{"question": "...", "answer": "...", "category": "..."}]}

Make them engaging, educational, and 100% culturally authentic for ${opts.culturalEdition}.
For ${opts.ageAppropriate} audience.`;

  const content = await generateContent({
    systemPrompt,
    userPrompt,
    responseFormat: { type: "json_object" },
  });

  try {
    const parsed = JSON.parse(content);
    const cards = Array.isArray(parsed) ? parsed : parsed.cards || parsed.questions || [];
    return cards.slice(0, batchSize);
  } catch {
    return Array.from({ length: batchSize }, (_, i) => ({
      question: `${opts.culturalEdition} ${opts.gameType} Question ${batchStart + i + 1}`,
      answer: "Answer here",
      category: opts.culturalEdition,
    }));
  }
}

/**
 * Generate "How to Play" instructions using GPT.
 */
async function generateHowToPlay(opts: CulturalGameOptions): Promise<string[]> {
  const systemPrompt = `You are a game designer. Write clear, concise instructions for playing a card game.`;
  const userPrompt = `Write 4-6 simple "How to Play" instructions for a ${opts.gameType} card game.
Theme: ${opts.culturalEdition} edition for ${opts.occasion}
Audience: ${opts.ageAppropriate}

Return a JSON object: {"instructions": ["Step 1...", "Step 2...", ...]}
Keep each step to one sentence. Make it fun and accessible.`;

  const content = await generateContent({
    systemPrompt,
    userPrompt,
    responseFormat: { type: "json_object" },
  });

  try {
    const parsed = JSON.parse(content);
    return parsed.instructions || ["Shuffle the cards.", "Take turns drawing a card.", "Read the question aloud.", "Discuss or answer together!", "The person with the most correct answers wins!"];
  } catch {
    return ["Shuffle the cards.", "Take turns drawing a card.", "Read the question aloud.", "Discuss or answer together!", "The person with the most correct answers wins!"];
  }
}

/**
 * Generate one page of cultural game cards.
 */
async function generateCulturalGamePage(pageIndex: number, job: GenerationJob): Promise<PageResult> {
  const opts = job.options as CulturalGameOptions;

  // Page 0 = cover, Page 1 = how to play, Page 2+ = card pages
  if (pageIndex === 0) {
    // Cover page
    const bgPrompt = buildImagePrompt({
      subject: `elegant game box cover design with ornamental cultural patterns and decorative elements`,
      culturalVariant: opts.culturalEdition,
      additionalDetails: `rich vibrant colors, ${opts.occasion} themed, premium card game cover art, sophisticated and inviting`,
    });
    const { imageUrl } = await generatePageImage(bgPrompt);
    return {
      pageNumber: 1,
      imageUrl,
      status: "success",
      metadata: { isCover: true },
    };
  }

  if (pageIndex === 1) {
    // How to Play page
    const bgPrompt = buildImagePrompt({
      subject: `decorative page border with subtle cultural ornamental patterns around the edges, large plain white center area`,
      culturalVariant: opts.culturalEdition,
      additionalDetails: `elegant frame design, the center 80% must be plain white for text readability, ${opts.occasion} themed`,
    });
    const { imageUrl } = await generatePageImage(bgPrompt);
    const instructions = await generateHowToPlay(opts);
    return {
      pageNumber: 2,
      imageUrl,
      status: "success",
      metadata: { isHowToPlay: true, instructions },
    };
  }

  // Card pages (pageIndex 2+ maps to card batches)
  const cardPageIndex = pageIndex - 2;
  const batchStart = cardPageIndex * CARDS_PER_PAGE;
  const cardsOnThisPage = Math.min(CARDS_PER_PAGE, opts.cardCount - batchStart);

  // Generate GPT content for this page's cards
  const cards = await generateGameContent(opts, batchStart, cardsOnThisPage);

  // Generate decorative background
  const bgPrompt = buildImagePrompt({
    subject: `decorative card background pattern with ornamental border design suitable for a ${opts.gameType} game card`,
    culturalVariant: opts.culturalEdition,
    additionalDetails: `elegant repeating pattern, rich colors, ${opts.occasion} themed, suitable as a card back or decorative frame, the card content area in the center must be light/white so text is readable`,
  });
  const { imageUrl } = await generatePageImage(bgPrompt);

  return {
    pageNumber: pageIndex + 1,
    imageUrl,
    status: "success",
    metadata: { cards, cardsOnThisPage },
  };
}

/**
 * Custom chunk processor.
 */
async function processCulturalGameChunkInternal(job: GenerationJob): Promise<void> {
  const PAGES_PER_CHUNK = 2;
  const startIndex = job.nextPageIndex;
  const endIndex = Math.min(startIndex + PAGES_PER_CHUNK, job.totalPages);

  updateJob(job.id, {
    status: "generating",
    statusMessage: `Generating game pages ${startIndex + 1}-${endIndex} of ${job.totalPages}...`,
  });

  for (let i = startIndex; i < endIndex; i++) {
    try {
      const result = await generateCulturalGamePage(i, job);
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
    await finalizeCulturalGamePdf(updatedJob);
  }
}

/**
 * Assemble the cultural game PDF with cover, instructions, and card pages.
 */
async function finalizeCulturalGamePdf(job: GenerationJob): Promise<void> {
  updateJob(job.id, { statusMessage: "Assembling PDF with game cards..." });

  const successPages = job.pageResults.filter(r => r.status === "success");
  if (successPages.length === 0) {
    updateJob(job.id, { status: "error", errorMessage: "No pages were generated successfully." });
    return;
  }

  try {
    const opts = job.options as CulturalGameOptions;
    const cardPositions = [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
    ];

    const pageContents: PageContent[] = [];

    for (const page of successPages) {
      const buffer = await fetchImageBuffer(page.imageUrl);

      if (page.metadata?.isCover) {
        // Cover page with title overlay
        pageContents.push({
          imageBuffer: buffer,
          contentBlocks: [
            {
              text: `${opts.culturalEdition}`,
              x: 50,
              y: 280,
              width: PAGE_WIDTH - 100,
              fontSize: 32,
              font: "bold",
              align: "center",
              color: "#FFFFFF",
            },
            {
              text: `${opts.gameType}`,
              x: 50,
              y: 330,
              width: PAGE_WIDTH - 100,
              fontSize: 24,
              font: "bold",
              align: "center",
              color: "#FFFFFF",
            },
            {
              text: `${opts.occasion} Edition`,
              x: 50,
              y: 370,
              width: PAGE_WIDTH - 100,
              fontSize: 14,
              font: "normal",
              align: "center",
              color: "#FFFFFF",
            },
            {
              text: `${opts.cardCount} Cards \u2022 Ages: ${opts.ageAppropriate}`,
              x: 50,
              y: 700,
              width: PAGE_WIDTH - 100,
              fontSize: 11,
              font: "normal",
              align: "center",
              color: "#FFFFFF",
            },
          ],
          pageNumber: page.pageNumber,
          totalPages: job.totalPages,
        });
      } else if (page.metadata?.isHowToPlay) {
        // How to Play page
        const instructions: string[] = page.metadata.instructions || [];
        const contentBlocks: NonNullable<PageContent["contentBlocks"]> = [
          {
            text: "How to Play",
            x: 80,
            y: 100,
            width: PAGE_WIDTH - 160,
            fontSize: 24,
            font: "bold",
            align: "center",
            color: "#1a1a1a",
          },
        ];

        instructions.forEach((instruction, idx) => {
          contentBlocks.push({
            text: `${idx + 1}. ${instruction}`,
            x: 100,
            y: 170 + idx * 60,
            width: PAGE_WIDTH - 200,
            fontSize: 13,
            font: "normal",
            align: "left",
            color: "#333333",
          });
        });

        contentBlocks.push({
          text: `${opts.culturalEdition} ${opts.gameType} \u2022 ${opts.occasion}`,
          x: 80,
          y: 650,
          width: PAGE_WIDTH - 160,
          fontSize: 11,
          font: "normal",
          align: "center",
          color: "#666666",
        });

        pageContents.push({
          imageBuffer: buffer,
          contentBlocks,
          pageNumber: page.pageNumber,
          totalPages: job.totalPages,
        });
      } else {
        // Card pages with 2x2 grid
        const cards: GameCard[] = page.metadata?.cards || [];
        const cardsOnThisPage: number = page.metadata?.cardsOnThisPage || cards.length;

        const cardLayouts: NonNullable<PageContent["cards"]> = [];

        for (let i = 0; i < cardsOnThisPage; i++) {
          const card = cards[i];
          if (!card) continue;

          const pos = cardPositions[i];
          const x = CARD_MARGIN + pos.col * (CARD_WIDTH + CARD_GAP);
          const y = CARD_MARGIN + pos.row * (CARD_HEIGHT + CARD_GAP);

          const topText = card.category ? `[${card.category}]` : "";
          const frontText = card.question || "";
          const bottomText = card.answer ? `A: ${card.answer}` : "";

          cardLayouts.push({
            x,
            y,
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            imageBuffer: buffer,
            topText,
            frontText,
            bottomText,
            fontSize: 11,
          });
        }

        pageContents.push({
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

    const coverUrl = successPages[0]?.imageUrl || null;

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

export function createCulturalGameJob(options: CulturalGameOptions): string {
  // Ensure minimum 8 pages: cover + how to play + at least 6 card pages
  const cardPages = Math.max(6, Math.ceil(options.cardCount / CARDS_PER_PAGE));
  const totalPages = cardPages + 2; // +2 for cover and how-to-play
  // Adjust cardCount to match actual pages
  const adjustedOptions = { ...options, cardCount: Math.max(options.cardCount, 24) };
  const job = createJob(
    "cultural-game",
    totalPages,
    adjustedOptions,
    `cultural-game-${options.gameType.toLowerCase().replace(/\s+/g, "-")}.pdf`
  );
  return job.id;
}

export async function processCulturalGameChunk(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");
  await processCulturalGameChunkInternal(job);
}
