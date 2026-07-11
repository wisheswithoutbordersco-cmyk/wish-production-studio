/**
 * Hook for managing generation job polling.
 * Implements the chunked generation pattern: each poll triggers 3-5 pages of generation.
 */
import { useState, useCallback, useRef, useEffect } from "react";

export interface PageResult {
  pageNumber: number;
  imageUrl: string;
  status: "success" | "error";
  error?: string;
}

export interface VariantJobResult {
  variant: string;
  jobId: string;
  status: "pending" | "generating" | "complete" | "partial" | "error";
  pdfUrl: string | null;
  filename: string | null;
}

export interface VariantPdfResult {
  variant: string;
  pdfUrl: string;
  filename: string | null;
}

export interface JobState {
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
  variantJobs?: VariantJobResult[];
  variantPdfUrls?: VariantPdfResult[];
}

interface UseGenerationJobReturn {
  jobState: JobState | null;
  isGenerating: boolean;
  progress: number;
  startJob: (type: string, options: Record<string, any>) => Promise<void>;
  cancelJob: () => void;
}

export function useGenerationJob(): UseGenerationJobReturn {
  const [jobState, setJobState] = useState<JobState | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const pollJob = useCallback(async (jobId: string) => {
    if (cancelledRef.current) return;

    try {
      const response = await fetch(`/api/generate/job/${jobId}`);
      if (!response.ok) {
        throw new Error(`Poll failed: ${response.status}`);
      }

      const state: JobState = await response.json();
      setJobState(state);

      // Continue polling if not done
      if (state.status !== "complete" && state.status !== "partial" && state.status !== "error") {
        pollingRef.current = setTimeout(() => pollJob(jobId), 1000);
      } else {
        setIsGenerating(false);
      }
    } catch (error) {
      console.error("Poll error:", error);
      setIsGenerating(false);
      setJobState(prev => prev ? {
        ...prev,
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Polling failed",
      } : null);
    }
  }, []);

  const startJob = useCallback(async (type: string, options: Record<string, any>) => {
    cancelledRef.current = false;
    setIsGenerating(true);
    setJobState(null);

    try {
      const response = await fetch(`/api/generate/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        throw new Error(`Failed to create job: ${response.status}`);
      }

      const { jobId } = await response.json();
      
      // Start polling
      setJobState({
        id: jobId,
        status: "pending",
        totalPages: options.pageCount || options.quantity || options.cardsPerSet || 1,
        completedPages: 0,
        pageResults: [],
        pdfUrl: null,
        coverImageUrl: null,
        filename: "",
        statusMessage: "Starting generation...",
        errorMessage: null,
      });

      // Begin polling after a short delay
      pollingRef.current = setTimeout(() => pollJob(jobId), 2000);
    } catch (error) {
      setIsGenerating(false);
      setJobState({
        id: "",
        status: "error",
        totalPages: 0,
        completedPages: 0,
        pageResults: [],
        pdfUrl: null,
        coverImageUrl: null,
        filename: "",
        statusMessage: "",
        errorMessage: error instanceof Error ? error.message : "Failed to start generation",
      });
    }
  }, [pollJob]);

  const cancelJob = useCallback(() => {
    cancelledRef.current = true;
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    setIsGenerating(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
      }
    };
  }, []);

  const progress = jobState
    ? jobState.totalPages > 0
      ? Math.round((jobState.completedPages / jobState.totalPages) * 100)
      : 0
    : 0;

  return { jobState, isGenerating, progress, startJob, cancelJob };
}
