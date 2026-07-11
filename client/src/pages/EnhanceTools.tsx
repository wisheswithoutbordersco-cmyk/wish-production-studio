import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wand2, Upload, Loader2, Download, ArrowUpCircle, Paintbrush, Sparkles, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { CustomPromptField } from "@/components/CustomPromptField";

const RESTYLE_OPTIONS = [
  "Watercolor", "Oil Painting", "Pencil Sketch", "Pop Art",
  "Anime/Manga", "Pixel Art", "Stained Glass", "Art Nouveau",
  "Impressionist", "Comic Book", "Minimalist Line Art",
];

export default function EnhanceTools() {
  const [customPrompt, setCustomPrompt] = useState("");
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restyleOption, setRestyleOption] = useState("Watercolor");
  const [reimaginePrompt, setReimaginePrompt] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setResultUrl(null);

    try {
      // Create preview
      const reader = new FileReader();
      reader.onload = () => setUploadedImagePreview(reader.result as string);
      reader.readAsDataURL(file);

      // Upload to server
      const base64 = await fileToBase64(file);
      const response = await fetch("/api/upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: base64,
          contentType: file.type,
          filename: file.name,
        }),
      });

      if (!response.ok) throw new Error("Upload failed");
      const { url } = await response.json();
      setUploadedImageUrl(url);
      toast.success("Image uploaded!");
    } catch (err) {
      setError("Failed to upload image");
      toast.error("Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleUpscale = async () => {
    if (!uploadedImageUrl) return;
    setIsProcessing(true);
    setError(null);
    setResultUrl(null);

    try {
      const response = await fetch("/api/enhance/upscale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: uploadedImageUrl,
          customPrompt: customPrompt.trim() || undefined,
        }),
      });
      if (!response.ok) throw new Error("Upscale failed");
      const { imageUrl } = await response.json();
      setResultUrl(imageUrl);
      toast.success("Image upscaled!");
    } catch (err) {
      setError("Upscale failed. Please try again.");
      toast.error("Upscale failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestyle = async () => {
    if (!uploadedImageUrl) return;
    setIsProcessing(true);
    setError(null);
    setResultUrl(null);

    try {
      const response = await fetch("/api/enhance/restyle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: uploadedImageUrl,
          style: restyleOption,
          customPrompt: customPrompt.trim() || undefined,
        }),
      });
      if (!response.ok) throw new Error("Restyle failed");
      const { imageUrl } = await response.json();
      setResultUrl(imageUrl);
      toast.success("Image restyled!");
    } catch (err) {
      setError("Restyle failed. Please try again.");
      toast.error("Restyle failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReimagine = async () => {
    if (!uploadedImageUrl || !reimaginePrompt) return;
    setIsProcessing(true);
    setError(null);
    setResultUrl(null);

    try {
      const response = await fetch("/api/enhance/reimagine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: uploadedImageUrl,
          prompt: reimaginePrompt,
          customPrompt: customPrompt.trim() || undefined,
        }),
      });
      if (!response.ok) throw new Error("Reimagine failed");
      const { imageUrl } = await response.json();
      setResultUrl(imageUrl);
      toast.success("Image reimagined!");
    } catch (err) {
      setError("Reimagine failed. Please try again.");
      toast.error("Reimagine failed");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Controls */}
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Enhance Tools
          </CardTitle>
          <CardDescription>
            Upscale, restyle, or reimagine any image using AI.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <CustomPromptField
            value={customPrompt}
            onChange={setCustomPrompt}
            disabled={isUploading || isProcessing}
          />

          {/* Upload Area */}
          <div className="space-y-2">
            <Label>Upload Image</Label>
            <div
              className="border-2 border-dashed border-border/60 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadedImagePreview ? (
                <img
                  src={uploadedImagePreview}
                  alt="Uploaded"
                  className="max-h-32 mx-auto rounded"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Upload className="h-8 w-8" />
                  <p className="text-sm">Click to upload an image</p>
                </div>
              )}
              {isUploading && <Loader2 className="h-5 w-5 animate-spin mx-auto mt-2" />}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          {/* Enhancement Options */}
          <Tabs defaultValue="upscale" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="upscale">Upscale</TabsTrigger>
              <TabsTrigger value="restyle">Restyle</TabsTrigger>
              <TabsTrigger value="reimagine">Reimagine</TabsTrigger>
            </TabsList>

            <TabsContent value="upscale" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Enhance resolution and clarity for print-quality output.
              </p>
              <Button
                onClick={handleUpscale}
                disabled={!uploadedImageUrl || isProcessing}
                className="w-full"
              >
                {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowUpCircle className="h-4 w-4 mr-2" />}
                Upscale Image
              </Button>
            </TabsContent>

            <TabsContent value="restyle" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Target Style</Label>
                <Select value={restyleOption} onValueChange={setRestyleOption}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RESTYLE_OPTIONS.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleRestyle}
                disabled={!uploadedImageUrl || isProcessing}
                className="w-full"
              >
                {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Paintbrush className="h-4 w-4 mr-2" />}
                Restyle Image
              </Button>
            </TabsContent>

            <TabsContent value="reimagine" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Reimagine Prompt</Label>
                <Textarea
                  value={reimaginePrompt}
                  onChange={(e) => setReimaginePrompt(e.target.value)}
                  placeholder="Transform this into a watercolor painting with autumn colors..."
                  rows={3}
                />
              </div>
              <Button
                onClick={handleReimagine}
                disabled={!uploadedImageUrl || (!reimaginePrompt.trim() && !customPrompt.trim()) || isProcessing}
                className="w-full"
              >
                {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Reimagine Image
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Result */}
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Result</CardTitle>
        </CardHeader>
        <CardContent>
          {isProcessing && (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Processing your image...</p>
            </div>
          )}

          {!isProcessing && !resultUrl && !error && (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Wand2 className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Upload an image and choose an enhancement</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-3 p-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {resultUrl && (
            <div className="space-y-4">
              <img
                src={resultUrl}
                alt="Enhanced result"
                className="w-full rounded-lg border border-border/50"
              />
              <Button asChild className="w-full">
                <a href={resultUrl} download="enhanced-image.png">
                  <Download className="h-4 w-4 mr-2" />
                  Download Enhanced Image
                </a>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
