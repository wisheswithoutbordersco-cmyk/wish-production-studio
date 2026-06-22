import { describe, expect, it } from "vitest";
import { createJob, getJob, updateJob, addPageResult, getJobPublicState } from "./jobs";

describe("Job System", () => {
  it("creates a job with correct initial state", () => {
    const job = createJob("brain-training", 5, { theme: "Animals" }, "test.pdf");
    expect(job.id).toBeTruthy();
    expect(job.status).toBe("pending");
    expect(job.totalPages).toBe(5);
    expect(job.completedPages).toBe(0);
    expect(job.pageResults).toHaveLength(0);
    expect(job.pdfUrl).toBeNull();
    expect(job.generatorType).toBe("brain-training");
    expect(job.filename).toBe("test.pdf");
    expect(job.nextPageIndex).toBe(0);
  });

  it("retrieves a job by ID", () => {
    const job = createJob("flashcard", 3, {}, "flash.pdf");
    const retrieved = getJob(job.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(job.id);
  });

  it("returns undefined for non-existent job", () => {
    const result = getJob("non-existent-id");
    expect(result).toBeUndefined();
  });

  it("updates job fields", () => {
    const job = createJob("worksheet", 2, {}, "ws.pdf");
    updateJob(job.id, { status: "generating", statusMessage: "Working..." });
    const updated = getJob(job.id);
    expect(updated?.status).toBe("generating");
    expect(updated?.statusMessage).toBe("Working...");
  });

  it("adds page results and updates completedPages", () => {
    const job = createJob("cultural-game", 4, {}, "game.pdf");
    addPageResult(job.id, { pageNumber: 1, imageUrl: "/img1.png", status: "success" });
    addPageResult(job.id, { pageNumber: 2, imageUrl: "/img2.png", status: "success" });
    addPageResult(job.id, { pageNumber: 3, imageUrl: "", status: "error", error: "fail" });

    const updated = getJob(job.id);
    expect(updated?.pageResults).toHaveLength(3);
    expect(updated?.completedPages).toBe(2); // Only successful pages count
  });

  it("returns correct public state", () => {
    const job = createJob("brain-training", 3, {}, "bt.pdf");
    updateJob(job.id, { status: "complete", pdfUrl: "/test.pdf", coverImageUrl: "/cover.png" });
    addPageResult(job.id, { pageNumber: 1, imageUrl: "/p1.png", status: "success" });

    const publicState = getJobPublicState(getJob(job.id)!);
    expect(publicState.id).toBe(job.id);
    expect(publicState.status).toBe("complete");
    expect(publicState.pdfUrl).toBe("/test.pdf");
    expect(publicState.coverImageUrl).toBe("/cover.png");
    // Should not expose internal fields
    expect((publicState as any).nextPageIndex).toBeUndefined();
    expect((publicState as any).options).toBeUndefined();
    expect((publicState as any).generatorType).toBeUndefined();
  });
});

describe("Generation Routes Structure", () => {
  it("exports all required generator functions", async () => {
    const generators = await import("./generators");
    
    // Brain Training
    expect(generators.createBrainTrainingJob).toBeDefined();
    expect(generators.processBrainTrainingChunk).toBeDefined();
    
    // Cultural Game
    expect(generators.createCulturalGameJob).toBeDefined();
    expect(generators.processCulturalGameChunk).toBeDefined();
    
    // Flashcard
    expect(generators.createFlashcardJob).toBeDefined();
    expect(generators.processFlashcardChunk).toBeDefined();
    
    // Worksheet
    expect(generators.createWorksheetJob).toBeDefined();
    expect(generators.processWorksheetChunk).toBeDefined();
    
    // Outdoor Learning
    expect(generators.createOutdoorLearningJob).toBeDefined();
    expect(generators.processOutdoorLearningChunk).toBeDefined();
    
    // Therapeutic Activity
    expect(generators.createTherapeuticActivityJob).toBeDefined();
    expect(generators.processTherapeuticActivityChunk).toBeDefined();
    
    // Batch Variant
    expect(generators.createBatchVariantJob).toBeDefined();
    expect(generators.processBatchVariantChunk).toBeDefined();
    expect(generators.getBatchJob).toBeDefined();
  });
});
