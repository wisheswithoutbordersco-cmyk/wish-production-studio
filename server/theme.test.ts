import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) =>
  readFileSync(resolve(import.meta.dirname, "../client", file), "utf8");
const css = source("src/index.css");
const token = (name: string) => {
  const match = css.match(new RegExp(`^\\s*--${name}:\\s*([^;]+);`, "m"));
  if (!match) throw new Error(`Missing theme token: ${name}`);
  return match[1].trim();
};

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map(value => {
      const channel = parseInt(value, 16) / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a
  );
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("Quoratorium blue-violet glass theme", () => {
  it("uses near-black surfaces, restrained blue/violet accents, and silver borders", () => {
    const palette = {
      background: "#04050a",
      foreground: "#e8eaf1",
      card: "#080a12",
      "card-foreground": "#e8eaf1",
      popover: "#0b0d17",
      "popover-foreground": "#e8eaf1",
      primary: "#8395ff",
      "primary-foreground": "#f5f6ff",
      secondary: "#0d101a",
      "secondary-foreground": "#e8eaf1",
      muted: "#10131e",
      "muted-foreground": "#a3a9b8",
      accent: "#161a2c",
      "accent-foreground": "#eef0ff",
      destructive: "#ef4444",
      "destructive-foreground": "#ffffff",
      border: "rgba(177, 188, 214, 0.12)",
      input: "rgba(177, 188, 214, 0.14)",
      ring: "#98a8ff",
      "chart-1": "#8395ff",
      "chart-2": "#a99aff",
      "chart-3": "#cdc6ff",
      "chart-4": "#6879d8",
      "chart-5": "#e6e6ff",
      sidebar: "#060810",
      "sidebar-foreground": "#e8eaf1",
      "sidebar-primary": "#8395ff",
      "sidebar-primary-foreground": "#f5f6ff",
      "sidebar-accent": "#111525",
      "sidebar-accent-foreground": "#e8eaf1",
      "sidebar-border": "rgba(177, 188, 214, 0.1)",
      "sidebar-ring": "#98a8ff",
    };
    for (const [name, value] of Object.entries(palette))
      expect(token(name)).toBe(value);
    expect(css).toMatch(/:root,\s*\.dark\s*\{/);
    expect(css).toContain("backdrop-filter: blur(28px) saturate(140%)");
  });

  it("preserves the semantic destructive color", () => {
    expect(token("destructive")).toBe("#ef4444");
    expect(css).toContain('input[aria-invalid="true"]');
  });

  it("keeps small primary action labels readable in default and hover states", () => {
    for (const stop of [
      "action-start",
      "action-end",
      "action-hover-start",
      "action-hover-end",
    ]) {
      expect(
        contrast(token("primary-foreground"), token(stop)),
        stop
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps text, placeholders, and selected controls readable on glass surfaces", () => {
    for (const surface of ["background", "card", "muted", "popover"]) {
      expect(contrast(token("foreground"), token(surface))).toBeGreaterThanOrEqual(
        4.5
      );
      expect(
        contrast(token("muted-foreground"), token(surface))
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(
      contrast(token("brand-highlight"), token("accent"))
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("removes the old ember accents while preserving themed controls", () => {
    for (const legacy of [
      "#d86618",
      "#e87a25",
      "#ffae67",
      "#b7470b",
      "rgba(216, 102, 24",
      "rgba(242, 140, 56",
    ]) {
      expect(css).not.toContain(legacy);
    }
    expect(css).toContain("var(--action-start), var(--action-end)");
    expect(css).toContain('[data-slot="slider-range"]');
    expect(css).toContain('[data-slot="progress-indicator"]');
  });

  it("themes all six Quick Create option groups and retains visible keyboard focus", () => {
    const quickCreate = source("src/pages/QuickCreateGenerator.tsx");
    expect(quickCreate.match(/aria-pressed=/g)).toHaveLength(6);
    expect(quickCreate.match(/className=\{toggleBtnClass\}/g)).toHaveLength(6);
    const referenceStart = quickCreate.indexOf("{/* Reference Images */}");
    const outputStyleStart = quickCreate.indexOf(
      "{/* Output Style Toggle */}",
      referenceStart
    );
    expect(referenceStart).toBeGreaterThanOrEqual(0);
    expect(outputStyleStart).toBeGreaterThan(referenceStart);
    const themedControls =
      quickCreate.slice(0, referenceStart) + quickCreate.slice(outputStyleStart);
    expect(themedControls).not.toMatch(
      /bg-white|text-black|text-yellow-400|border-white/
    );
    expect(css).toContain('.studio-choice[aria-pressed="true"]');
    expect(css).toContain(".studio-choice:focus-visible");
    expect(source("src/pages/Home.tsx")).toContain("aria-label={tab.label}");
  });

  it("uses the theme for browser chrome and the not-found action", () => {
    expect(source("index.html")).toContain(
      'name="theme-color" content="#04050a"'
    );
    expect(source("src/pages/NotFound.tsx")).not.toMatch(
      /bg-white|bg-black|text-black|text-white/
    );
  });
});
