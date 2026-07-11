import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const CUSTOM_PROMPT_PLACEHOLDER =
  "Describe exactly what you want, e.g. 'Thanksgiving coloring pages for 2nd graders with turkeys, pilgrims, and fall leaves'";

interface CustomPromptFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function CustomPromptField({
  value,
  onChange,
  disabled = false,
}: CustomPromptFieldProps) {
  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-black p-4">
      <Label htmlFor="custom-prompt" className="text-sm font-medium text-white">
        Custom Prompt (optional)
      </Label>
      <Textarea
        id="custom-prompt"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={CUSTOM_PROMPT_PLACEHOLDER}
        disabled={disabled}
        rows={4}
        className="min-h-24 resize-y border-white/15 bg-black text-white placeholder:text-white/40 focus-visible:border-white/40 focus-visible:ring-white/10"
      />
      <p className="text-xs leading-relaxed text-white/55">
        When filled, this overrides the dropdown selections as the primary creative direction.
      </p>
    </div>
  );
}
