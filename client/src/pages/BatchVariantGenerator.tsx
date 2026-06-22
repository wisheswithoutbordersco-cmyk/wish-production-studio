import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { GenerationProgress } from "@/components/GenerationProgress";
import { useGenerationJob } from "@/hooks/useGenerationJob";
import { Copy, Sparkles } from "lucide-react";

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

const VARIANT_DESCRIPTIONS: Record<string, string> = {
  "Cultural": "African, Caribbean, South Asian, East Asian, Latin American, Middle Eastern",
  "Theme": "Animals, Space, Ocean, Dinosaurs, Nature, Vehicles, Food, Sports, Music, Cultural Heritage",
  "Age": "3-4, 4-5, 5-6, 6-7, 7-8",
  "Difficulty": "Easy, Medium, Hard, Progressive",
  "Seasonal": "Spring, Summer, Fall, Winter, All Seasons",
};

export default function BatchVariantGenerator() {
  const [baseProductType, setBaseProductType] = useState("Brain Training");
  const [baseConcept, setBaseConcept] = useState("");
  const [variantType, setVariantType] = useState("Cultural");
  const [pagesPerVariant, setPagesPerVariant] = useState([5]);

  const { jobState, isGenerating, progress, startJob, cancelJob } = useGenerationJob();

  const handleGenerate = () => {
    startJob("batch-variant", {
      baseProductType,
      baseConcept,
      variantType,
      pagesPerVariant: pagesPerVariant[0],
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
            Auto-generate 5-10 complete PDF variants across cultural, theme, age, difficulty, or seasonal dimensions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
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
              Will generate: {VARIANT_DESCRIPTIONS[variantType]}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Pages Per Variant: {pagesPerVariant[0]}</Label>
            <Slider
              value={pagesPerVariant}
              onValueChange={setPagesPerVariant}
              min={3}
              max={15}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>3</span>
              <span>15</span>
            </div>
          </div>

          <div className="rounded-md bg-secondary/50 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Batch Summary</p>
            <p>This will generate {VARIANT_DESCRIPTIONS[variantType]?.split(", ").length || 5} variants</p>
            <p>{pagesPerVariant[0]} pages each = ~{(VARIANT_DESCRIPTIONS[variantType]?.split(", ").length || 5) * pagesPerVariant[0]} total pages</p>
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
              {/* Variant-specific progress */}
              {jobState?.variantJobs && jobState.variantJobs.length > 0 && (
                <div className="space-y-2 mt-4">
                  <p className="text-xs font-medium text-muted-foreground">Variant Status:</p>
                  {jobState.variantJobs.map((v, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/50">
                      <span className="text-foreground">{v.variant}</span>
                      <span className={`font-medium ${
                        v.status === "complete" || v.status === "generating" ? "text-green-500" :
                        v.status === "error" ? "text-destructive" : "text-muted-foreground"
                      }`}>
                        {v.status}
                      </span>
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
