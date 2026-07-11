import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { GenerationProgress } from "@/components/GenerationProgress";
import { useGenerationJob } from "@/hooks/useGenerationJob";
import { Layers, Sparkles } from "lucide-react";
import { CustomPromptField } from "@/components/CustomPromptField";

const SUBJECTS = [
  "Alphabet",
  "Numbers",
  "Colors",
  "Shapes",
  "Animals",
  "Food",
  "Body Parts",
  "Emotions",
  "Actions/Verbs",
  "Sight Words",
];

const LANGUAGES = [
  "English Only",
  "English + Spanish",
  "English + French",
  "English + Mandarin",
  "English + Arabic",
  "English + Swahili",
  "English + Hindi",
  "English + Portuguese",
  "English + Japanese",
  "English + Korean",
];

const STYLES = [
  "Realistic Illustrations",
  "Cartoon",
  "Watercolor",
  "Bold and Simple",
  "Montessori-style",
];

const CARD_SIZES = [
  "Standard (3x5)",
  "Large (4x6)",
  "Mini (2.5x3.5)",
];

export default function FlashcardGenerator() {
  const [customPrompt, setCustomPrompt] = useState("");
  const [subject, setSubject] = useState("Animals");
  const [languages, setLanguages] = useState("English + Spanish");
  const [style, setStyle] = useState("Bold and Simple");
  const [cardsPerSet, setCardsPerSet] = useState([12]);
  const [cardSize, setCardSize] = useState("Standard (3x5)");

  const { jobState, isGenerating, progress, startJob, cancelJob } = useGenerationJob();

  const handleGenerate = () => {
    startJob("flashcard", {
      customPrompt: customPrompt.trim() || undefined,
      subject,
      languages,
      style,
      cardsPerSet: cardsPerSet[0],
      cardSize,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Flashcard Generator
          </CardTitle>
          <CardDescription>
            Generate bilingual flashcard sets with AI illustrations. Perfect for early learners.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <CustomPromptField
            value={customPrompt}
            onChange={setCustomPrompt}
            disabled={isGenerating}
          />

          <div className="space-y-2">
            <Label>Subject</Label>
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUBJECTS.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Languages</Label>
            <Select value={languages} onValueChange={setLanguages}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANGUAGES.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Illustration Style</Label>
            <Select value={style} onValueChange={setStyle}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STYLES.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Card Size</Label>
            <Select value={cardSize} onValueChange={setCardSize}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CARD_SIZES.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Cards Per Set: {cardsPerSet[0]}</Label>
            <Slider
              value={cardsPerSet}
              onValueChange={setCardsPerSet}
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
            {isGenerating ? "Generating..." : "Generate Flashcard Set"}
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
              <Layers className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Configure options and click Generate</p>
            </div>
          ) : (
            <GenerationProgress
              jobState={jobState}
              isGenerating={isGenerating}
              progress={progress}
              onCancel={cancelJob}
              productMeta={{
                title: `Flashcards - ${subject} (${languages})`,
                type: "Flashcard",
                theme: subject,
                pageCount: Math.ceil(cardsPerSet[0] / 4),
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
