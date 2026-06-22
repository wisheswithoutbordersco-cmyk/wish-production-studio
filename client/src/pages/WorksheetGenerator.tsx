import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { GenerationProgress } from "@/components/GenerationProgress";
import { useGenerationJob } from "@/hooks/useGenerationJob";
import { FileText, Sparkles } from "lucide-react";

const SUBJECTS = [
  "Math",
  "Reading",
  "Writing",
  "Science",
  "Social Studies",
  "Art",
  "Music",
  "SEL",
];

const SKILLS_MAP: Record<string, string[]> = {
  "Math": ["Addition", "Subtraction", "Multiplication", "Division", "Fractions", "Telling Time", "Money", "Patterns", "Geometry", "Word Problems"],
  "Reading": ["Phonics", "Sight Words", "Reading Comprehension", "Vocabulary", "Sequencing", "Main Idea", "Context Clues"],
  "Writing": ["Handwriting", "Sentence Building", "Creative Writing", "Punctuation", "Grammar", "Spelling", "Paragraph Writing"],
  "Science": ["Life Cycles", "Weather", "Animals", "Plants", "Human Body", "Space", "Matter", "Energy"],
  "Social Studies": ["Community Helpers", "Maps", "History", "Culture", "Geography", "Government", "Economics"],
  "Art": ["Color Theory", "Drawing", "Patterns", "Symmetry", "Art History", "Mixed Media"],
  "Music": ["Rhythm", "Notes", "Instruments", "Composers", "Listening", "Singing"],
  "SEL": ["Emotions", "Friendship", "Kindness", "Self-Regulation", "Empathy", "Conflict Resolution", "Growth Mindset"],
};

const GRADE_LEVELS = [
  "Pre-K",
  "Kindergarten",
  "1st Grade",
  "2nd Grade",
  "3rd Grade",
  "4th Grade",
  "5th Grade",
];

const THEMES = [
  "Animals", "Space", "Ocean", "Dinosaurs", "Nature",
  "Vehicles", "Food", "Sports", "Music", "Flowers",
  "Seasons", "Holidays", "Cultural Heritage",
];

export default function WorksheetGenerator() {
  const [subject, setSubject] = useState("Math");
  const [specificSkill, setSpecificSkill] = useState("Addition");
  const [gradeLevel, setGradeLevel] = useState("1st Grade");
  const [theme, setTheme] = useState("Animals");
  const [quantity, setQuantity] = useState([5]);

  const { jobState, isGenerating, progress, startJob, cancelJob } = useGenerationJob();

  const availableSkills = useMemo(() => SKILLS_MAP[subject] || [], [subject]);

  const handleSubjectChange = (newSubject: string) => {
    setSubject(newSubject);
    const skills = SKILLS_MAP[newSubject] || [];
    if (skills.length > 0 && !skills.includes(specificSkill)) {
      setSpecificSkill(skills[0]);
    }
  };

  const handleGenerate = () => {
    startJob("worksheet", {
      subject,
      specificSkill,
      gradeLevel,
      theme,
      quantity: quantity[0],
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Worksheet Generator
          </CardTitle>
          <CardDescription>
            Generate single-page educational worksheets with decorative AI borders. Batch generation supported.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Subject</Label>
            <Select value={subject} onValueChange={handleSubjectChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUBJECTS.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Specific Skill</Label>
            <Select value={specificSkill} onValueChange={setSpecificSkill}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableSkills.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Grade Level</Label>
            <Select value={gradeLevel} onValueChange={setGradeLevel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {GRADE_LEVELS.map(t => (
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
            <Label>Quantity: {quantity[0]} worksheet{quantity[0] > 1 ? "s" : ""}</Label>
            <Slider
              value={quantity}
              onValueChange={setQuantity}
              min={1}
              max={20}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1</span>
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
            {isGenerating ? "Generating..." : `Generate ${quantity[0]} Worksheet${quantity[0] > 1 ? "s" : ""}`}
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
              <FileText className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Configure options and click Generate</p>
            </div>
          ) : (
            <GenerationProgress
              jobState={jobState}
              isGenerating={isGenerating}
              progress={progress}
              onCancel={cancelJob}
              productMeta={{
                title: `${subject} Worksheet - ${specificSkill} (${gradeLevel})`,
                type: "Worksheet",
                theme,
                ageRange: gradeLevel,
                pageCount: quantity[0],
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
