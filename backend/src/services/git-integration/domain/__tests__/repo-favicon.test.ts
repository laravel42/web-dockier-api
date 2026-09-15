import { describe, expect, it } from "vitest";
import {
  findRepoFaviconPaths,
  bufferToFaviconDataUrl,
  isValidFaviconDataUrl,
  isRepoFaviconCacheValid,
  getAspectRatio,
  isSuitableFaviconAspectRatio,
  parsePngDimensions,
  parseIcoDimensions,
  scoreFaviconPath,
  scoreFaviconWithDimensions,
  type RepoFaviconCacheEntry,
  parseSvgDimensions,
  REPO_FAVICON_RESOLVER_VERSION,
  findDeclarationEntryFiles,
} from "../repo-favicon.js";

function createPngBuffer(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(33);
  buffer[0] = 0x89;
  buffer[1] = 0x50;
  buffer[2] = 0x4e;
  buffer[3] = 0x47;
  buffer[4] = 0x0d;
  buffer[5] = 0x0a;
  buffer[6] = 0x1a;
  buffer[7] = 0x0a;
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function createIcoBuffer(width: number, height: number, count = 1): Buffer {
  const buffer = Buffer.alloc(6 + count * 16);
  buffer.writeUInt16LE(0, 0);
  buffer.writeUInt16LE(1, 2);
  buffer.writeUInt16LE(count, 4);

  for (let i = 0; i < count; i++) {
    const offset = 6 + i * 16;
    buffer[offset] = width === 256 ? 0 : width;
    buffer[offset + 1] = height === 256 ? 0 : height;
  }

  return buffer;
}

describe("findRepoFaviconPaths (top match)", () => {
  const files = [
    "README.md",
    "package.json",
    "public/favicon.ico",
    "public/index.html",
    "src/main.ts",
    "assets/apple-touch-icon.png",
  ];

  const topPath = (
    input: string[],
    options?: { rootDirectory?: string; webDirectory?: string },
  ): string | null => findRepoFaviconPaths(input, options)[0] ?? null;

  it("prefers webDirectory favicon paths", () => {
    expect(topPath(files, { webDirectory: "public" })).toBe("public/favicon.ico");
  });

  it("finds favicon by filename anywhere in the tree", () => {
    expect(topPath(["src/app/favicon.svg"])).toBe("src/app/favicon.svg");
  });

  it("falls back to apple-touch-icon when no favicon file exists", () => {
    expect(topPath(["assets/apple-touch-icon.png", "README.md"])).toBe("assets/apple-touch-icon.png");
  });

  it("returns null when no icon files are present", () => {
    expect(topPath(["README.md", "package.json"])).toBeNull();
  });
});

describe("findRepoFaviconPaths", () => {
  it("collects multiple favicon candidates in priority order", () => {
    const paths = findRepoFaviconPaths([
      "public/favicon.ico",
      "public/favicon.png",
      "assets/logo-wordmark.png",
      "assets/apple-touch-icon.png",
    ]);

    expect(paths).toContain("public/favicon.ico");
    expect(paths).toContain("public/favicon.png");
    expect(paths.indexOf("public/favicon.ico")).toBeLessThan(paths.indexOf("assets/apple-touch-icon.png"));
  });
});

describe("image dimension parsing", () => {
  it("reads PNG IHDR width and height", () => {
    expect(parsePngDimensions(createPngBuffer(32, 32))).toEqual({ width: 32, height: 32 });
    expect(parsePngDimensions(createPngBuffer(320, 64))).toEqual({ width: 320, height: 64 });
  });

  it("reads ICO directory entry dimensions", () => {
    expect(parseIcoDimensions(createIcoBuffer(32, 32))).toEqual({ width: 32, height: 32 });
    expect(parseIcoDimensions(createIcoBuffer(256, 256))).toEqual({ width: 256, height: 256 });
  });

  it("prefers the largest square ICO entry", () => {
    const buffer = createIcoBuffer(16, 16, 2);
    buffer[22] = 32;
    buffer[23] = 32;
    expect(parseIcoDimensions(buffer)).toEqual({ width: 32, height: 32 });
  });
});

describe("favicon aspect ratio scoring", () => {
  it("computes width/height ratio", () => {
    expect(getAspectRatio(32, 32)).toBe(1);
    expect(getAspectRatio(320, 64)).toBe(5);
  });

  it("accepts square-ish ratios between 0.8 and 1.25", () => {
    expect(isSuitableFaviconAspectRatio(0.8)).toBe(true);
    expect(isSuitableFaviconAspectRatio(1)).toBe(true);
    expect(isSuitableFaviconAspectRatio(1.25)).toBe(true);
    expect(isSuitableFaviconAspectRatio(1.26)).toBe(false);
    expect(isSuitableFaviconAspectRatio(0.79)).toBe(false);
  });

  it("prefers favicon.ico over apple-touch-icon paths", () => {
    expect(scoreFaviconPath("public/favicon.ico")).toBeGreaterThan(scoreFaviconPath("assets/apple-touch-icon.png"));
  });

  it("deprioritizes logo paths", () => {
    expect(scoreFaviconPath("assets/logo.png")).toBeLessThan(scoreFaviconPath("assets/icon.png"));
  });

  it("rejects wide wordmark dimensions like MAILDRILL (320x64)", () => {
    const wordmarkScore = scoreFaviconWithDimensions("public/favicon.png", { width: 320, height: 64 });
    expect(wordmarkScore).toBeNull();
  });

  it("accepts small square PNG favicons", () => {
    const squareScore = scoreFaviconWithDimensions("public/favicon.png", { width: 32, height: 32 });
    expect(squareScore).not.toBeNull();
    expect(squareScore!).toBeGreaterThan(scoreFaviconWithDimensions("public/favicon.png", { width: 48, height: 40 })!);
  });

  it("accepts SVG favicons without dimension checks", () => {
    expect(scoreFaviconWithDimensions("public/favicon.svg", null)).not.toBeNull();
  });

  it("deprioritizes manifest icons larger than 128px", () => {
    const largeIcon = scoreFaviconWithDimensions("public/icon-512.png", { width: 512, height: 512 });
    const smallIcon = scoreFaviconWithDimensions("public/favicon.png", { width: 32, height: 32 });
    expect(largeIcon).not.toBeNull();
    expect(smallIcon).not.toBeNull();
    expect(smallIcon!).toBeGreaterThan(largeIcon!);
  });
});

describe("favicon data URL validation", () => {
  it("rejects empty base64 data URLs", () => {
    expect(isValidFaviconDataUrl("data:image/x-icon;base64,")).toBe(false);
    expect(isValidFaviconDataUrl("data:image/png;base64,   ")).toBe(false);
  });

  it("accepts null (no favicon found)", () => {
    expect(isValidFaviconDataUrl(null)).toBe(true);
  });

  it("accepts non-empty base64 payloads", () => {
    expect(isValidFaviconDataUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
  });

  it("returns null for empty buffers", () => {
    expect(bufferToFaviconDataUrl(Buffer.alloc(0), "favicon.ico")).toBeNull();
  });

  it("returns a data URL for non-empty buffers", () => {
    const url = bufferToFaviconDataUrl(Buffer.from([0x00, 0x01]), "favicon.ico");
    expect(url).toMatch(/^data:image\/x-icon;base64,/);
  });
});

describe("isRepoFaviconCacheValid", () => {
  const entry: RepoFaviconCacheEntry = {
    dataUrl: "data:image/png;base64,iVBORw0KGgo=",
    resolvedAt: "2026-01-01T00:00:00.000Z",
    deployId: "deploy-1",
    version: REPO_FAVICON_RESOLVER_VERSION,
  };

  it("is valid when deploy ID matches", () => {
    expect(isRepoFaviconCacheValid(entry, "deploy-1")).toBe(true);
  });

  it("is invalid when written by an older resolver version", () => {
    const { version: _version, ...preVersioned } = entry;
    expect(isRepoFaviconCacheValid(preVersioned as RepoFaviconCacheEntry, "deploy-1")).toBe(false);
  });

  it("is invalid after a new deploy", () => {
    expect(isRepoFaviconCacheValid(entry, "deploy-2")).toBe(false);
  });

  it("is invalid when cached data URL is empty", () => {
    expect(isRepoFaviconCacheValid({ ...entry, dataUrl: "data:image/x-icon;base64," }, "deploy-1")).toBe(false);
  });
});

describe("parseSvgDimensions", () => {
  const svg = (attrs: string) => Buffer.from(`<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" ${attrs}><rect width="10" height="10"/></svg>`);

  it("reads absolute width and height", () => {
    expect(parseSvgDimensions(svg('width="64" height="64"'))).toEqual({ width: 64, height: 64 });
    expect(parseSvgDimensions(svg('width="320px" height="64px"'))).toEqual({ width: 320, height: 64 });
  });

  it("falls back to viewBox when width/height are relative or absent", () => {
    expect(parseSvgDimensions(svg('viewBox="0 0 48 48"'))).toEqual({ width: 48, height: 48 });
    expect(parseSvgDimensions(svg('width="100%" height="100%" viewBox="0 0 320 64"'))).toEqual({
      width: 320,
      height: 64,
    });
  });

  it("returns null when the shape cannot be determined", () => {
    expect(parseSvgDimensions(svg(""))).toBeNull();
    expect(parseSvgDimensions(Buffer.from("not an svg"))).toBeNull();
  });
});

describe("scoreFaviconWithDimensions — SVG wordmarks", () => {
  it("measures a wide SVG wordmark and ranks it below a square one", () => {
    const wide = scoreFaviconWithDimensions("public/favicon.svg", { width: 320, height: 64 });
    const square = scoreFaviconWithDimensions("public/favicon.svg", { width: 64, height: 64 });
    expect(wide).not.toBeNull();
    expect(square!).toBeGreaterThan(wide!);
  });

  it("keeps a square SVG", () => {
    expect(scoreFaviconWithDimensions("public/favicon.svg", { width: 64, height: 64 })).not.toBeNull();
  });

  it("stays lenient when an SVG cannot be measured", () => {
    expect(scoreFaviconWithDimensions("public/favicon.svg", null)).not.toBeNull();
  });
});

describe("findDeclarationEntryFiles", () => {
  it("finds the Astro base layout, which has no index.html", () => {
    const entries = findDeclarationEntryFiles([
      "astro.config.mjs",
      "public/favicon.svg",
      "src/layouts/Layout.astro",
      "src/pages/index.astro",
      "src/components/Nav.astro",
    ]);

    expect(entries[0]).toBe("src/layouts/Layout.astro");
    expect(entries).toContain("src/pages/index.astro");
    expect(entries).not.toContain("src/components/Nav.astro");
  });

  it("covers SvelteKit, Nuxt and Next entry documents", () => {
    expect(findDeclarationEntryFiles(["src/app.html"])).toEqual(["src/app.html"]);
    expect(findDeclarationEntryFiles(["app.vue"])).toEqual(["app.vue"]);
    expect(findDeclarationEntryFiles(["app/layout.tsx"])).toEqual(["app/layout.tsx"]);
  });

  it("prefers an entry inside the configured web directory", () => {
    const entries = findDeclarationEntryFiles(
      ["other/src/layouts/Layout.astro", "site/src/layouts/Layout.astro"],
      { webDirectory: "site" },
    );
    expect(entries[0]).toBe("site/src/layouts/Layout.astro");
  });

  it("bounds how many entry files are read", () => {
    const many = Array.from({ length: 20 }, (_, i) => `src/layouts/L${i}.astro`);
    expect(findDeclarationEntryFiles(many).length).toBeLessThanOrEqual(4);
  });
});

describe("declared icons beat filename guessing", () => {
  it("ranks a declared favicon.svg above a conventional favicon.ico", () => {
    const declaredSvg = scoreFaviconWithDimensions("public/favicon.svg", { width: 64, height: 64 }, true);
    const guessedIco = scoreFaviconWithDimensions("public/favicon.ico", { width: 32, height: 32 }, false);
    expect(declaredSvg).not.toBeNull();
    expect(guessedIco).not.toBeNull();
    expect(declaredSvg!).toBeGreaterThan(guessedIco!);
  });

  it("does not veto a declared wide mark — the project chose it", () => {
    expect(scoreFaviconWithDimensions("public/favicon.svg", { width: 320, height: 64 }, true)).not.toBeNull();
  });

  it("keeps a wide SVG mark but ranks it below a square one", () => {
    const wide = scoreFaviconWithDimensions("public/favicon.svg", { width: 320, height: 64 }, false);
    const square = scoreFaviconWithDimensions("public/favicon.svg", { width: 64, height: 64 }, false);
    expect(wide).not.toBeNull();
    expect(square!).toBeGreaterThan(wide!);
  });

  it("still vetoes a wide raster favicon, which cannot scale", () => {
    expect(scoreFaviconWithDimensions("public/favicon.png", { width: 320, height: 64 }, false)).toBeNull();
    expect(scoreFaviconWithDimensions("public/favicon.ico", { width: 320, height: 64 }, false)).toBeNull();
  });

  it("prefers favicon.svg over favicon.ico among guesses", () => {
    expect(scoreFaviconPath("public/favicon.svg")).toBeGreaterThan(scoreFaviconPath("public/favicon.ico"));
  });
});
