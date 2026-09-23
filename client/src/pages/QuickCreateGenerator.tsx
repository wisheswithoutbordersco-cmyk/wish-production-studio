import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GenerationProgress } from "@/components/GenerationProgress";
import { useGenerationJob } from "@/hooks/useGenerationJob";
import { Zap, Sparkles, Download } from "lucide-react";

const PAGE_OPTIONS = [1, 2, 3, 4, 5, 10, 15, 20, 25, 30];

const SIZE_OPTIONS = [
  { id: "8.5x11-portrait", label: "8.5×11 Portrait", aspectHint: "portrait" },
  {
    id: "8.5x11-landscape",
    label: "8.5×11 Landscape",
    aspectHint: "landscape",
  },
  { id: "11x14", label: "11×14", aspectHint: "portrait" },
  { id: "16x20", label: "16×20", aspectHint: "portrait" },
  { id: "10x10-square", label: "Square (10×10)", aspectHint: "square" },
] as const;

type SizePreset = (typeof SIZE_OPTIONS)[number]["id"];

export default function QuickCreateGenerator() {
  const [prompt, setPrompt] = useState("");
  const [pageCount, setPageCount] = useState(5);
  const [branding, setBranding] = useState<
    "WishesWithoutBordersCo" | "LaneDigitalWorks" | "none"
  >("none");
  const [outputStyle, setOutputStyle] = useState<"full-color" | "coloring">(
    "full-color"
  );
  const [sizePreset, setSizePreset] = useState<SizePreset>("8.5x11-portrait");
  const [showPageNumbers, setShowPageNumbers] = useState(false);
  const [upscale, setUpscale] = useState(true);
  // Whether the server has REPLICATE_API_TOKEN — checked via a lightweight env
  // endpoint if available; defaults to showing the toggle (server will ignore it
  // gracefully if the token is absent).
  const [replicateAvailable, setReplicateAvailable] = useState(true);

  const { jobState, isGenerating, progress, startJob, cancelJob } =
    useGenerationJob();

  // Check whether Replicate is configured on the server. The endpoint
  // GET /api/env-flags is a lightweight JSON response: { replicateEnabled: bool }.
  // If the endpoint doesn't exist the toggle stays visible (safe default).
  useEffect(() => {
    fetch("/api/env-flags")
      .then(r => (r.ok ? r.json() : null))
      .then((data: { replicateEnabled?: boolean } | null) => {
        if (data && data.replicateEnabled === false) {
          setReplicateAvailable(false);
          setUpscale(false);
        }
      })
      .catch(() => {
        /* endpoint absent — keep toggle visible */
      });
  }, []);

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    startJob("quick-create", {
      customPrompt: prompt.trim(),
      pageCount,
      branding,
      outputStyle,
      sizePreset,
      showPageNumbers,
      upscale,
    });
  };

  // Collect PNG download URLs from completed job page results
  const pngUrls: Array<{ pageNumber: number; url: string }> =
    jobState?.pageResults
      ?.filter(r => r.status === "success" && r.imageUrl)
      .map(r => ({ pageNumber: r.pageNumber, url: r.imageUrl })) ?? [];

  const toggleBtnClass =
    "studio-choice px-3 py-2 rounded-md text-sm font-medium transition-colors border disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Quick Create
          </CardTitle>
          <CardDescription>
            Describe any printable book, workbook, planner, tracker, guide, or
            activity product. Your request defines the format.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Prompt */}
          <div className="space-y-2">
            <Label htmlFor="quick-prompt" className="text-sm font-medium">
              What do you want to create?
            </Label>
            <Textarea
              id="quick-prompt"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. A vibrant Mediterranean recipe book..."
              disabled={isGenerating}
              rows={5}
              className="min-h-32 resize-y border-input bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/20"
            />
          </div>

          {/* Output Style Toggle */}
          <div className="space-y-2">
            <Label>Output Style</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "full-color", label: "Full color" },
                { id: "coloring", label: "Coloring" },
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setOutputStyle(opt.id as any)}
                  disabled={isGenerating}
                  aria-pressed={outputStyle === opt.id}
                  className={toggleBtnClass}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Size Preset */}
          <div className="space-y-2">
            <Label>Size</Label>
            <div className="flex flex-wrap gap-2">
              {SIZE_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSizePreset(opt.id)}
                  disabled={isGenerating}
                  aria-pressed={sizePreset === opt.id}
                  className={toggleBtnClass}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Brand Watermark Toggle */}
          <div className="space-y-2">
            <Label>Brand Watermark</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "WishesWithoutBordersCo", label: "WWB" },
                { id: "LaneDigitalWorks", label: "LDW" },
                { id: "none", label: "Off" },
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setBranding(opt.id as any)}
                  disabled={isGenerating}
                  aria-pressed={branding === opt.id}
                  className={toggleBtnClass}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Page Numbers Toggle */}
          <div className="space-y-2">
            <Label>Page Numbers</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "on", label: "On" },
                { id: "none", label: "Off" },
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setShowPageNumbers(opt.id === "on")}
                  disabled={isGenerating}
                  aria-pressed={showPageNumbers === (opt.id === "on")}
                  className={toggleBtnClass}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 4x Upscale Toggle — only shown when Replicate is configured */}
          {replicateAvailable && (
            <div className="space-y-2">
              <Label>
                4× Upscale{" "}
                <span className="text-muted-foreground text-xs font-normal">
                  (Real-ESRGAN · slower)
                </span>
              </Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "none", label: "Off" },
                  { id: "on", label: "On" },
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setUpscale(opt.id === "on")}
                    disabled={isGenerating}
                    aria-pressed={upscale === (opt.id === "on")}
                    className={toggleBtnClass}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Page Count Buttons */}
          <div className="space-y-2">
            <Label>Pages: {pageCount}</Label>
            <div className="flex flex-wrap gap-2">
              {PAGE_OPTIONS.map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPageCount(n)}
                  disabled={isGenerating}
                  aria-pressed={pageCount === n}
                  className={toggleBtnClass}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="w-full"
            size="lg"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {isGenerating
              ? "Generating..."
              : `Generate ${pageCount} Page${pageCount > 1 ? "s" : ""}`}
          </Button>
        </CardContent>
      </Card>

      {/* Output Preview */}
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Output Preview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!jobState && !isGenerating ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Zap className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Type your prompt and hit Generate</p>
            </div>
          ) : (
            <>
              <GenerationProgress
                jobState={jobState}
                isGenerating={isGenerating}
                progress={progress}
                onCancel={cancelJob}
                productMeta={{
                  title: prompt.slice(0, 60) || "Quick Create",
                  type: "Quick Create",
                  pageCount,
                }}
              />

              {/* Individual PNG download buttons — shown once pages start completing */}
              {pngUrls.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Download PNGs
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {pngUrls.map(({ pageNumber, url }) => (
                      <a
                        key={pageNumber}
                        href={url}
                        download={`page-${String(pageNumber).padStart(3, "0")}.png`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border border-input text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 transition-colors"
                      >
                        <Download className="h-3 w-3" />
                        PNG {pageNumber}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Prompt recap shown under preview once generation completes */}
              {jobState?.status === "complete" && prompt && (
                <p className="text-xs text-muted-foreground italic border-t border-border pt-2 line-clamp-3">
                  {prompt}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
