/**
 * Express routes for the generation job system.
 * 
 * POST /api/generate/:type - Create a new generation job
 * GET /api/generate/job/:id - Poll job status (triggers chunk generation)
 * POST /api/upload-image - Upload an image (base64) to storage
 */
import { Router, Request, Response } from "express";
import { getJob, getJobPublicState } from "./jobs";
import {
  createBrainTrainingJob, processBrainTrainingChunk,
  createCulturalGameJob, processCulturalGameChunk,
  createFlashcardJob, processFlashcardChunk,
  createWorksheetJob, processWorksheetChunk,
  createOutdoorLearningJob, processOutdoorLearningChunk,
  createTherapeuticActivityJob, processTherapeuticActivityChunk,
  createBatchVariantJob, processBatchVariantChunk, getBatchJob,
  createWorkbookJob, processWorkbookChunk,
  createColoringBookJob, processColoringBookChunk,
  createQuickCreateJob, processQuickCreateChunk,
  generateCard, generateCardFromImage,
  enhanceUpscale, enhanceRestyle, enhanceReimagine,
} from "./generators";
import { storagePut } from "./storage";

export const generationRouter = Router();

// ===== Image Upload Endpoint =====
generationRouter.post("/api/upload-image", async (req: Request, res: Response) => {
  try {
    const { data, contentType, filename } = req.body;
    if (!data) {
      res.status(400).json({ error: "Missing image data" });
      return;
    }
    const buffer = Buffer.from(data, "base64");
    const ext = contentType?.includes("png") ? "png" : contentType?.includes("webp") ? "webp" : "jpg";
    const key = `uploads/${filename || `image-${Date.now()}.${ext}`}`;
    const { url } = await storagePut(key, buffer, contentType || "image/png");
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Upload failed" });
  }
});

// ===== Card Generation (non-chunked, returns PDF directly) =====
generationRouter.post("/api/generate/card", async (req: Request, res: Response) => {
  try {
    const result = await generateCard(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Card generation failed" });
  }
});

generationRouter.post("/api/generate/card-from-image", async (req: Request, res: Response) => {
  try {
    const result = await generateCardFromImage(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Card generation failed" });
  }
});

// ===== Enhance Endpoints (non-chunked) =====
generationRouter.post("/api/enhance/upscale", async (req: Request, res: Response) => {
  try {
    const result = await enhanceUpscale(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Upscale failed" });
  }
});

generationRouter.post("/api/enhance/restyle", async (req: Request, res: Response) => {
  try {
    const result = await enhanceRestyle(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Restyle failed" });
  }
});

generationRouter.post("/api/enhance/reimagine", async (req: Request, res: Response) => {
  try {
    const result = await enhanceReimagine(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Reimagine failed" });
  }
});

// ===== Chunked Job Creation Endpoints =====

generationRouter.post("/api/generate/workbook", async (req: Request, res: Response) => {
  try {
    const jobId = createWorkbookJob(req.body);
    res.json({ jobId });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create job" });
  }
});

generationRouter.post("/api/generate/coloring-book", async (req: Request, res: Response) => {
  try {
    const jobId = createColoringBookJob(req.body);
    res.json({ jobId });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create job" });
  }
});

generationRouter.post("/api/generate/brain-training", async (req: Request, res: Response) => {
  try {
    const jobId = createBrainTrainingJob(req.body);
    res.json({ jobId });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create job" });
  }
});

generationRouter.post("/api/generate/cultural-game", async (req: Request, res: Response) => {
  try {
    const jobId = createCulturalGameJob(req.body);
    res.json({ jobId });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create job" });
  }
});

generationRouter.post("/api/generate/flashcard", async (req: Request, res: Response) => {
  try {
    const jobId = createFlashcardJob(req.body);
    res.json({ jobId });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create job" });
  }
});

generationRouter.post("/api/generate/worksheet", async (req: Request, res: Response) => {
  try {
    const jobId = createWorksheetJob(req.body);
    res.json({ jobId });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create job" });
  }
});

generationRouter.post("/api/generate/outdoor-learning", async (req: Request, res: Response) => {
  try {
    const jobId = createOutdoorLearningJob(req.body);
    res.json({ jobId });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create job" });
  }
});

generationRouter.post("/api/generate/therapeutic-activity", async (req: Request, res: Response) => {
  try {
    const jobId = createTherapeuticActivityJob(req.body);
    res.json({ jobId });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create job" });
  }
});

generationRouter.post("/api/generate/batch-variant", async (req: Request, res: Response) => {
  try {
    const jobId = await createBatchVariantJob(req.body);
    res.json({ jobId, type: "batch" });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create job" });
  }
});

generationRouter.post("/api/generate/quick-create", async (req: Request, res: Response) => {
  try {
    const jobId = createQuickCreateJob(req.body);
    res.json({ jobId });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create job" });
  }
});

// ===== Job Polling Endpoint =====
// Each poll triggers generation of the next chunk (3-5 pages)

generationRouter.get("/api/generate/job/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  // Check if it's a batch job
  const batchJob = getBatchJob(id);
  if (batchJob) {
    // Process next variant chunk
    if (batchJob.status !== "complete" && batchJob.status !== "error") {
      try {
        await processBatchVariantChunk(id);
      } catch (error) {
        console.error("Batch chunk error:", error);
      }
    }

    // Return batch job state
    res.json({
      id: batchJob.id,
      status: batchJob.status,
      totalPages: batchJob.totalVariants,
      completedPages: batchJob.currentVariantIndex,
      pageResults: batchJob.variantJobs.map((v, i) => ({
        pageNumber: i + 1,
        imageUrl: "",
        status: v.status === "error" ? "error" : "success",
      })),
      pdfUrl: null,
      coverImageUrl: null,
      filename: `batch-${batchJob.options.baseProductType.toLowerCase().replace(/\s+/g, "-")}.zip`,
      statusMessage: batchJob.statusMessage,
      errorMessage: batchJob.errorMessage,
      variantJobs: batchJob.variantJobs,
      variantPdfUrls: batchJob.variantJobs
        .filter(variantJob => Boolean(variantJob.pdfUrl))
        .map(variantJob => ({
          variant: variantJob.variant,
          pdfUrl: variantJob.pdfUrl as string,
          filename: variantJob.filename,
        })),
    });
    return;
  }

  // Regular job
  const job = getJob(id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  // If job is not complete, process next chunk
  if (job.status !== "complete" && job.status !== "partial" && job.status !== "error") {
    try {
      switch (job.generatorType) {
        case "brain-training":
          await processBrainTrainingChunk(id);
          break;
        case "cultural-game":
          await processCulturalGameChunk(id);
          break;
        case "flashcard":
          await processFlashcardChunk(id);
          break;
        case "worksheet":
          await processWorksheetChunk(id);
          break;
        case "outdoor-learning":
          await processOutdoorLearningChunk(id);
          break;
        case "therapeutic-activity":
          await processTherapeuticActivityChunk(id);
          break;
        case "workbook":
          await processWorkbookChunk(id);
          break;
        case "coloring-book":
          await processColoringBookChunk(id);
          break;
        case "quick-create":
          await processQuickCreateChunk(id);
          break;
        default:
          console.warn(`Unknown generator type: ${job.generatorType}`);
      }
    } catch (error) {
      console.error("Chunk processing error:", error);
    }
  }

  // Return current job state
  const updatedJob = getJob(id);
  if (!updatedJob) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json(getJobPublicState(updatedJob));
});
