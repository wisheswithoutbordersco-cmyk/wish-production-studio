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

describe("Quoratorium Ember theme", () => {
  it("keeps the shared palette aligned with Quoratorium", () => {
    // Reference: quoratorium/client/src/index.css at 61fe3cb.
    const palette = {
      background: "#050302",
      foreground: "#f7efe9",
      card: "#0b0704",
      "card-foreground": "#f7efe9",
      popover: "#100a06",
      "popover-foreground": "#f7efe9",
      primary: "#d86618",
      "primary-foreground": "#fffaf5",
      secondary: "#120b07",
      "secondary-foreground": "#f7efe9",
      muted: "#130c08",
      "muted-foreground": "#9f8e82",
      accent: "#1b0e07",
      "accent-foreground": "#fff3e8",
      border: "rgba(242, 140, 56, 0.12)",
      input: "rgba(242, 140, 56, 0.14)",
      ring: "#e87a25",
      "chart-1": "#d86618",
      "chart-2": "#f59a44",
      "chart-3": "#f4b06f",
      "chart-4": "#9a3d0b",
      "chart-5": "#ffd0a8",
      sidebar: "#060403",
      "sidebar-foreground": "#f7efe9",
      "sidebar-primary": "#d86618",
      "sidebar-primary-foreground": "#fffaf5",
      "sidebar-accent": "#160d08",
      "sidebar-accent-foreground": "#f7efe9",
      "sidebar-border": "rgba(242, 140, 56, 0.1)",
      "sidebar-ring": "#e87a25",
    };
    for (const [name, value] of Object.entries(palette))
      expect(token(name)).toBe(value);
    expect(css).toMatch(/:root,\s*\.dark\s*\{/);
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

  it("keeps text, placeholders, and selected controls readable on warm surfaces", () => {
    for (const surface of ["background", "card", "muted", "popover"]) {
      expect(
        contrast(token("foreground"), token(surface))
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(token("muted-foreground"), token(surface))
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(
      contrast(token("brand-highlight"), token("accent"))
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("does not restore silver actions or blue/purple ambient effects", () => {
    for (const legacy of [
      "#667eea",
      "#6d5dfc",
      "#cbd5e1",
      "#d9e0e9",
      "#aeb9c8",
      "rgba(102, 126, 234",
      "rgba(91, 119, 255",
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
    expect(quickCreate).not.toMatch(
      /bg-white|text-black|text-yellow-400|border-white/
    );
    expect(css).toContain('.studio-choice[aria-pressed="true"]');
    expect(css).toContain(".studio-choice:focus-visible");
    expect(source("src/pages/Home.tsx")).toContain("aria-label={tab.label}");
  });

  it("uses the theme for browser chrome and the not-found action", () => {
    expect(source("index.html")).toContain(
      'name="theme-color" content="#050302"'
    );
    expect(source("src/pages/NotFound.tsx")).not.toMatch(
      /bg-white|bg-black|text-black|text-white/
    );
  });
});
