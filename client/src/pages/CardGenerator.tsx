import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Heart, Sparkles, Loader2, Download, FileText, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { CustomPromptField } from "@/components/CustomPromptField";

const OCCASIONS = [
  "Birthday", "Mother's Day", "Father's Day", "Graduation",
  "Christmas", "Kwanzaa", "Valentine's Day", "Thank You",
  "Get Well", "Congratulations", "Back to School", "New Baby",
  "Anniversary", "Retirement", "Sympathy",
];

const STYLES = [
  "Watercolor", "Modern Minimalist", "Vibrant Pop Art",
  "Elegant Floral", "African Heritage", "Caribbean Vibes",
  "Latino Culture", "Pan-Asian", "General Multicultural",
  "Whimsical Illustration", "Vintage Retro",
];

export default function CardGenerator() {
  const [customPrompt, setCustomPrompt] = useState("");
  const [occasion, setOccasion] = useState("Birthday");
  const [style, setStyle] = useState("Watercolor");
  const [message, setMessage] = useState("");
  const [customDetails, setCustomDetails] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<{ pdfUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/generate/card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customPrompt: customPrompt.trim() || undefined, occasion, style, message, customDetails }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Generation failed");
      }

      const data = await response.json();
      setResult(data);
      toast.success("Card generated successfully!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Form */}
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-primary" />
            Greeting Card Generator
          </CardTitle>
          <CardDescription>
            Generate print-ready 5x7 greeting cards with AI illustrations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <CustomPromptField
            value={customPrompt}
            onChange={setCustomPrompt}
            disabled={isGenerating}
          />

          <div className="space-y-2">
            <Label>Occasion</Label>
            <Select value={occasion} onValueChange={setOccasion}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {OCCASIONS.map(o => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Art Style</Label>
            <Select value={style} onValueChange={setStyle}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STYLES.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Inside Message (optional)</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Happy Birthday! Wishing you all the best..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Custom Details (optional)</Label>
            <Textarea
              value={customDetails}
              onChange={(e) => setCustomDetails(e.target.value)}
              placeholder="Include a rainbow, butterflies, etc."
              rows={2}
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full"
            size="lg"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {isGenerating ? "Generating Card..." : "Generate Greeting Card"}
          </Button>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Output Preview</CardTitle>
        </CardHeader>
        <CardContent>
          {isGenerating && (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Generating your card...</p>
              <Progress value={50} className="h-2 w-48" />
            </div>
          )}

          {!isGenerating && !result && !error && (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Heart className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Configure options and click Generate</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-3 p-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-white">
                <CheckCircle className="h-5 w-5" />
                <span className="text-sm font-medium">Card ready!</span>
              </div>
              <div className="flex gap-3">
                <Button asChild className="flex-1">
                  <a href={result.pdfUrl} download={`card-${occasion.toLowerCase()}.pdf`}>
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a href={result.pdfUrl} target="_blank" rel="noopener noreferrer">
                    <FileText className="h-4 w-4 mr-2" />
                    Preview
                  </a>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
