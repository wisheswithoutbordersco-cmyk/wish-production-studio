import { useState, lazy, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CreditCard, BookOpen, Palette, Wand2, Brain, Gamepad2, TreePine, Heart, Layers, FileText, Copy, Library, Zap } from "lucide-react";

// Lazy load all generator components
const CardGenerator = lazy(() => import("./CardGenerator"));
const WorkbookGenerator = lazy(() => import("./WorkbookGenerator"));
const ColoringBookGenerator = lazy(() => import("./ColoringBookGenerator"));
const EnhanceTools = lazy(() => import("./EnhanceTools"));
const BrainTrainingGenerator = lazy(() => import("./BrainTrainingGenerator"));
const CulturalGameGenerator = lazy(() => import("./CulturalGameGenerator"));
const OutdoorLearningGenerator = lazy(() => import("./OutdoorLearningGenerator"));
const TherapeuticActivityGenerator = lazy(() => import("./TherapeuticActivityGenerator"));
const FlashcardGenerator = lazy(() => import("./FlashcardGenerator"));
const WorksheetGenerator = lazy(() => import("./WorksheetGenerator"));
const BatchVariantGenerator = lazy(() => import("./BatchVariantGenerator"));
const QuickCreateGenerator = lazy(() => import("./QuickCreateGenerator"));
const ProductLibrary = lazy(() => import("./ProductLibrary"));

function TabLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

const TAB_CONFIG = [
  { id: "quick-create", label: "Quick Create", icon: Zap },
  { id: "cards", label: "Cards", icon: CreditCard },
  { id: "workbooks", label: "Workbooks", icon: BookOpen },
  { id: "coloring", label: "Coloring", icon: Palette },
  { id: "enhance", label: "Enhance", icon: Wand2 },
  { id: "brain-training", label: "Brain Training", icon: Brain },
  { id: "cultural-games", label: "Cultural Games", icon: Gamepad2 },
  { id: "outdoor", label: "Outdoor", icon: TreePine },
  { id: "therapeutic", label: "Therapeutic", icon: Heart },
  { id: "flashcards", label: "Flashcards", icon: Layers },
  { id: "worksheets", label: "Worksheets", icon: FileText },
  { id: "batch", label: "Batch", icon: Copy },
  { id: "library", label: "Library", icon: Library },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState("quick-create");

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[#222222] bg-black/95 backdrop-blur-sm">
        <div className="container py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#222222] bg-black">
              <Wand2 className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground leading-tight">Production Studio</h1>
              <p className="text-[11px] text-muted-foreground">Wishes Without Borders Co</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 flex h-auto w-full flex-wrap gap-1 rounded-lg border border-[#222222] bg-black p-1.5">
            {TAB_CONFIG.map(tab => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center gap-1.5 border border-transparent px-3 py-2 text-xs text-white/70 transition-colors hover:bg-[#111111] hover:text-white data-[state=active]:border-[#333333] data-[state=active]:bg-[#171717] data-[state=active]:text-white"
              >
                <tab.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Quick Create */}
          <TabsContent value="quick-create">
            <Suspense fallback={<TabLoading />}>
              <QuickCreateGenerator />
            </Suspense>
          </TabsContent>

          {/* Original 4 Tabs */}
          <TabsContent value="cards">
            <Suspense fallback={<TabLoading />}>
              <CardGenerator />
            </Suspense>
          </TabsContent>
          <TabsContent value="workbooks">
            <Suspense fallback={<TabLoading />}>
              <WorkbookGenerator />
            </Suspense>
          </TabsContent>
          <TabsContent value="coloring">
            <Suspense fallback={<TabLoading />}>
              <ColoringBookGenerator />
            </Suspense>
          </TabsContent>
          <TabsContent value="enhance">
            <Suspense fallback={<TabLoading />}>
              <EnhanceTools />
            </Suspense>
          </TabsContent>

          {/* New 8 Tabs */}
          <TabsContent value="brain-training">
            <Suspense fallback={<TabLoading />}>
              <BrainTrainingGenerator />
            </Suspense>
          </TabsContent>
          <TabsContent value="cultural-games">
            <Suspense fallback={<TabLoading />}>
              <CulturalGameGenerator />
            </Suspense>
          </TabsContent>
          <TabsContent value="outdoor">
            <Suspense fallback={<TabLoading />}>
              <OutdoorLearningGenerator />
            </Suspense>
          </TabsContent>
          <TabsContent value="therapeutic">
            <Suspense fallback={<TabLoading />}>
              <TherapeuticActivityGenerator />
            </Suspense>
          </TabsContent>
          <TabsContent value="flashcards">
            <Suspense fallback={<TabLoading />}>
              <FlashcardGenerator />
            </Suspense>
          </TabsContent>
          <TabsContent value="worksheets">
            <Suspense fallback={<TabLoading />}>
              <WorksheetGenerator />
            </Suspense>
          </TabsContent>
          <TabsContent value="batch">
            <Suspense fallback={<TabLoading />}>
              <BatchVariantGenerator />
            </Suspense>
          </TabsContent>
          <TabsContent value="library">
            <Suspense fallback={<TabLoading />}>
              <ProductLibrary />
            </Suspense>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
