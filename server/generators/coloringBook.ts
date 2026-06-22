/**
 * Coloring Book Generator
 * Generates black-and-white line art pages using chunked generation.
 * Output: multi-page PDF with clean line art suitable for coloring.
 */
import { generatePageImage, processChunk } from "./shared";
import { createJob, getJob, type GenerationJob, type PageResult } from "../jobs";

export interface ColoringBookOptions {
  theme: string;
  ageRange: string;
  pageCount: number;
  detailLevel: string;
}

const THEME_SUBJECTS: Record<string, string[]> = {
  "Animals": [
    "cute lion cub sitting in grass with flowers",
    "playful puppy with a ball in a garden",
    "majestic elephant with decorative patterns",
    "friendly dolphin jumping over ocean waves",
    "owl perched on a tree branch at night with stars",
    "butterfly with intricate wing patterns on flowers",
    "kitten playing with yarn balls",
    "giraffe eating leaves from a tall tree",
    "panda bear eating bamboo in a forest",
    "sea turtle swimming through coral reef",
  ],
  "Dinosaurs": [
    "friendly T-Rex in a prehistoric landscape with volcanoes",
    "triceratops family near a river with ferns",
    "pterodactyl flying over mountains and trees",
    "stegosaurus with detailed back plates in a forest",
    "baby dinosaur hatching from an egg in a nest",
    "brachiosaurus reaching for tall tree leaves",
    "velociraptor running through a jungle",
    "ankylosaurus with armored body near rocks",
    "spinosaurus near a waterfall",
    "dinosaur footprints leading through a valley",
  ],
  "Ocean Life": [
    "coral reef scene with tropical fish and sea anemones",
    "octopus with swirling tentacles among seashells",
    "whale swimming in deep ocean with small fish",
    "seahorse among seaweed and bubbles",
    "mermaid sitting on a rock with ocean waves",
    "submarine exploring underwater cave with treasures",
    "jellyfish floating with flowing tentacles",
    "starfish and shells on a sandy ocean floor",
    "shark swimming through a school of fish",
    "underwater castle with sea creatures",
  ],
  "Space": [
    "astronaut floating in space near a planet",
    "rocket ship launching through clouds into stars",
    "alien spaceship hovering over a moon landscape",
    "solar system with planets in orbit around the sun",
    "space station orbiting Earth with stars",
    "moon rover exploring crater landscape",
    "constellation patterns in a night sky",
    "comet streaking across a starfield",
    "friendly alien on a strange planet with unusual plants",
    "satellite orbiting Earth with city lights below",
  ],
  "Fairy Tales": [
    "princess in a castle tower with flowing hair",
    "dragon guarding a treasure cave",
    "enchanted forest with mushroom houses and fairies",
    "knight on horseback approaching a castle",
    "magic beanstalk growing up into clouds",
    "fairy godmother with a magic wand and sparkles",
    "gingerbread house in a candy forest",
    "unicorn in a meadow with rainbow and flowers",
    "pirate ship on stormy seas with treasure map",
    "wizard casting spells with a staff and book",
  ],
  "Vehicles": [
    "fire truck racing down a city street",
    "construction site with excavator and dump truck",
    "airplane flying through clouds over mountains",
    "train traveling through countryside with bridges",
    "race car speeding on a track with checkered flags",
    "sailboat on calm waters with lighthouse",
    "hot air balloon floating over a town",
    "monster truck jumping over cars",
    "submarine diving deep underwater",
    "helicopter flying over a city skyline",
  ],
  "Food": [
    "kitchen scene with fruits and vegetables on a table",
    "bakery with cakes, cupcakes, and pastries",
    "pizza being made with various toppings",
    "ice cream sundae with multiple scoops and toppings",
    "farmer's market with fruit and vegetable stalls",
    "sushi plate with chopsticks and Japanese elements",
    "breakfast table with pancakes, eggs, and juice",
    "candy shop with jars of sweets and lollipops",
    "garden with growing vegetables and herbs",
    "picnic scene with sandwiches, fruits, and blanket",
  ],
  "Holidays": [
    "Christmas tree with ornaments, presents, and stockings",
    "Halloween scene with pumpkins, bats, and haunted house",
    "Easter bunny with decorated eggs in a garden",
    "Thanksgiving feast table with turkey and autumn leaves",
    "Valentine hearts, flowers, and love birds",
    "Fourth of July fireworks over a town",
    "New Year celebration with clock and confetti",
    "St. Patrick's Day with shamrocks and rainbow",
    "Hanukkah menorah with candles and dreidels",
    "Diwali celebration with diyas and rangoli patterns",
  ],
  "African Culture": [
    "African savanna scene with baobab tree and wildlife",
    "traditional African village with round huts and patterns",
    "African mask designs with geometric patterns",
    "Kente cloth inspired geometric pattern design",
    "African drummer with djembe and musical notes",
    "Adinkra symbols arranged in a decorative pattern",
    "African animals at a watering hole at sunset",
    "traditional African hairstyles and head wraps",
    "African marketplace with colorful fabrics and baskets",
    "Maasai warrior with shield and spear in grassland",
  ],
  "Caribbean Life": [
    "tropical beach scene with palm trees and hammock",
    "Caribbean carnival dancer with feathered costume",
    "underwater reef scene with tropical fish",
    "steel drum band playing music on a beach",
    "tropical fruit market with mangoes, coconuts, and bananas",
    "Caribbean fishing boat on turquoise waters",
    "hummingbird among hibiscus flowers",
    "island village with colorful houses on a hillside",
    "sea turtle nesting on a moonlit beach",
    "Caribbean sunset with sailboat and palm trees",
  ],
  "World Cultures": [
    "Japanese cherry blossom garden with pagoda",
    "Indian Holi festival with colors and celebration",
    "Mexican Day of the Dead sugar skull with flowers",
    "Chinese dragon dance during New Year celebration",
    "Native American dreamcatcher with feathers and beads",
    "Egyptian pyramids with sphinx and palm trees",
    "Greek temple with columns and olive trees",
    "Brazilian carnival scene with dancers and music",
    "Australian outback with kangaroo and boomerang",
    "Nordic Viking ship on ocean waves",
  ],
};

