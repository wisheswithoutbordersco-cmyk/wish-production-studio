import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { GenerationProgress } from "@/components/GenerationProgress";
import { useGenerationJob } from "@/hooks/useGenerationJob";
import { Copy, Download, Sparkles } from "lucide-react";
import { CustomPromptField } from "@/components/CustomPromptField";

const BASE_PRODUCT_TYPES = [
  "Brain Training",
  "Cultural Game",
  "Flashcard",
  "Worksheet",
  "Outdoor Learning",
  "Therapeutic Activity",
];

const VARIANT_TYPES = [
  "Cultural",
  "Theme",
  "Age",
  "Difficulty",
  "Seasonal",
];

const PAGE_COUNT_OPTIONS = [1, 3, 5, 10, 15, 20, 25, 30];

const VARIANT_DESCRIPTIONS: Record<string, string> = {
  "Cultural": "African, Caribbean, South Asian, East Asian, Latin American, Middle Eastern",
  "Theme": "Animals, Space, Ocean, Dinosaurs, Nature, Vehicles, Food, Sports, Music, Cultural Heritage",
  "Age": "3-4, 4-5, 5-6, 6-7, 7-8",
  "Difficulty": "Easy, Medium, Hard, Progressive",
  "Seasonal": "Spring, Summer, Fall, Winter, All Seasons",
};

export default function BatchVariantGenerator() {
  const [customPrompt, setCustomPrompt] = useState("");
  const [baseProductType, setBaseProductType] = useState("Brain Training");
  const [baseConcept, setBaseConcept] = useState("");
  const [variantType, setVariantType] = useState("Cultural");
  const [pagesPerVariant, setPagesPerVariant] = useState(5);

  const { jobState, isGenerating, progress, startJob, cancelJob } = useGenerationJob();
  const hasCustomPrompt = Boolean(customPrompt.trim());
  const presetVariantCount = VARIANT_DESCRIPTIONS[variantType]?.split(", ").length || 5;

  const handleGenerate = () => {
    startJob("batch-variant", {
      customPrompt: customPrompt.trim() || undefined,
      baseProductType,
      baseConcept,
      variantType,
      pagesPerVariant,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-primary" />
            Batch Variant Generator
          </CardTitle>
          <CardDescription>
            Auto-generate complete PDF variants across cultural, theme, age, difficulty, seasonal, or custom playlist directions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <CustomPromptField
            value={customPrompt}
            onChange={setCustomPrompt}
            disabled={isGenerating}
          />

          <div className="space-y-2">
            <Label>Base Product Type</Label>
            <Select value={baseProductType} onValueChange={setBaseProductType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BASE_PRODUCT_TYPES.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Base Concept / Description</Label>
            <Input
              placeholder="e.g., Mirror drawing exercises, Animal trivia..."
              value={baseConcept}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBaseConcept(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Describe what the product should be about</p>
          </div>

          <div className="space-y-2">
            <Label>Variant Dimension</Label>
            <Select value={variantType} onValueChange={setVariantType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VARIANT_TYPES.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {hasCustomPrompt
                ? "Your custom prompt overrides this preset list; its playlist items become the variants."
                : `Will generate: ${VARIANT_DESCRIPTIONS[variantType]}`}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Pages Per Variant</Label>
            <Select
              value={String(pagesPerVariant)}
              onValueChange={(value) => setPagesPerVariant(Number(value))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_COUNT_OPTIONS.map(count => (
                  <SelectItem key={count} value={String(count)}>{count}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md bg-secondary/50 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Batch Summary</p>
            {hasCustomPrompt ? (
              <>
                <p>Variants will be extracted from the custom prompt playlist</p>
                <p>{pagesPerVariant} pages per extracted variant</p>
              </>
            ) : (
              <>
                <p>This will generate {presetVariantCount} variants</p>
                <p>{pagesPerVariant} pages each = ~{presetVariantCount * pagesPerVariant} total pages</p>
              </>
            )}
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full"
            size="lg"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {isGenerating ? "Generating Variants..." : "Generate All Variants"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Batch Progress</CardTitle>
        </CardHeader>
        <CardContent>
          {!jobState && !isGenerating ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Copy className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Configure options and click Generate</p>
            </div>
          ) : (
            <div className="space-y-4">
              <GenerationProgress
                jobState={jobState}
                isGenerating={isGenerating}
                progress={progress}
                onCancel={cancelJob}
              />

              {jobState?.variantJobs && jobState.variantJobs.length > 0 && (
                <div className="space-y-2 mt-4">
                  <p className="text-xs font-medium text-muted-foreground">Variant Status:</p>
                  {jobState.variantJobs.map((variantJob) => (
                    <div key={variantJob.jobId || variantJob.variant} className="flex items-center justify-between text-xs py-1 border-b border-border/50">
                      <span className="text-foreground">{variantJob.variant}</span>
                      <span className={`font-medium ${
                        variantJob.status === "complete" || variantJob.status === "partial" || variantJob.status === "generating" ? "text-white" :
                        variantJob.status === "error" ? "text-destructive" : "text-muted-foreground"
                      }`}>
                        {variantJob.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {jobState?.variantPdfUrls && jobState.variantPdfUrls.length > 0 && (
                <div className="space-y-2 mt-4">
                  <p className="text-xs font-medium text-muted-foreground">Variant Downloads:</p>
                  {jobState.variantPdfUrls.map((variantPdf) => (
                    <div key={`${variantPdf.variant}-${variantPdf.pdfUrl}`} className="flex items-center justify-between gap-3 py-2 border-b border-border/50">
                      <span className="text-sm text-foreground">{variantPdf.variant}</span>
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={variantPdf.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={variantPdf.filename || undefined}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download PDF
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
