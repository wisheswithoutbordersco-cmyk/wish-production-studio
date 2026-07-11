import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { GenerationProgress } from "@/components/GenerationProgress";
import { useGenerationJob } from "@/hooks/useGenerationJob";
import { Brain, Sparkles } from "lucide-react";
import { CustomPromptField } from "@/components/CustomPromptField";

const ACTIVITY_TYPES = [
  "Bilateral Coordination",
  "Stroke Practice",
  "Fine Motor",
];

const THEMES = [
  "Animals", "Space", "Ocean", "Dinosaurs", "Nature",
  "Vehicles", "Food", "Sports", "Music", "Flowers",
];

const CULTURAL_VARIANTS = [
  "None", "African", "Caribbean", "South Asian", "East Asian",
  "Latin American", "Middle Eastern", "Indigenous/Native American",
];

const AGE_RANGES = ["3-4", "4-5", "5-6", "6-7", "7-8", "8-10"];

const DIFFICULTIES = ["Easy", "Medium", "Hard", "Progressive"];

export default function BrainTrainingGenerator() {
  const [customPrompt, setCustomPrompt] = useState("");
  const [activityType, setActivityType] = useState("Bilateral Coordination");
  const [theme, setTheme] = useState("Animals");
  const [culturalVariant, setCulturalVariant] = useState("None");
  const [ageRange, setAgeRange] = useState("5-6");
  const [pageCount, setPageCount] = useState([10]);
  const [difficulty, setDifficulty] = useState("Medium");

  const { jobState, isGenerating, progress, startJob, cancelJob } = useGenerationJob();

  const handleGenerate = () => {
    startJob("brain-training", {
      customPrompt: customPrompt.trim() || undefined,
      activityType,
      theme,
      culturalVariant,
      ageRange,
      pageCount: pageCount[0],
      difficulty,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Form */}
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Brain Training Generator
          </CardTitle>
          <CardDescription>
            Generate bilateral coordination, stroke practice, and fine motor skills worksheets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <CustomPromptField
            value={customPrompt}
            onChange={setCustomPrompt}
            disabled={isGenerating}
          />

          <div className="space-y-2">
            <Label>Activity Type</Label>
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPES.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
            <Label>Cultural Variant</Label>
            <Select value={culturalVariant} onValueChange={setCulturalVariant}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CULTURAL_VARIANTS.map(t => (
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
                {AGE_RANGES.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Difficulty</Label>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DIFFICULTIES.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Page Count: {pageCount[0]}</Label>
            <Slider
              value={pageCount}
              onValueChange={setPageCount}
              min={1}
              max={30}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1</span>
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
            {isGenerating ? "Generating..." : "Generate Brain Training Workbook"}
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
              <Brain className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Configure options and click Generate</p>
            </div>
          ) : (
            <GenerationProgress
              jobState={jobState}
              isGenerating={isGenerating}
              progress={progress}
              onCancel={cancelJob}
              productMeta={{
                title: `Brain Training - ${activityType} (${theme})`,
                type: "Brain Training",
                culturalVariant: culturalVariant !== "None" ? culturalVariant : undefined,
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
