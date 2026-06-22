/**
 * Job System for chunked multi-page generation.
 * 
 * Pattern: Client POSTs to create a job, then polls GET /api/generate/job/:id
 * Each poll triggers generation of 3-5 pages (stays within serverless timeout).
 * The polling IS the keep-alive mechanism.
 */
import { nanoid } from "nanoid";

export interface PageResult {
  pageNumber: number;
  imageUrl: string;
  status: "success" | "error";
  error?: string;
}

export interface GenerationJob {
  id: string;
  status: "pending" | "generating" | "complete" | "partial" | "error";
  totalPages: number;
  completedPages: number;
  pageResults: PageResult[];
  pdfUrl: string | null;
  coverImageUrl: string | null;
  filename: string;
  statusMessage: string;
  errorMessage: string | null;
  options: Record<string, any>;
  generatorType: string;
  createdAt: number;
  // Internal: tracks which page to generate next
  nextPageIndex: number;
}

// In-memory job store (jobs expire after 1 hour)
const jobs = new Map<string, GenerationJob>();
const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour

// Cleanup expired jobs periodically
setInterval(() => {
  const now = Date.now();
  Array.from(jobs.entries()).forEach(([id, job]) => {
    if (now - job.createdAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  });
}, 5 * 60 * 1000); // Every 5 minutes

export function createJob(
  generatorType: string,
  totalPages: number,
  options: Record<string, any>,
  filename: string
): GenerationJob {
  const job: GenerationJob = {
    id: nanoid(12),
    status: "pending",
    totalPages,
    completedPages: 0,
    pageResults: [],
    pdfUrl: null,
    coverImageUrl: null,
    filename,
    statusMessage: "Starting generation...",
    errorMessage: null,
    options,
    generatorType,
    createdAt: Date.now(),
    nextPageIndex: 0,
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): GenerationJob | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, updates: Partial<GenerationJob>): void {
  const job = jobs.get(id);
  if (job) {
    Object.assign(job, updates);
  }
}

export function addPageResult(id: string, result: PageResult): void {
  const job = jobs.get(id);
  if (job) {
    job.pageResults.push(result);
    job.completedPages = job.pageResults.filter(r => r.status === "success").length;
  }
}

export function getJobPublicState(job: GenerationJob) {
  return {
    id: job.id,
    status: job.status,
    totalPages: job.totalPages,
    completedPages: job.completedPages,
    pageResults: job.pageResults,
    pdfUrl: job.pdfUrl,
    coverImageUrl: job.coverImageUrl,
    filename: job.filename,
    statusMessage: job.statusMessage,
    errorMessage: job.errorMessage,
  };
}
