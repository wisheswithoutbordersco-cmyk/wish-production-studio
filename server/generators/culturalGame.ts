/**
 * Cultural Game Generator
 * Generates trivia cards, party games, conversation starters, quiz packs, bingo, and Would You Rather.
 * Uses GPT for content (questions/answers) and Flux for decorative card backgrounds.
 */
import { buildImagePrompt, generatePageImage, generateContent, processChunk } from "./shared";
import { createJob, getJob, updateJob, type GenerationJob, type PageResult } from "../jobs";
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

interface GameCard {
  question: string;
  answer?: string;
  category?: string;
}

async function generateGameContent(opts: CulturalGameOptions, batchStart: number, batchSize: number): Promise<GameCard[]> {
  const systemPrompt = `You are an expert game designer specializing in culturally authentic educational games. 
Generate engaging, accurate, and respectful content for a ${opts.gameType} game.
Cultural edition: ${opts.culturalEdition}
Occasion: ${opts.occasion}
Age appropriateness: ${opts.ageAppropriate}
IMPORTANT: All content must be factually accurate, culturally respectful, and age-appropriate.`;

  const userPrompt = `Generate exactly ${batchSize} ${opts.gameType} cards (numbered ${batchStart + 1} to ${batchStart + batchSize}).
Each card needs:
- A question or prompt
- An answer (for trivia/quiz) or response option
- A category label

Format as JSON array: [{"question": "...", "answer": "...", "category": "..."}]
Make them engaging, educational, and culturally authentic for ${opts.culturalEdition}.
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
    // Fallback: generate placeholder cards
    return Array.from({ length: batchSize }, (_, i) => ({
      question: `${opts.gameType} Question ${batchStart + i + 1}`,
      answer: "Answer here",
      category: opts.culturalEdition,
    }));
  }
}

async function generateCulturalGamePage(pageIndex: number, job: GenerationJob): Promise<PageResult> {
  const opts = job.options as CulturalGameOptions;
  const cardsOnThisPage = Math.min(CARDS_PER_PAGE, opts.cardCount - pageIndex * CARDS_PER_PAGE);

  // Generate the decorative background for cards
  const bgPrompt = buildImagePrompt({
    subject: `decorative card background pattern with ornamental border design suitable for a ${opts.gameType} game card`,
    culturalVariant: opts.culturalEdition,
    additionalDetails: `elegant repeating pattern, rich colors, ${opts.occasion} themed, suitable as a card back or decorative frame`,
  });

  const { imageUrl } = await generatePageImage(bgPrompt);

  return {
    pageNumber: pageIndex + 1,
    imageUrl,
    status: "success",
  };
}

export function createCulturalGameJob(options: CulturalGameOptions): string {
  const totalPages = Math.ceil(options.cardCount / CARDS_PER_PAGE);
  const job = createJob(
    "cultural-game",
    totalPages,
    options,
    `cultural-game-${options.gameType.toLowerCase().replace(/\s+/g, "-")}.pdf`
  );
  return job.id;
}

export async function processCulturalGameChunk(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");
  await processChunk(job, generateCulturalGamePage);
}
