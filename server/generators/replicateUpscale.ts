/**
 * Upgrade 6: AI Upscaler Integration
 * Uses Real-ESRGAN via Replicate for true 4x AI upscaling.
 * Cost: ~$0.01 per upscale on Replicate.
 */
import Replicate from "replicate";
import { storagePut } from "../storage";
import { fetchImageBuffer } from "../pdfAssembly";

let replicateClient: Replicate | null = null;

function getReplicateClient(): Replicate {
  if (!replicateClient) {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      throw new Error("REPLICATE_API_TOKEN is not set. Add it to Railway environment variables.");
    }
    replicateClient = new Replicate({ auth: token });
  }
  return replicateClient;
}

/**
 * Upscale an image using Real-ESRGAN via Replicate (4x resolution).
 * @param imageUrl - URL of the image to upscale (can be relative /manus-storage/ path)
 * @returns URL of the upscaled image stored in our storage
 */
export async function trueUpscale(imageUrl: string): Promise<string> {
  const replicate = getReplicateClient();

  // If the image is a relative URL, we need to make it accessible to Replicate.
  // Fetch the image and convert to a data URI for Replicate input.
  let inputImage: string;
  if (imageUrl.startsWith("/")) {
    const buffer = await fetchImageBuffer(imageUrl);
    const base64 = buffer.toString("base64");
    inputImage = `data:image/png;base64,${base64}`;
  } else {
    inputImage = imageUrl;
  }

  const output = await replicate.run(
    "nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05ce203173a2e48748c488a55558",
    {
      input: {
        image: inputImage,
        scale: 4,
        face_enhance: false,
      },
    }
  );

  // Output can be a string URL or an array with one URL
  const upscaledUrl = Array.isArray(output) ? output[0] : (output as any);

  if (!upscaledUrl || typeof upscaledUrl !== "string") {
    throw new Error("Replicate upscale returned no output URL");
  }

  // Download the upscaled image and store it in our storage
  const response = await fetch(upscaledUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch upscaled image: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { url: storedUrl } = await storagePut(
    `products/enhance/upscaled-4x-${Date.now()}.png`,
    buffer,
    "image/png"
  );

  return storedUrl;
}
