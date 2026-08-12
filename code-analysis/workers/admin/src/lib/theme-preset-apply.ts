import {
  defaultDarkThemeStyles,
  defaultLightThemeStyles,
} from "@/lib/theme-preset-defaults";
import { defaultPresets } from "@/lib/theme-presets";

export const THEME_PRESET_STORAGE_KEY = "theme-preset";

export type MergedThemeStyles = {
  light: Record<string, string>;
  dark: Record<string, string>;
};

function mergePresetWithDefaults(presetStyles: {
  light?: Record<string, string>;
  dark?: Record<string, string>;
}): MergedThemeStyles {
  return {
    light: { ...defaultLightThemeStyles, ...(presetStyles.light || {}) },
    dark: {
      ...defaultDarkThemeStyles,
      ...(presetStyles.light || {}),
      ...(presetStyles.dark || {}),
    },
  };
}

export function getMergedStylesForPreset(
  presetId: string,
): MergedThemeStyles | null {
  if (presetId === "default") return null;
  const preset = defaultPresets[presetId];
  if (!preset) return null;
  return mergePresetWithDefaults(preset.styles);
}

function stylesToCssBlock(styles: Record<string, string>): string {
  return Object.entries(styles)
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n");
}

export function buildPresetStylesheet(merged: MergedThemeStyles): string {
  return `:root {\n${stylesToCssBlock(merged.light)}\n}\n.dark {\n${stylesToCssBlock(merged.dark)}\n}`;
}

const STYLE_ID = "theme-preset-style";

export function applyThemePresetToDocument(presetId: string): void {
  if (typeof document === "undefined") return;

  const existing = document.getElementById(STYLE_ID);
  if (presetId === "default") {
    existing?.remove();
    return;
  }

  const merged = getMergedStylesForPreset(presetId);
  if (!merged) {
    existing?.remove();
    return;
  }

  const css = buildPresetStylesheet(merged);
  let el = existing as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

export function getPresetLabel(presetId: string): string {
  if (presetId === "default") return "Default";
  return defaultPresets[presetId]?.label ?? presetId;
}

export function listPresetIdsSorted(): string[] {
  const ids = Object.keys(defaultPresets).sort((a, b) => {
    const la = defaultPresets[a]?.label ?? a;
    const lb = defaultPresets[b]?.label ?? b;
    return la.localeCompare(lb);
  });
  return ["default", ...ids];
}

export function getPresetPreviewColors(
  presetId: string,
  mode: "light" | "dark",
): [string, string, string, string] {
  const merged =
    presetId === "default"
      ? {
          light: { ...defaultLightThemeStyles },
          dark: { ...defaultDarkThemeStyles },
        }
      : getMergedStylesForPreset(presetId);
  const styles = merged
    ? merged[mode]
    : mode === "light"
      ? { ...defaultLightThemeStyles }
      : { ...defaultDarkThemeStyles };
  return [
    styles.primary ?? "#000",
    styles.secondary ?? "#ccc",
    styles.accent ?? "#eee",
    styles.background ?? "#fff",
  ];
}
