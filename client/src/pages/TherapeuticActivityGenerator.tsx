import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { GenerationProgress } from "@/components/GenerationProgress";
import { useGenerationJob } from "@/hooks/useGenerationJob";
import { Heart, Sparkles } from "lucide-react";

const ACTIVITY_TYPES = [
  "Visual Schedule",
  "Calm-Down Kit",
  "Sensory Activity",
  "Emotional Regulation",
  "Executive Function",
  "Social Stories",
  "Fidget Alternatives",
  "Routine Cards",
];

const TARGETS = [
  "ADHD",
  "Autism/ASD",
  "Anxiety",
  "Sensory Processing",
  "General Self-Regulation",
  "OT (Occupational Therapy) Support",
];

const REPRESENTATIONS = [
  "Mixed/Diverse",
  "African American",
  "Hispanic/Latino",
  "Asian American",
  "South Asian",
  "Middle Eastern",
  "Indigenous/Native American",
  "No specific",
];

const AGE_RANGES = ["3-5", "5-7", "7-9", "9-12", "13+"];

export default function TherapeuticActivityGenerator() {
  const [activityType, setActivityType] = useState("Visual Schedule");
  const [target, setTarget] = useState("General Self-Regulation");
  const [representation, setRepresentation] = useState("Mixed/Diverse");
  const [ageRange, setAgeRange] = useState("5-7");
  const [pageCount, setPageCount] = useState([8]);

  const { jobState, isGenerating, progress, startJob, cancelJob } = useGenerationJob();

  const handleGenerate = () => {
    startJob("therapeutic-activity", {
      activityType,
      target,
      representation,
      ageRange,
      pageCount: pageCount[0],
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-primary" />
            Therapeutic Activity Generator
          </CardTitle>
          <CardDescription>
            Generate neurodivergent-friendly activities, visual schedules, calm-down kits, and sensory tools.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
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
            <Label>Target Audience</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TARGETS.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Representation</Label>
            <Select value={representation} onValueChange={setRepresentation}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPRESENTATIONS.map(t => (
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
            <Label>Page Count: {pageCount[0]}</Label>
            <Slider
              value={pageCount}
              onValueChange={setPageCount}
              min={4}
              max={20}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>4</span>
              <span>20</span>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full"
            size="lg"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {isGenerating ? "Generating..." : "Generate Therapeutic Activity"}
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
              <Heart className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Configure options and click Generate</p>
            </div>
          ) : (
            <GenerationProgress
              jobState={jobState}
              isGenerating={isGenerating}
              progress={progress}
              onCancel={cancelJob}
              productMeta={{
                title: `Therapeutic ${activityType} - ${target}`,
                type: "Therapeutic Activity",
                culturalVariant: representation,
                ageRange,
                theme: activityType,
                pageCount: pageCount[0],
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
