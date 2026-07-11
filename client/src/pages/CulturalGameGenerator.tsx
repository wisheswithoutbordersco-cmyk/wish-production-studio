import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { GenerationProgress } from "@/components/GenerationProgress";
import { useGenerationJob } from "@/hooks/useGenerationJob";
import { Gamepad2, Sparkles } from "lucide-react";
import { CustomPromptField } from "@/components/CustomPromptField";

const GAME_TYPES = [
  "Trivia Cards",
  "Party Games",
  "Conversation Starters",
  "Quiz Pack",
  "Bingo",
  "Would You Rather",
];

const CULTURAL_EDITIONS = [
  "African American Heritage",
  "Caribbean Culture",
  "Latin American Heritage",
  "South Asian Culture",
  "East Asian Heritage",
  "Middle Eastern Culture",
  "Indigenous/Native American",
  "Pan-African",
  "General Knowledge",
  "World Cultures Mix",
];

const OCCASIONS = [
  "Family Game Night",
  "Classroom Activity",
  "Birthday Party",
  "Holiday Celebration",
  "Cultural Heritage Month",
  "Community Event",
  "Road Trip",
  "Icebreaker",
];

const AGE_GROUPS = [
  "Kids (5-8)",
  "Tweens (9-12)",
  "Teens (13-17)",
  "Family (all ages)",
  "Adults",
];

export default function CulturalGameGenerator() {
  const [customPrompt, setCustomPrompt] = useState("");
  const [gameType, setGameType] = useState("Trivia Cards");
  const [culturalEdition, setCulturalEdition] = useState("African American Heritage");
  const [occasion, setOccasion] = useState("Family Game Night");
  const [cardCount, setCardCount] = useState([20]);
  const [ageAppropriate, setAgeAppropriate] = useState("Family (all ages)");

  const { jobState, isGenerating, progress, startJob, cancelJob } = useGenerationJob();

  const handleGenerate = () => {
    startJob("cultural-game", {
      customPrompt: customPrompt.trim() || undefined,
      gameType,
      culturalEdition,
      occasion,
      cardCount: cardCount[0],
      ageAppropriate,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gamepad2 className="h-5 w-5 text-primary" />
            Cultural Game Generator
          </CardTitle>
          <CardDescription>
            Generate trivia cards, party games, conversation starters, quiz packs, bingo, and Would You Rather sets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <CustomPromptField
            value={customPrompt}
            onChange={setCustomPrompt}
            disabled={isGenerating}
          />

          <div className="space-y-2">
            <Label>Game Type</Label>
            <Select value={gameType} onValueChange={setGameType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {GAME_TYPES.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Cultural Edition</Label>
            <Select value={culturalEdition} onValueChange={setCulturalEdition}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CULTURAL_EDITIONS.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Occasion</Label>
            <Select value={occasion} onValueChange={setOccasion}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {OCCASIONS.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Age Group</Label>
            <Select value={ageAppropriate} onValueChange={setAgeAppropriate}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AGE_GROUPS.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Number of Cards: {cardCount[0]}</Label>
            <Slider
              value={cardCount}
              onValueChange={setCardCount}
              min={8}
              max={48}
              step={4}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>8</span>
              <span>48</span>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full"
            size="lg"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {isGenerating ? "Generating..." : "Generate Game Cards"}
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
              <Gamepad2 className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Configure options and click Generate</p>
            </div>
          ) : (
            <GenerationProgress
              jobState={jobState}
              isGenerating={isGenerating}
              progress={progress}
              onCancel={cancelJob}
              productMeta={{
                title: `${gameType} - ${culturalEdition}`,
                type: "Cultural Game",
                culturalVariant: culturalEdition,
                ageRange: ageAppropriate,
                theme: occasion,
                pageCount: Math.ceil(cardCount[0] / 4),
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
