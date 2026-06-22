/**
 * Flashcard Generator
 * Generates bilingual flashcard sets with AI illustrations and programmatic text overlay.
 */
import { buildImagePrompt, generatePageImage, generateContent, processChunk } from "./shared";
import { createJob, getJob, type GenerationJob, type PageResult } from "../jobs";

export interface FlashcardOptions {
  subject: string;
  languages: string; // "English + Spanish" etc.
  style: string;
  cardsPerSet: number;
  cardSize: string;
}

const CARDS_PER_PAGE_MAP: Record<string, number> = {
  "Standard (3x5)": 4,   // 2x2 grid
  "Large (4x6)": 2,      // 2x1 grid
  "Mini (2.5x3.5)": 8,   // 4x2 grid
};

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

function getItemForCard(subject: string, cardIndex: number): string {
  const items = SUBJECT_ITEMS[subject] || SUBJECT_ITEMS["Animals"];
  return items[cardIndex % items.length];
}

const STYLE_PROMPTS: Record<string, string> = {
  "Realistic Illustrations": "photorealistic detailed illustration",
  "Cartoon": "cute cartoon style illustration with bold outlines",
  "Watercolor": "soft watercolor painting style illustration",
  "Bold and Simple": "bold simple flat graphic illustration with solid colors",
  "Montessori-style": "clean minimalist realistic illustration on white background, Montessori educational style",
};

async function generateFlashcardPage(pageIndex: number, job: GenerationJob): Promise<PageResult> {
  const opts = job.options as FlashcardOptions;
  const cardsPerPage = CARDS_PER_PAGE_MAP[opts.cardSize] || 4;
  const cardIndex = pageIndex * cardsPerPage;
  const item = getItemForCard(opts.subject, cardIndex);

  // Generate illustration for the primary card on this page
  const stylePrompt = STYLE_PROMPTS[opts.style] || STYLE_PROMPTS["Bold and Simple"];
  const prompt = buildImagePrompt({
    subject: `single clear illustration of "${item}" centered on the canvas, ${stylePrompt}`,
    additionalDetails: "clean isolated illustration perfect for a flashcard, simple background, educational material",
  });

  const { imageUrl } = await generatePageImage(prompt);

  return {
    pageNumber: pageIndex + 1,
    imageUrl,
    status: "success",
  };
}

export function createFlashcardJob(options: FlashcardOptions): string {
  const cardsPerPage = CARDS_PER_PAGE_MAP[options.cardSize] || 4;
  const totalPages = Math.ceil(options.cardsPerSet / cardsPerPage);
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
  await processChunk(job, generateFlashcardPage);
}
