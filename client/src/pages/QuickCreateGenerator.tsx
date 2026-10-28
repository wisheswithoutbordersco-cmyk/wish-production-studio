import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GenerationProgress } from "@/components/GenerationProgress";
import { useGenerationJob } from "@/hooks/useGenerationJob";
import { Input } from "@/components/ui/input";
import {
  ArrowDown,
  ArrowUp,
  Zap,
  Sparkles,
  Download,
  ImagePlus,
  ListOrdered,
  X,
} from "lucide-react";
import {
  appendReferenceImages,
  moveReferenceImage,
  removeReferenceImage,
  REFERENCE_IMAGE_CONTROL_CAPACITY,
} from "@/lib/quickCreateReferences";

const PAGE_OPTIONS = [1, 2, 3, 4, 5, 10, 15, 20, 25, 30];
const PAGE_COUNT_STORAGE_KEY = "wish-production-studio.quick-create.page-count";

function getSavedPageCount() {
  if (typeof window === "undefined") return 1;

  try {
    const savedCount = Number(
      window.localStorage.getItem(PAGE_COUNT_STORAGE_KEY)
    );
    return PAGE_OPTIONS.includes(savedCount) ? savedCount : 1;
  } catch {
    return 1;
  }
}

const SIZE_OPTIONS = [
  { id: "8.5x11-portrait", label: "8.5×11 Portrait", aspectHint: "portrait" },
  {
    id: "8.5x11-landscape",
    label: "8.5×11 Landscape",
    aspectHint: "landscape",
  },
  { id: "11x14", label: "11×14", aspectHint: "portrait" },
  { id: "16x20", label: "16×20", aspectHint: "portrait" },
  { id: "10x10-square", label: "Square (10×10)", aspectHint: "square" },
] as const;

type SizePreset = (typeof SIZE_OPTIONS)[number]["id"];
type QuickCreateOutputStyle = "full-color" | "coloring" | "reference-coloring";
type ReferenceMappingMode = "guidance" | "process-steps";

const MAX_REFERENCE_IMAGES = 6;
const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_REFERENCE_IMAGE_BYTES = 3.5 * 1024 * 1024;
const MAX_REFERENCE_DIMENSION = 2048;

type ReferenceImageRole =
  | "overall"
  | "face-identity"
  | "body-pose"
  | "style-color"
  | "object-scene"
  | "source-image";

interface ReferenceImage {
  id: string;
  preview: string;
  data: string;
  mimeType: "image/jpeg";
  role: ReferenceImageRole;
  stepDescription: string;
}

