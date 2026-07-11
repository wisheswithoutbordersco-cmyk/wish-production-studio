import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { GenerationProgress } from "@/components/GenerationProgress";
import { useGenerationJob } from "@/hooks/useGenerationJob";
import { TreePine, Sparkles } from "lucide-react";
import { CustomPromptField } from "@/components/CustomPromptField";

const ACTIVITY_TYPES = [
  "Scavenger Hunt",
  "Nature Journal",
  "Outdoor Math",
  "Seasonal Explorer",
  "Bird/Plant ID Guide",
  "Weather Tracker",
  "Garden Planner",
];

const SEASONS = ["Spring", "Summer", "Fall", "Winter", "All Seasons"];

const BIOMES = [
  "Backyard",
  "Forest/Woodland",
  "Beach/Coastal",
  "Desert",
  "Mountain",
  "Wetland/Pond",
  "Urban Park",
  "Prairie/Grassland",
];

const AGE_RANGES = ["3-5", "5-7", "7-9", "9-12"];

const CULTURAL_CONNECTIONS = [
  "None",
  "African",
  "Indigenous/Native American",
  "East Asian",
  "South Asian",
  "Latin American",
  "Caribbean",
  "Pacific Islander",
];

export default function OutdoorLearningGenerator() {
  const [customPrompt, setCustomPrompt] = useState("");
  const [activityType, setActivityType] = useState("Scavenger Hunt");
  const [season, setSeason] = useState("All Seasons");
  const [biome, setBiome] = useState("Backyard");
  const [ageRange, setAgeRange] = useState("5-7");
  const [culturalConnection, setCulturalConnection] = useState("None");
  const [pageCount, setPageCount] = useState([8]);

  const { jobState, isGenerating, progress, startJob, cancelJob } = useGenerationJob();

  const handleGenerate = () => {
    startJob("outdoor-learning", {
      customPrompt: customPrompt.trim() || undefined,
      activityType,
      season,
      biome,
      ageRange,
      culturalConnection,
      pageCount: pageCount[0],
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TreePine className="h-5 w-5 text-primary" />
            Outdoor Learning Generator
          </CardTitle>
          <CardDescription>
            Generate scavenger hunts, nature journals, outdoor math, and seasonal explorer guides.
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
            <Label>Season</Label>
            <Select value={season} onValueChange={setSeason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEASONS.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Biome / Environment</Label>
            <Select value={biome} onValueChange={setBiome}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BIOMES.map(t => (
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
            <Label>Cultural Connection</Label>
            <Select value={culturalConnection} onValueChange={setCulturalConnection}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CULTURAL_CONNECTIONS.map(t => (
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
            {isGenerating ? "Generating..." : "Generate Outdoor Activity"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Output Preview</CardTitle>
        </CardHeader>
        <CardContent>
          {!jobState && !isGenerating ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <TreePine className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Configure options and click Generate</p>
            </div>
          ) : (
            <GenerationProgress
              jobState={jobState}
              isGenerating={isGenerating}
              progress={progress}
              onCancel={cancelJob}
              productMeta={{
                title: `Outdoor ${activityType} - ${biome} (${season})`,
                type: "Outdoor Learning",
                culturalVariant: culturalConnection !== "None" ? culturalConnection : undefined,
                ageRange,
                theme: biome,
                pageCount: pageCount[0],
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