function getDetailLevelPrompt(detailLevel: string): string {
  switch (detailLevel) {
    case "kids":
      return "very simple bold outlines, large coloring areas, thick lines (5px+), minimal detail, perfect for ages 3-7, no fine details or small elements";
    case "tweens":
      return "moderate detail level, medium-thickness outlines, some patterns and textures, suitable for ages 8-12, balanced complexity";
    case "adults":
      return "highly intricate and detailed, fine lines, complex patterns, many small elements, zentangle-style details, mandala-like complexity, suitable for adult coloring";
    default:
      return "moderate detail level, medium-thickness outlines, suitable for all ages";
  }
}

function getAgeModifier(ageRange: string): string {
  if (ageRange.includes("Toddler") || ageRange.includes("2-4")) {
    return "extremely simple, very thick bold outlines, very large areas to color, minimal elements on page";
  }
  if (ageRange.includes("Preschool") || ageRange.includes("4-6")) {
    return "simple bold outlines, large coloring areas, friendly and recognizable shapes";
  }
  if (ageRange.includes("Elementary") || ageRange.includes("6-8")) {
    return "clear outlines with some detail, medium-sized coloring areas, engaging scenes";
  }
  return "detailed outlines with patterns, smaller areas, complex scenes";
}

async function generateColoringPage(pageIndex: number, job: GenerationJob): Promise<PageResult> {
  const opts = job.options as ColoringBookOptions;
  const subjects = THEME_SUBJECTS[opts.theme] || THEME_SUBJECTS["Animals"];
  // Use a unique subject per page — cycle through the full list without repeating
  // If more pages than subjects, append page index to force a unique scene
  const subjectIndex = pageIndex % subjects.length;
  const baseSubject = subjects[subjectIndex];
  // For pages beyond the subject list length, add a scene variation to avoid repeats
  const sceneVariation = pageIndex >= subjects.length
    ? ` (scene variation ${Math.floor(pageIndex / subjects.length) + 1}, different composition and background)`
    : "";
  const subject = `${baseSubject}${sceneVariation}`;

  const detailPrompt = getDetailLevelPrompt(opts.detailLevel);
  const ageModifier = getAgeModifier(opts.ageRange);

  const prompt = [
    "Template",
    `black and white coloring page of ${subject}`,
    detailPrompt,
    ageModifier,
    "Every page must be dense and detailed, filling the entire page edge-to-edge with no large empty white areas. Minimum complexity: 50+ distinct elements per page. Each page in the book must be a DIFFERENT scene — no repeated subjects",
    "clean black outlines on pure white background",
    "no shading, no gradients, no gray tones, no color",
    "professional coloring book quality line art",
    "filling the entire canvas edge-to-edge with no blank white space",
    "absolutely no words, letters, numbers, or written text anywhere in the image",
  ].join(", ");

  const { imageUrl } = await generatePageImage(prompt);
  return { pageNumber: pageIndex + 1, imageUrl, status: "success" };
}

export function createColoringBookJob(options: ColoringBookOptions): string {
  const job = createJob(
    "coloring-book",
    options.pageCount,
    options,
    `coloring-book-${options.theme.toLowerCase().replace(/\s+/g, "-")}.pdf`
  );
  return job.id;
}

export async function processColoringBookChunk(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");
  await processChunk(job, generateColoringPage);
}