async function prepareReferenceImage(
  file: File,
  number: number
): Promise<ReferenceImage> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    throw new Error("Choose a photo or raster image (not SVG).");
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error("Each source photo must be 25 MB or smaller.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();

    const scale = Math.min(
      1,
      MAX_REFERENCE_DIMENSION /
        Math.max(image.naturalWidth, image.naturalHeight)
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare this image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const compress = (quality: number) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          result =>
            result
              ? resolve(result)
              : reject(new Error("Could not compress this image.")),
          "image/jpeg",
          quality
        );
      });
    let quality = 0.9;
    let blob = await compress(quality);
    while (blob.size > MAX_REFERENCE_IMAGE_BYTES && quality > 0.66) {
      quality -= 0.08;
      blob = await compress(quality);
    }
    if (blob.size > MAX_REFERENCE_IMAGE_BYTES) {
      throw new Error(
        "This image is still too large after compression. Try a smaller photo."
      );
    }
    const dataUri = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new Error("Could not read this image."));
      reader.onerror = () => reject(new Error("Could not read this image."));
      reader.readAsDataURL(blob);
    });

    return {
      id: `${Date.now()}-${number}-${Math.random().toString(36).slice(2)}`,
      preview: URL.createObjectURL(blob),
      data: dataUri.split(",", 2)[1] ?? "",
      mimeType: "image/jpeg",
      role: "overall",
      stepDescription: "",
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("This image is still too large")
    ) {
      throw error;
    }
    throw new Error(
      "Could not read this image. Try a JPEG, PNG, or WebP photo."
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function QuickCreateGenerator() {
  const [prompt, setPrompt] = useState("");
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [referenceMappingMode, setReferenceMappingMode] =
    useState<ReferenceMappingMode>("guidance");
  const [isPreparingReferences, setIsPreparingReferences] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [referenceUploadFailed, setReferenceUploadFailed] = useState(false);
  const [referenceStatusMessage, setReferenceStatusMessage] = useState("");
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const referencePreviewUrls = useRef(new Set<string>());
  const [pageCount, setPageCount] = useState(getSavedPageCount);
  const [branding, setBranding] = useState<
    "WishesWithoutBordersCo" | "LaneDigitalWorks" | "none"
  >("none");
  const [outputStyle, setOutputStyle] =
    useState<QuickCreateOutputStyle>("full-color");
  const [sizePreset, setSizePreset] = useState<SizePreset>("8.5x11-portrait");
  const [showPageNumbers, setShowPageNumbers] = useState(false);
  const [upscale, setUpscale] = useState(true);
  // Whether the server has REPLICATE_API_TOKEN — checked via a lightweight env
  // endpoint if available; defaults to showing the toggle (server will ignore it
  // gracefully if the token is absent).
  const [replicateAvailable, setReplicateAvailable] = useState(true);

  const { jobState, isGenerating, progress, startJob, cancelJob } =
    useGenerationJob();

  useEffect(() => {
    try {
      window.localStorage.setItem(PAGE_COUNT_STORAGE_KEY, String(pageCount));
    } catch {
      // Keep the selected count usable when browser storage is unavailable.
    }
  }, [pageCount]);

  const handleReferenceUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (files.length === 0) return;

    const slots = MAX_REFERENCE_IMAGES - referenceImages.length;
    if (slots <= 0) {
      setReferenceError(
        `You can add up to ${MAX_REFERENCE_IMAGES} reference images.`
      );
      return;
    }

    setIsPreparingReferences(true);
    setReferenceError(null);
    setReferenceUploadFailed(false);
    const prepared: ReferenceImage[] = [];
    try {
      const filesToPrepare = files.slice(0, slots);
      for (let index = 0; index < filesToPrepare.length; index++) {
        const image = await prepareReferenceImage(
          filesToPrepare[index],
          referenceImages.length + index + 1
        );
        prepared.push(image);
        referencePreviewUrls.current.add(image.preview);
      }
      if (prepared.length > 0) {
        setReferenceImages(current =>
          appendReferenceImages(current, prepared, MAX_REFERENCE_IMAGES)
        );
      }
      if (files.length > slots) {
        setReferenceError(
          `Only ${slots} more reference image${slots === 1 ? "" : "s"} fit (maximum ${MAX_REFERENCE_IMAGES}).`
        );
      }
    } catch (error) {
      setReferenceUploadFailed(true);
      for (const image of prepared) {
        URL.revokeObjectURL(image.preview);
        referencePreviewUrls.current.delete(image.preview);
      }
      setReferenceError(
        error instanceof Error
          ? error.message
          : "Could not prepare the selected image."
      );
    } finally {
      setIsPreparingReferences(false);
    }
  };

  useEffect(
    () => () => {
      referencePreviewUrls.current.forEach(previewUrl => {
        URL.revokeObjectURL(previewUrl);
      });
      referencePreviewUrls.current.clear();
    },
    []
  );

  // Check whether Replicate is configured on the server. The endpoint
  // GET /api/env-flags is a lightweight JSON response: { replicateEnabled: bool }.
  // If the endpoint doesn't exist the toggle stays visible (safe default).
  useEffect(() => {
    fetch("/api/env-flags")
      .then(r => (r.ok ? r.json() : null))
      .then((data: { replicateEnabled?: boolean } | null) => {
        if (data && data.replicateEnabled === false) {
          setReplicateAvailable(false);
          setUpscale(false);
        }
      })
      .catch(() => {
        /* endpoint absent — keep toggle visible */
      });
  }, []);

  const hasCompleteProcessSteps =
    referenceMappingMode !== "process-steps" ||
    (referenceImages.length > 0 &&
      referenceImages.every(image => image.stepDescription.trim().length > 0));
  const effectivePageCount =
    referenceMappingMode === "process-steps" ||
    outputStyle === "reference-coloring"
      ? 1
      : pageCount;

  const handleGenerate = () => {
    if (referenceUploadFailed) return;
    if (!hasCompleteProcessSteps) return;
    if (!prompt.trim() && outputStyle !== "reference-coloring") return;
    if (outputStyle === "reference-coloring" && referenceImages.length !== 1) {
      return;
    }
    startJob("quick-create", {
      customPrompt:
        prompt.trim() ||
        "Convert the uploaded source image to a clean printable monochrome coloring page.",
      pageCount: effectivePageCount,
      branding,
      outputStyle,
      sizePreset,
      showPageNumbers,
      upscale,
      expectedReferenceImageCount: referenceImages.length,
      referenceMappingMode,
      referenceImages: referenceImages.map(
        ({ data, mimeType, role, stepDescription }) => ({
          data,
          mimeType,
          role,
          stepDescription: stepDescription.trim(),
        })
      ),
    });
  };

  // Collect PNG download URLs from completed job page results
  const pngUrls: Array<{ pageNumber: number; url: string }> =
    jobState?.pageResults
      ?.filter(r => r.status === "success" && r.imageUrl)
      .map(r => ({ pageNumber: r.pageNumber, url: r.imageUrl })) ?? [];

  const toggleBtnClass =
    "studio-choice px-3 py-2 rounded-md text-sm font-medium transition-colors border disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Quick Create
          </CardTitle>
          <CardDescription>
            Describe any printable book, workbook, planner, tracker, guide, or
            activity product. Your request defines the format.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Prompt */}
          <div className="space-y-2">
            <Label htmlFor="quick-prompt" className="text-sm font-medium">
              {outputStyle === "reference-coloring"
                ? "Optional conversion notes"
                : "What do you want to create?"}
            </Label>
            <Textarea
              id="quick-prompt"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder={
                outputStyle === "reference-coloring"
                  ? "Optional: note any details to preserve or simplify..."
                  : "e.g. A vibrant Mediterranean recipe book..."
              }
              disabled={isGenerating}
              rows={5}
              className="min-h-32 resize-y border-input bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/20"
            />
          </div>

          {/* Reference Images */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="quick-reference-images">
                Reference images (optional)
              </Label>
              <span className="text-xs text-white/45">
                {referenceImages.length}/{MAX_REFERENCE_IMAGES}
              </span>
            </div>
            <div
              role="group"
              aria-label="How to use reference images"
              className="flex flex-wrap gap-2"
            >
              <button
                type="button"
                aria-pressed={referenceMappingMode === "guidance"}
                onClick={() => setReferenceMappingMode("guidance")}
                disabled={isGenerating || isPreparingReferences}
                className={toggleBtnClass}
              >
                General guidance
              </button>
              <button
                type="button"
                aria-pressed={referenceMappingMode === "process-steps"}
                onClick={() => setReferenceMappingMode("process-steps")}
                disabled={
                  isGenerating ||
                  isPreparingReferences ||
                  outputStyle !== "full-color"
                }
                className={toggleBtnClass}
              >
                <ListOrdered className="mr-2 inline h-4 w-4" />
                Numbered process steps
              </button>
            </div>
            <p className="text-xs text-white/55">
              {outputStyle === "reference-coloring"
                ? "Upload exactly one image to convert. It will be treated as the source artwork, not loose inspiration, and produce one coloring page."
                : referenceMappingMode === "process-steps"
                  ? "Add one photo per step. Enter each step description, then reorder photos to match the process; each photo maps to the same-numbered step. This mode creates one diagram page. Verify small text and barcodes before using the result."
                  : "Add photos for identity, body/pose, style, or scene guidance. Describe what to keep and what to change in your prompt; references guide every generated page."}
            </p>
            <input
              ref={referenceInputRef}
              id="quick-reference-images"
              type="file"
              accept="image/*"
              multiple={outputStyle !== "reference-coloring"}
              onChange={handleReferenceUpload}
              disabled={
                isGenerating ||
                isPreparingReferences ||
                referenceImages.length >= MAX_REFERENCE_IMAGES ||
                (outputStyle === "reference-coloring" &&
                  referenceImages.length >= 1)
              }
              className="sr-only"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => referenceInputRef.current?.click()}
              disabled={
                isGenerating ||
                isPreparingReferences ||
                referenceImages.length >= MAX_REFERENCE_IMAGES ||
                (outputStyle === "reference-coloring" &&
                  referenceImages.length >= 1)
              }
              className="w-full border-dashed border-white/25 bg-transparent text-white/80 hover:bg-white/5 hover:text-white"
            >
              <ImagePlus className="h-4 w-4 mr-2" />
              {isPreparingReferences
                ? "Preparing images…"
                : "Add reference images"}
            </Button>
            {referenceImages.map((image, index) => (
              <div
                key={image.id}
                className="grid grid-cols-[3.5rem_minmax(0,1fr)_3rem] items-start gap-3 rounded-lg border border-white/10 p-2"
              >
                <img
                  src={image.preview}
                  alt={`Photo ${index + 1}`}
                  className="h-14 w-14 rounded object-cover"
                />
                <div className="min-w-0 space-y-2">
                  <p className="text-xs font-medium text-white/75">
                    {referenceMappingMode === "process-steps"
                      ? `Photo ${index + 1} → Step ${index + 1}`
                      : outputStyle === "reference-coloring"
                        ? `Photo ${index + 1} · exact source to convert`
                        : `Reference ${index + 1} is for…`}
                  </p>
                  {referenceMappingMode === "process-steps" ? (
                    <div className="space-y-1">
                      <Label
                        htmlFor={`quick-step-description-${image.id}`}
                        className="text-xs text-white/65"
                      >
                        Step {index + 1} description (required)
                      </Label>
                      <Input
                        id={`quick-step-description-${image.id}`}
                        value={image.stepDescription}
                        maxLength={200}
                        onChange={event =>
                          setReferenceImages(current =>
                            current.map(item =>
                              item.id === image.id
                                ? {
                                    ...item,
                                    stepDescription: event.target.value,
                                  }
                                : item
                            )
                          )
                        }
                        disabled={isGenerating || isPreparingReferences}
                        placeholder={`Describe step ${index + 1}`}
                        className="h-11 w-full"
                      />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Label
                        htmlFor={`quick-reference-role-${image.id}`}
                        className="text-xs text-white/65"
                      >
                        Reference role
                      </Label>
                      <Select
                        value={
                          outputStyle === "reference-coloring"
                            ? "source-image"
                            : image.role
                        }
                        disabled={
                          isGenerating || outputStyle === "reference-coloring"
                        }
                        onValueChange={value =>
                          setReferenceImages(current =>
                            current.map(item =>
                              item.id === image.id
                                ? { ...item, role: value as ReferenceImageRole }
                                : item
                            )
                          )
                        }
                      >
                        <SelectTrigger
                          id={`quick-reference-role-${image.id}`}
                          className="h-11 border-white/15 bg-black text-white"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="overall">
                            Overall inspiration
                          </SelectItem>
                          <SelectItem value="face-identity">
                            Face / identity
                          </SelectItem>
                          <SelectItem value="body-pose">Body / pose</SelectItem>
                          <SelectItem value="style-color">
                            Style / colors
                          </SelectItem>
                          <SelectItem value="object-scene">
                            Object / scene
                          </SelectItem>
                          <SelectItem value="source-image">
                            Exact source to convert
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    aria-label={`Move Photo ${index + 1} earlier`}
                    disabled={
                      isGenerating ||
                      isPreparingReferences ||
                      index === 0 ||
                      referenceImages.length > REFERENCE_IMAGE_CONTROL_CAPACITY
                    }
                    onClick={() => {
                      setReferenceImages(current =>
                        moveReferenceImage(current, image.id, "earlier")
                      );
                      setReferenceStatusMessage(
                        `Photo ${index + 1} moved earlier and remains paired with its step description.`
                      );
                    }}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    aria-label={`Move Photo ${index + 1} later`}
                    disabled={
                      isGenerating ||
                      isPreparingReferences ||
                      index === referenceImages.length - 1 ||
                      referenceImages.length > REFERENCE_IMAGE_CONTROL_CAPACITY
                    }
                    onClick={() => {
                      setReferenceImages(current =>
                        moveReferenceImage(current, image.id, "later")
                      );
                      setReferenceStatusMessage(
                        `Photo ${index + 1} moved later and remains paired with its step description.`
                      );
                    }}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    aria-label={`Remove Photo ${index + 1}`}
                    disabled={isGenerating || isPreparingReferences}
                    onClick={() => {
                      setReferenceImages(current =>
                        removeReferenceImage(current, image.id)
                      );
                      URL.revokeObjectURL(image.preview);
                      referencePreviewUrls.current.delete(image.preview);
                      setReferenceError(null);
                      setReferenceStatusMessage(
                        `Removed Photo ${index + 1}. Remaining photos and step descriptions were renumbered together.`
                      );
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <p role="status" aria-live="polite" className="sr-only">
              {referenceStatusMessage}
            </p>
            {referenceError && (
              <p role="alert" className="text-xs text-red-300">
                {referenceError}
              </p>
            )}
            <p className="text-[11px] leading-relaxed text-white/40">
              When you generate, references are sent to the image-generation
              provider and held temporarily with the active job. Source photos
              are not saved to the studio’s public image bucket; remove them or
              leave this screen to clear your local selection. Only use images
              you have permission to use.
            </p>
          </div>

          {/* Output Style Toggle */}
          <div className="space-y-2">
            <Label>Output Style</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "full-color", label: "Full color" },
                { id: "coloring", label: "Coloring" },
                { id: "reference-coloring", label: "Photo → Coloring" },
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    const nextStyle = opt.id as QuickCreateOutputStyle;
                    setOutputStyle(nextStyle);
                    if (nextStyle === "reference-coloring") {
                      setReferenceMappingMode("guidance");
                    }
                  }}
                  disabled={
                    isGenerating ||
                    (referenceMappingMode === "process-steps" &&
                      opt.id !== "full-color")
                  }
                  aria-pressed={outputStyle === opt.id}
                  className={toggleBtnClass}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Size Preset */}
          <div className="space-y-2">
            <Label>Size</Label>
            <div className="flex flex-wrap gap-2">
              {SIZE_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSizePreset(opt.id)}
                  disabled={isGenerating}
                  aria-pressed={sizePreset === opt.id}
                  className={toggleBtnClass}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Brand Watermark Toggle */}
          <div className="space-y-2">
            <Label>Brand Watermark</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "WishesWithoutBordersCo", label: "WWB" },
                { id: "LaneDigitalWorks", label: "LDW" },
                { id: "none", label: "Off" },
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setBranding(opt.id as any)}
                  disabled={isGenerating}
                  aria-pressed={branding === opt.id}
                  className={toggleBtnClass}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Page Numbers Toggle */}
          <div className="space-y-2">
            <Label>Page Numbers</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "on", label: "On" },
                { id: "none", label: "Off" },
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setShowPageNumbers(opt.id === "on")}
                  disabled={isGenerating}
                  aria-pressed={showPageNumbers === (opt.id === "on")}
                  className={toggleBtnClass}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 4x Upscale Toggle — only shown when Replicate is configured */}
          {replicateAvailable && (
            <div className="space-y-2">
              <Label>
                4× Upscale{" "}
                <span className="text-muted-foreground text-xs font-normal">
                  (Real-ESRGAN · slower)
                </span>
              </Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "none", label: "Off" },
                  { id: "on", label: "On" },
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setUpscale(opt.id === "on")}
                    disabled={isGenerating}
                    aria-pressed={upscale === (opt.id === "on")}
                    className={toggleBtnClass}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Page Count Buttons */}
          <div className="space-y-2">
            <Label>Pages: {effectivePageCount}</Label>
            <div className="flex flex-wrap gap-2">
              {PAGE_OPTIONS.map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPageCount(n)}
                  disabled={
                    isGenerating ||
                    referenceMappingMode === "process-steps" ||
                    outputStyle === "reference-coloring"
                  }
                  aria-pressed={
                    referenceMappingMode === "process-steps" ||
                    outputStyle === "reference-coloring"
                      ? n === 1
                      : pageCount === n
                  }
                  className={toggleBtnClass}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={
              isGenerating ||
              isPreparingReferences ||
              referenceUploadFailed ||
              !hasCompleteProcessSteps ||
              (!prompt.trim() && outputStyle !== "reference-coloring") ||
              (outputStyle === "reference-coloring" &&
                referenceImages.length !== 1)
            }
            className="w-full"
            size="lg"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {isGenerating
              ? "Generating..."
              : `Generate ${effectivePageCount} Page${effectivePageCount === 1 ? "" : "s"}`}
          </Button>
        </CardContent>
      </Card>

      {/* Output Preview */}
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Output Preview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!jobState && !isGenerating ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Zap className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">
                {outputStyle === "reference-coloring"
                  ? "Upload a photo and hit Generate"
                  : "Type your prompt and hit Generate"}
              </p>
            </div>
          ) : (
            <>
              <GenerationProgress
                jobState={jobState}
                isGenerating={isGenerating}
                progress={progress}
                onCancel={cancelJob}
                productMeta={{
                  title: prompt.slice(0, 60) || "Quick Create",
                  type: "Quick Create",
                  pageCount: effectivePageCount,
                }}
              />

              {/* Individual PNG download buttons — shown once pages start completing */}
              {pngUrls.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Download PNGs
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {pngUrls.map(({ pageNumber, url }) => (
                      <a
                        key={pageNumber}
                        href={url}
                        download={`page-${String(pageNumber).padStart(3, "0")}.png`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border border-input text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 transition-colors"
                      >
                        <Download className="h-3 w-3" />
                        PNG {pageNumber}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Prompt recap shown under preview once generation completes */}
              {jobState?.status === "complete" && prompt && (
                <p className="text-xs text-muted-foreground italic border-t border-border pt-2 line-clamp-3">
                  {prompt}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
