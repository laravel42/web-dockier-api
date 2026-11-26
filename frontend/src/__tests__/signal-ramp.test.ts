import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The signal ramp (DESIGN.md → "The Signal Ramp") promises that every severity ink
 * clears WCAG AA on its own fill and on the bare card, in both themes. That promise
 * is a number, so it is testable — and it is exactly the kind of value a later tweak
 * nudges by 0.02 without anyone noticing.
 *
 * Reads index.css directly so the test cannot drift from the shipped tokens.
 */

// Vite rewrites import.meta.url to an http URL, so resolve from cwd instead —
// which is the repo root under `pnpm test` and frontend/ under a direct vitest run.
const CSS_PATH = ["src/index.css", "frontend/src/index.css"]
  .map((p) => resolve(process.cwd(), p))
  .find(existsSync);
if (!CSS_PATH) throw new Error("index.css not found from " + process.cwd());
const CSS = readFileSync(CSS_PATH, "utf8");

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

const parse = (v: string) => {
  const m = v.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
  if (!m) throw new Error(`not an oklch value: ${v}`);
  return oklchToLinear(+m[1], +m[2], +m[3]);
};
const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(parse(a)), lum(parse(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * Pull a custom property's value from a specific block. Dark lives in `@theme`,
 * light in `[data-theme="light"]`, so the same name resolves to two values.
 */
function token(name: string, theme: "dark" | "light"): string {
  const start = theme === "light" ? CSS.indexOf('[data-theme="light"] {') : CSS.indexOf("@theme {");
  expect(start, `${theme} block not found`).toBeGreaterThan(-1);
  const slice = CSS.slice(start);
  const m = slice.match(new RegExp(`--color-${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`--color-${name} not found in ${theme} block`);
  return m[1].trim();
}

const SIGNALS = ["danger", "caution", "warning", "info", "success", "ai"] as const;
const CARD = { dark: "oklch(0.21 0.009 50)", light: "oklch(1 0.005 60)" };
const PAGE = { dark: "oklch(0.17 0.008 50)", light: "oklch(0.97 0.008 60)" };
const AA = 4.5;

describe("signal ramp contrast", () => {
  for (const theme of ["dark", "light"] as const) {
    describe(theme, () => {
      for (const signal of SIGNALS) {
        it(`${signal} ink clears AA on its own surface, the card and the page`, () => {
          const ink = token(`${signal}-ink`, theme);
          const surface = token(`${signal}-surface`, theme);

          // Surfaces here are opaque, so the ink sits directly on them.
          expect(ratio(ink, surface), `${signal} ink on ${signal} surface`).toBeGreaterThanOrEqual(AA);
          expect(ratio(ink, CARD[theme]), `${signal} ink on card`).toBeGreaterThanOrEqual(AA);
          expect(ratio(ink, PAGE[theme]), `${signal} ink on page`).toBeGreaterThanOrEqual(AA);
        });
      }

      it("holds lightness and chroma uniform across the ramp — only hue moves", () => {
        // This is what makes six signals read as one family (DESIGN.md).
        const shape = (kind: "surface" | "ink") =>
          new Set(
            SIGNALS.map((s) => {
              const m = token(`${s}-${kind}`, theme).match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+/);
              return `${m![1]} ${m![2]}`;
            }),
          );
        expect(shape("surface").size, "surface L/C should be identical across signals").toBe(1);
        expect(shape("ink").size, "ink L/C should be identical across signals").toBe(1);
      });
    });
  }

  it("defines every signal in both themes", () => {
    for (const theme of ["dark", "light"] as const) {
      for (const s of SIGNALS) {
        for (const part of ["surface", "line", "ink"] as const) {
          expect(() => token(`${s}-${part}`, theme)).not.toThrow();
        }
      }
    }
  });
});
