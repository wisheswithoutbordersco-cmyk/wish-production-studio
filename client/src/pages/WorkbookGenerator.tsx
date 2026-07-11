import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { BookOpen, Sparkles } from "lucide-react";
import { useGenerationJob } from "@/hooks/useGenerationJob";
import { GenerationProgress } from "@/components/GenerationProgress";
import { CustomPromptField } from "@/components/CustomPromptField";

const SUBJECTS = [
  "Math", "Reading", "Writing", "Science", "Social Studies",
  "Art", "SEL/Emotions", "Back to School", "Summer Review",
];

const GRADE_LEVELS = [
  "Pre-K", "Kindergarten", "1st Grade", "2nd Grade",
  "3rd Grade", "4th Grade", "5th Grade",
];

const THEMES = [
  "Multicultural Kids", "African Heritage", "Caribbean Fun",
  "Space Adventure", "Ocean Explorer", "Jungle Safari", "Dinosaurs",
];

export default function WorkbookGenerator() {
  const [customPrompt, setCustomPrompt] = useState("");
  const [subject, setSubject] = useState("Math");
  const [gradeLevel, setGradeLevel] = useState("1st Grade");
  const [pageCount, setPageCount] = useState([15]);
  const [theme, setTheme] = useState("Multicultural Kids");
  const [coverTitle, setCoverTitle] = useState("");
  const [authorName, setAuthorName] = useState("Wishes Without Borders Co");
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true);
  const [includeLicensePage, setIncludeLicensePage] = useState(true);

  const { jobState, isGenerating, progress, startJob, cancelJob } = useGenerationJob();

  const handleGenerate = () => {
    startJob("workbook", {
      customPrompt: customPrompt.trim() || undefined,
      subject,
      gradeLevel,
      pageCount: pageCount[0],
      theme,
      coverTitle: coverTitle || `${subject} Workbook`,
      authorName,
      includeAnswerKey,
      includeLicensePage,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Form */}
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Workbook Generator
          </CardTitle>
          <CardDescription>
            Generate multi-page educational activity workbooks with AI illustrations.
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
                {SUBJECTS.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Grade Level</Label>
            <Select value={gradeLevel} onValueChange={setGradeLevel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {GRADE_LEVELS.map(g => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
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
            <Label>Cover Title</Label>
            <Input
              value={coverTitle}
              onChange={(e) => setCoverTitle(e.target.value)}
              placeholder={`${subject} Workbook`}
            />
          </div>

          <div className="space-y-2">
            <Label>Author Name</Label>
            <Input
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
            />
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

          <div className="flex items-center justify-between">
            <Label>Include Answer Key</Label>
            <Switch checked={includeAnswerKey} onCheckedChange={setIncludeAnswerKey} />
          </div>

          <div className="flex items-center justify-between">
            <Label>Include License Page</Label>
            <Switch checked={includeLicensePage} onCheckedChange={setIncludeLicensePage} />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full"
            size="lg"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {isGenerating ? "Generating..." : "Generate Workbook"}
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
              <BookOpen className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Configure options and click Generate</p>
            </div>
          ) : (
            <GenerationProgress
              jobState={jobState}
              isGenerating={isGenerating}
              progress={progress}
              onCancel={cancelJob}
              productMeta={{
                title: `${coverTitle || subject + " Workbook"} (${gradeLevel})`,
                type: "Workbook",
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
