import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Library, Search, Download, Package, Filter, Tag, CheckCircle } from "lucide-react";

const PRODUCT_TYPES = [
  "All",
  "Brain Training",
  "Cultural Game",
  "Flashcard",
  "Worksheet",
  "Outdoor Learning",
  "Therapeutic Activity",
  "Greeting Card",
  "Workbook",
  "Coloring Book",
];

const CULTURAL_VARIANTS_FILTER = [
  "All",
  "African",
  "Caribbean",
  "South Asian",
  "East Asian",
  "Latin American",
  "Middle Eastern",
  "Indigenous/Native American",
  "Mixed/Diverse",
];

const AGE_RANGES_FILTER = [
  "All",
  "3-4",
  "4-5",
  "5-6",
  "6-7",
  "7-8",
  "8-10",
  "Kids (5-8)",
  "Tweens (9-12)",
  "Family (all ages)",
];

const PLATFORMS = ["Etsy", "Shopify", "Amazon", "TpT"] as const;
const LISTING_STATUSES = ["not_listed", "listed", "pending", "draft"] as const;

export default function ProductLibrary() {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [culturalFilter, setCulturalFilter] = useState("All");
  const [ageFilter, setAgeFilter] = useState("All");
  const [editingProduct, setEditingProduct] = useState<any>(null);

  const utils = trpc.useUtils();

  const { data: productsData, isLoading } = trpc.products.list.useQuery(
    {
      type: typeFilter === "All" ? undefined : typeFilter,
      search: searchQuery || undefined,
      culturalVariant: culturalFilter === "All" ? undefined : culturalFilter,
      ageRange: ageFilter === "All" ? undefined : ageFilter,
    },
    { enabled: true }
  );

  const updateListing = trpc.products.updateListingStatus.useMutation({
    onSuccess: () => {
      toast.success("Listing status updated");
      utils.products.list.invalidate();
    },
    onError: (err) => {
      toast.error("Failed to update: " + err.message);
    },
  });

  const displayProducts = productsData || [];

  const handleListingUpdate = (productId: number, platform: string, status: string) => {
    updateListing.mutate({ id: productId, platform, status });
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="border-border/50 bg-card">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="w-full sm:w-44">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger>
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Product Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-44">
                <Select value={culturalFilter} onValueChange={setCulturalFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Cultural Variant" />
                  </SelectTrigger>
                  <SelectContent>
                    {CULTURAL_VARIANTS_FILTER.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-36">
                <Select value={ageFilter} onValueChange={setAgeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Age Range" />
                  </SelectTrigger>
                  <SelectContent>
                    {AGE_RANGES_FILTER.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {displayProducts.length} product{displayProducts.length !== 1 ? "s" : ""} found
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Product Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="border-border/50 bg-card animate-pulse">
              <div className="aspect-[8.5/11] bg-secondary rounded-t-lg" />
              <CardContent className="pt-3 space-y-2">
                <div className="h-4 bg-secondary rounded w-3/4" />
                <div className="h-3 bg-secondary rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : displayProducts.length === 0 ? (
        <Card className="border-border/50 bg-card">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Library className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">No Products Yet</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Generated products will appear here. Use any generator tab to create your first product.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {displayProducts.map((product: any) => (
            <Card key={product.id} className="border-border/50 bg-card overflow-hidden group hover:border-primary/30 transition-colors">
              {/* Thumbnail */}
              <div className="aspect-[8.5/11] bg-secondary relative overflow-hidden">
                {product.thumbnailUrl ? (
                  <img
                    src={product.thumbnailUrl}
                    alt={product.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <Package className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
                {/* Download overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button size="sm" variant="secondary" asChild>
                    <a href={product.pdfUrl} download>
                      <Download className="h-4 w-4 mr-1" />
                      PDF
                    </a>
                  </Button>
                </div>
              </div>

              <CardContent className="pt-3 space-y-2">
                <h4 className="text-sm font-medium text-foreground line-clamp-1">{product.title}</h4>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="secondary" className="text-[10px]">{product.type}</Badge>
                  {product.culturalVariant && (
                    <Badge variant="outline" className="text-[10px]">{product.culturalVariant}</Badge>
                  )}
                  {product.ageRange && (
                    <Badge variant="outline" className="text-[10px]">{product.ageRange}</Badge>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(product.createdAt).toLocaleDateString()}
                </p>

                {/* Listing status with edit */}
                <div className="flex gap-1 flex-wrap items-center">
                  {PLATFORMS.map(platform => {
                    const status = (product.listingStatus as Record<string, string>)?.[platform];
                    return (
                      <button
                        key={platform}
                        onClick={() => {
                          const nextStatus = !status ? "listed" : status === "listed" ? "not_listed" : "listed";
                          handleListingUpdate(product.id, platform, nextStatus);
                        }}
                        className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                          status === "listed"
                            ? "bg-primary/20 border-primary/40 text-primary"
                            : "bg-transparent border-border text-muted-foreground hover:border-primary/30"
                        }`}
                        title={`Click to toggle ${platform} listing status`}
                      >
                        {platform}
                        {status === "listed" && <CheckCircle className="h-2.5 w-2.5 inline ml-0.5" />}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
