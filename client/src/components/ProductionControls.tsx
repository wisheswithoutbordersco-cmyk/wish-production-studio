/**
 * Shared Production Controls component for all generator tabs.
 * Provides: Branding toggle, Page Size preset, Page Numbers toggle, Auto-Upscale toggle.
 * (Upgrades 1, 2, 4, 6)
 */
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

export interface ProductionSettings {
  branding: string;
  pageSize: string;
  showPageNumbers: boolean;
  autoUpscale: boolean;
}

interface ProductionControlsProps {
  settings: ProductionSettings;
  onChange: (settings: ProductionSettings) => void;
}

export function ProductionControls({ settings, onChange }: ProductionControlsProps) {
  return (
    <div className="space-y-4 pt-2">
      <Separator className="opacity-50" />
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Production Settings</p>

      {/* Branding (Upgrade 1) */}
      <div className="space-y-2">
        <Label>Branding</Label>
        <Select value={settings.branding} onValueChange={(v) => onChange({ ...settings, branding: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="wishes">WishesWithoutBordersCo</SelectItem>
            <SelectItem value="lane">Lane Digital Works</SelectItem>
            <SelectItem value="off">No Watermark</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Page Size (Upgrade 4) */}
      <div className="space-y-2">
        <Label>Page Size</Label>
        <Select value={settings.pageSize} onValueChange={(v) => onChange({ ...settings, pageSize: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="8.5x11-portrait">8.5 x 11 Portrait</SelectItem>
            <SelectItem value="8.5x11-landscape">8.5 x 11 Landscape</SelectItem>
            <SelectItem value="11x14">11 x 14</SelectItem>
            <SelectItem value="16x20">16 x 20</SelectItem>
            <SelectItem value="square">Square (10 x 10)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Page Numbers (Upgrade 2) */}
      <div className="flex items-center justify-between">
        <Label>Show Page Numbers</Label>
        <Switch
          checked={settings.showPageNumbers}
          onCheckedChange={(v) => onChange({ ...settings, showPageNumbers: v })}
        />
      </div>

      {/* Auto-Upscale (Upgrade 6) */}
      <div className="flex items-center justify-between">
        <Label>Auto-Upscale (4x AI)</Label>
        <Switch
          checked={settings.autoUpscale}
          onCheckedChange={(v) => onChange({ ...settings, autoUpscale: v })}
        />
      </div>
    </div>
  );
}

export const DEFAULT_PRODUCTION_SETTINGS: ProductionSettings = {
  branding: "wishes",
  pageSize: "8.5x11-portrait",
  showPageNumbers: true,
  autoUpscale: false,
};
