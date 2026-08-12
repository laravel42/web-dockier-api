export const DISPLAY_PREFERENCES = {
  FONT_SIZE: {
    KEY: "font-size",
    DEFAULT: "medium",
  },
  DENSITY: {
    KEY: "content-density",
    DEFAULT: "comfortable",
  },
  FONT_TEXT: {
    KEY: "font-text",
    DEFAULT: "geist-sans",
  },
  FONT_DISPLAY: {
    KEY: "font-display",
    DEFAULT: "geist-sans",
  },
} as const;

export type FontSize = "small" | "medium" | "large";
export type Density = "compact" | "comfortable" | "spacious";
export type FontText =
  | "geist-sans"
  | "inter"
  | "roboto"
  | "source-sans"
  | "lora"
  | "merriweather"
  | "geist-mono"
  | "roboto-mono"
  | "space-mono";
export type FontDisplay =
  | "geist-sans"
  | "inter"
  | "roboto"
  | "source-sans"
  | "playfair"
  | "lora"
  | "merriweather"
  | "geist-mono"
  | "roboto-mono"
  | "space-mono";
