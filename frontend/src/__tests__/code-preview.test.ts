import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The scan-finding code preview follows the theme, so Prism needs TWO palettes.
 * It shipped with only the GitHub-dark one, and light theme put pale inks on a
 * near-white surface — the highlighted row (oklch 0.955) was the worst, so the
 * one line carrying the finding was the one you could not read.
 *
 * These colours are plain hexes in CSS rather than tokens, which puts them out
 * of reach of the ramp test, hence this file. Reads index.css directly so the
 * assertions cannot drift from what ships.
 */
const CSS_PATH = ["src/index.css", "frontend/src/index.css"]
  .map((p) => resolve(process.cwd(), p))
  .find(existsSync);
if (!CSS_PATH) throw new Error("index.css not found from " + process.cwd());
const CSS = readFileSync(CSS_PATH, "utf8");

/** WCAG AA for body text. The preview renders at 13px, so the large-text 3:1 does not apply. */
const AA = 4.5;

const clamp = (x: number) => Math.min(1, Math.max(0, x));

function oklchToLinear(L: number, C: number, H: number): [number, number, number] {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
}

/** sRGB hex → linear-light RGB, so hex inks and oklch surfaces are comparable. */
function hexToLinear(hex: string): [number, number, number] {
  const n = hex.replace("#", "");
  const srgb = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = srgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return [lin[0], lin[1], lin[2]];
}

const toLinear = (v: string): [number, number, number] => {
  if (v.startsWith("#")) return hexToLinear(v);
  const m = v.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
  if (!m) throw new Error(`unsupported colour: ${v}`);
  return oklchToLinear(+m[1], +m[2], +m[3]);
};

const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(toLinear(a)), lum(toLinear(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Dark lives in `@theme`, light in `[data-theme="light"]`, so the name resolves twice. */
function token(name: string, theme: "dark" | "light"): string {
  const start = theme === "light" ? CSS.indexOf('[data-theme="light"] {') : CSS.indexOf("@theme {");
  const m = CSS.slice(start).match(new RegExp(`--color-${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`--color-${name} not found in ${theme} block`);
  return m[1].trim();
}

/**
 * Every `color:` under a `.code-preview .token.*` rule, split by theme. Light
 * rules are the ones prefixed with the theme attribute, so a group added to one
 * palette and forgotten in the other shows up as a count mismatch.
 */
function previewInks(theme: "dark" | "light"): string[] {
  const rules = CSS.matchAll(/((?:\[data-theme="light"\]\s*)?\.code-preview[^{]*)\{([^}]*)\}/g);
  const found: string[] = [];
  for (const [, selector, body] of rules) {
    if (!selector.includes(".token")) continue;
    const isLight = selector.includes('[data-theme="light"]');
    if (isLight !== (theme === "light")) continue;
    const color = body.match(/color:\s*(#[0-9a-f]{6})/i);
    if (color) found.push(color[1]);
  }
  return found;
}

/**
 * Log and code panes used `bg-terminal`, pinned near-black in BOTH themes, while
 * their ink (`text-strong` → `--color-foreground`) flipped to oklch(0.22) in
 * light: measured 1.17:1, invisible. It shipped that way in the deploy log, the
 * command output, the nginx preview, the process log, both Observe panes and the
 * wizard, so the pinned surface is gone rather than patched ink by ink.
 *
 * Every pane now follows the theme, which makes the ordinary tokens correct.
 * Reintroducing a pinned fill brings the whole class of bug back, so it fails
 * here instead of in review.
 */
describe("no pinned-dark surfaces", () => {
  it("nothing uses bg-terminal or the terminal-* inks", () => {
    const SRC = resolve(CSS_PATH!, "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = resolve(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "node_modules" && e.name !== "__tests__") walk(p);
          continue;
        }
        if (!/\.(tsx?|css)$/.test(e.name)) continue;
        readFileSync(p, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (/\b(bg-terminal|text-terminal-\w+|--color-terminal)\b/.test(line)) {
              offenders.push(`${e.name}:${i + 1}`);
            }
          });
      }
    };
    walk(SRC);
    expect(offenders, "panes follow the theme now — use bg-background").toEqual([]);
  });
});

describe("code preview contrast", () => {
  it("defines the same number of token groups in both themes", () => {
    // 7 groups today. A new dark group with no light counterpart is the bug this catches.
    expect(previewInks("dark").length).toBeGreaterThanOrEqual(7);
    expect(previewInks("light")).toHaveLength(previewInks("dark").length);
  });

  /**
   * Measured against the body fill (`bg-background`), which carries almost every
   * line. The highlighted row's fill is checked separately below.
   */
  it.each([
    ["dark", "background"],
    ["light", "background"],
  ] as const)("%s inks clear AA on the preview body", (theme, surface) => {
    const bg = token(surface, theme);
    for (const ink of previewInks(theme)) {
      expect(ratio(ink, bg), `${ink} on ${theme} ${surface} (${bg})`).toBeGreaterThanOrEqual(AA);
    }
  });

  /**
   * The highlighted row is tinted `bg-danger-surface`, a little darker than the
   * body in light theme and a little lighter in dark. The plain-text ink there
   * is `text-text`, which is what went near-black on near-black-red before.
   */
  it.each(["dark", "light"] as const)("%s plain code ink clears AA on the highlighted row", (theme) => {
    const fill = token("danger-surface", theme);
    const ink = token("foreground", theme); // text-text resolves to this
    expect(ratio(ink, fill), `foreground on ${theme} danger-surface`).toBeGreaterThanOrEqual(AA);
  });
});
