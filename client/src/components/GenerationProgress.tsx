/**
 * Shared progress display component for all generator tabs.
 * Shows generation progress, page thumbnails, download button, and save to library.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Download, Loader2, CheckCircle, AlertCircle, FileText, Library } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { JobState } from "@/hooks/useGenerationJob";

interface GenerationProgressProps {
  jobState: JobState | null;
  isGenerating: boolean;
  progress: number;
  onCancel?: () => void;
  productMeta?: {
    title: string;
    type: string;
    culturalVariant?: string;
    ageRange?: string;
    theme?: string;
    pageCount?: number;
  };
}

export function GenerationProgress({ jobState, isGenerating, progress, onCancel, productMeta }: GenerationProgressProps) {
  const [saved, setSaved] = useState(false);
  const createProduct = trpc.products.create.useMutation({
    onSuccess: () => {
      setSaved(true);
      toast.success("Product saved to library!");
    },
    onError: (err) => {
      toast.error("Failed to save: " + err.message);
    },
  });

  if (!jobState && !isGenerating) return null;

  const handleSaveToLibrary = () => {
    if (!jobState?.pdfUrl || !productMeta) return;
    createProduct.mutate({
      title: productMeta.title,
      type: productMeta.type,
      thumbnailUrl: jobState.coverImageUrl || null,
      pdfUrl: jobState.pdfUrl,
      culturalVariant: productMeta.culturalVariant || null,
      ageRange: productMeta.ageRange || null,
      theme: productMeta.theme || null,
      pageCount: productMeta.pageCount || jobState.totalPages,
    });
  };

  return (
    <div className="space-y-4">
      {/* Status header */}
      <div className="flex items-center gap-3">
        {isGenerating && (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        )}
        {jobState?.status === "complete" && (
          <CheckCircle className="h-5 w-5 text-green-500" />
        )}
        {jobState?.status === "partial" && (
          <CheckCircle className="h-5 w-5 text-yellow-500" />
        )}
        {jobState?.status === "error" && (
          <AlertCircle className="h-5 w-5 text-destructive" />
        )}
        <span className="text-sm font-medium text-foreground">
          {jobState?.statusMessage || "Initializing..."}
        </span>
      </div>

      {/* Progress bar */}
      {isGenerating && (
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{jobState?.completedPages || 0} / {jobState?.totalPages || 0} pages</span>
            <span>{progress}%</span>
          </div>
        </div>
      )}

      {/* Error message */}
      {jobState?.errorMessage && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
          <p className="text-sm text-destructive">{jobState.errorMessage}</p>
        </div>
      )}

      {/* Page thumbnails */}
      {jobState && jobState.pageResults.length > 0 && (
        <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
          {jobState.pageResults
            .filter(p => p.status === "success" && p.imageUrl)
            .slice(0, 12)
            .map((page) => (
              <div
                key={page.pageNumber}
                className="aspect-[8.5/11] rounded-md overflow-hidden border border-border bg-secondary"
              >
                <img
                  src={page.imageUrl}
                  alt={`Page ${page.pageNumber}`}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
        </div>
      )}

      {/* Download and Save buttons */}
      {jobState?.pdfUrl && (
        <div className="flex gap-3 flex-wrap">
          <Button asChild className="flex-1">
            <a href={jobState.pdfUrl} download={jobState.filename}>
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href={jobState.pdfUrl} target="_blank" rel="noopener noreferrer">
              <FileText className="h-4 w-4 mr-2" />
              Preview
            </a>
          </Button>
          {productMeta && !saved && (
            <Button
              variant="secondary"
              onClick={handleSaveToLibrary}
              disabled={createProduct.isPending}
            >
              {createProduct.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Library className="h-4 w-4 mr-2" />
              )}
              Save to Library
            </Button>
          )}
          {saved && (
            <Button variant="secondary" disabled>
              <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
              Saved
            </Button>
          )}
        </div>
      )}

      {/* Cancel button */}
      {isGenerating && onCancel && (
        <Button variant="outline" size="sm" onClick={onCancel} className="w-full">
          Cancel
        </Button>
      )}
    </div>
  );
}
