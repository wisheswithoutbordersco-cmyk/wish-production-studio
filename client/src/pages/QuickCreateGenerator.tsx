import { useState } from "react";
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
import { Zap, Sparkles } from "lucide-react";

const PAGE_OPTIONS = [1, 2, 3, 4, 5, 10, 15, 20, 25, 30];

export default function QuickCreateGenerator() {
  const [prompt, setPrompt] = useState("");
  const [pageCount, setPageCount] = useState(5);
  const { jobState, isGenerating, progress, startJob, cancelJob } =
    useGenerationJob();

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    startJob("quick-create", {
      customPrompt: prompt.trim(),
      pageCount,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-400" />
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
              placeholder="e.g. A vibrant Mediterranean recipe book, a creative-writing workbook for adults, a 30-day fitness tracker, or a dinosaur multiplication worksheet for 3rd graders..."
              disabled={isGenerating}
              rows={5}
              className="min-h-32 resize-y border-white/15 bg-black text-white placeholder:text-white/40 focus-visible:border-white/40 focus-visible:ring-white/10"
            />
          </div>

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
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors border ${
                    pageCount === n
                      ? "bg-white text-black border-white"
                      : "bg-transparent text-white/70 border-white/20 hover:border-white/50 hover:text-white"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
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
        <CardContent>
          {!jobState && !isGenerating ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Zap className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Type your prompt and hit Generate</p>
            </div>
          ) : (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
