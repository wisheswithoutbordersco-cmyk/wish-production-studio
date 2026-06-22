import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Palette, Sparkles } from "lucide-react";
import { useGenerationJob } from "@/hooks/useGenerationJob";
import { GenerationProgress } from "@/components/GenerationProgress";

const THEMES = [
  "Animals", "Dinosaurs", "Ocean Life", "Space", "Fairy Tales",
  "Vehicles", "Food", "Holidays", "African Culture",
  "Caribbean Life", "World Cultures",
];

const AGE_RANGES = [
  { value: "2-4 Toddler", label: "2-4 (Toddler)" },
  { value: "4-6 Preschool", label: "4-6 (Preschool)" },
  { value: "6-8 Elementary", label: "6-8 (Elementary)" },
  { value: "8-12 Tweens", label: "8-12 (Tweens)" },
];

const DETAIL_LEVELS = [
  { value: "kids", label: "Kids (ages 3-7) — Simple bold outlines" },
  { value: "tweens", label: "Tweens (ages 8-12) — Moderate detail" },
  { value: "adults", label: "Adults — Intricate patterns" },
];

export default function ColoringBookGenerator() {
  const [theme, setTheme] = useState("Animals");
  const [ageRange, setAgeRange] = useState("4-6 Preschool");
  const [pageCount, setPageCount] = useState([15]);
  const [detailLevel, setDetailLevel] = useState("kids");

  const { jobState, isGenerating, progress, startJob, cancelJob } = useGenerationJob();

  const handleGenerate = () => {
    startJob("coloring-book", {
      theme,
      ageRange,
      pageCount: pageCount[0],
      detailLevel,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Form */}
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Coloring Book Generator
          </CardTitle>
          <CardDescription>
            Generate black-and-white line art coloring pages as a multi-page PDF.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Theme</Label>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {THEMES.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Age Range</Label>
            <Select value={ageRange} onValueChange={setAgeRange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AGE_RANGES.map(a => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Detail Level</Label>
            <Select value={detailLevel} onValueChange={setDetailLevel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DETAIL_LEVELS.map(d => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Page Count: {pageCount[0]}</Label>
            <Slider
              value={pageCount}
              onValueChange={setPageCount}
              min={10}
              max={30}
              step={5}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>10</span>
              <span>30</span>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full"
            size="lg"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {isGenerating ? "Generating..." : "Generate Coloring Book"}
          </Button>
        </CardContent>
      </Card>

      {/* Progress & Preview */}
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Output Preview</CardTitle>
        </CardHeader>
        <CardContent>
          {!jobState && !isGenerating ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Palette className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Configure options and click Generate</p>
            </div>
          ) : (
            <GenerationProgress
              jobState={jobState}
              isGenerating={isGenerating}
              progress={progress}
              onCancel={cancelJob}
              productMeta={{
                title: `Coloring Book - ${theme} (${ageRange})`,
                type: "Coloring Book",
                ageRange,
                theme,
                pageCount: pageCount[0],
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
