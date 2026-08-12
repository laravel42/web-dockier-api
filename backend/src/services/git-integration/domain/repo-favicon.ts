import type { ConnectionLike, RepoRef } from "./providers/provider-client.js";
import { fetchRepoFile, fetchRepoFileBuffer, getRepoFileTree } from "./providers/provider-client.js";

const STATIC_FAVICON_PATHS = [
  "favicon.ico",
  "favicon.png",
  "favicon.svg",
  "public/favicon.ico",
  "public/favicon.png",
  "public/favicon.svg",
  "static/favicon.ico",
  "static/favicon.png",
  "assets/favicon.ico",
  "assets/favicon.png",
  "src/favicon.ico",
  "app/favicon.ico",
  "app/icon.png",
  "app/icon.ico",
];

/**
 * Files that can carry a `<link rel="icon">` declaration.
 *
 * Looking only at `index.html` misses every framework that renders its own
 * document — Astro declares the icon in `src/layouts/*.astro`, SvelteKit in
 * `src/app.html`, Nuxt in `app.vue`. Those projects were falling through to
 * filename guessing even though they state the answer explicitly.
 */
const ENTRY_FILE_PATTERNS: RegExp[] = [
  /(^|\/)index\.html$/i,
  /(^|\/)app\.html$/i,
  /(^|\/)app\.vue$/i,
  /(^|\/)src\/layouts\/[^/]*\.astro$/i,
  /(^|\/)src\/pages\/index\.astro$/i,
  /(^|\/)app\/layout\.(tsx|jsx|ts|js)$/i,
  /(^|\/)src\/app\/layout\.(tsx|jsx|ts|js)$/i,
];

/** Entry files are fetched one at a time, so keep the worst case bounded. */
const MAX_ENTRY_FILES = 4;

/** Acceptable aspect ratio range — rejects wide wordmarks and tall banners. */
export const FAVICON_ASPECT_RATIO_MIN = 0.8;
export const FAVICON_ASPECT_RATIO_MAX = 1.25;

/** Ideal square-ish favicon range for scoring bonus. */
export const FAVICON_IDEAL_ASPECT_MIN = 0.85;
export const FAVICON_IDEAL_ASPECT_MAX = 1.15;

export interface ImageDimensions {
  width: number;
  height: number;
}

function normalizeDir(value: string | undefined): string {
  return (value ?? "").replace(/^\/+|\/+$/g, "");
}

function prefixPaths(base: string, paths: string[]): string[] {
  if (!base) return paths;
  return paths.map((path) => `${base}/${path}`);
}

function resolveRelativePath(baseFile: string, href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("data:") || /^https?:\/\//i.test(trimmed)) {
    return null;
  }

  const cleanHref = trimmed.split(/[?#]/)[0] ?? trimmed;
  if (cleanHref.startsWith("/")) {
    return cleanHref.replace(/^\/+/, "");
  }

  const baseDir = baseFile.includes("/") ? baseFile.slice(0, baseFile.lastIndexOf("/")) : "";
  const segments = [...(baseDir ? baseDir.split("/") : []), ...cleanHref.split("/")];
  const resolved: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return resolved.join("/");
}

function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ico":
      return "image/x-icon";
    case "png":
      return "image/png";
    case "svg":
      return "image/svg+xml";
    case "webp":
      return "image/webp";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

function toDataUrl(buffer: Buffer, path: string): string {
  const mimeType = mimeFromPath(path);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

/** Reject empty/invalid data URLs (e.g. `data:image/x-icon;base64,`). Null is valid (no favicon). */
export function isValidFaviconDataUrl(dataUrl: string | null | undefined): boolean {
  if (dataUrl === null || dataUrl === undefined) return true;
  if (typeof dataUrl !== "string" || !dataUrl.trim()) return false;

  const dataUrlMatch = /^data:([^;,]+)?(?:;base64)?,(.*)$/i.exec(dataUrl);
  if (dataUrlMatch) {
    const payload = dataUrlMatch[2] ?? "";
    if (!payload.trim()) return false;
    if (dataUrl.includes(";base64,") && payload.trim().length < 4) return false;
    return true;
  }

  return /^https?:\/\//i.test(dataUrl);
}

export function bufferToFaviconDataUrl(buffer: Buffer, path: string): string | null {
  if (!buffer.length) return null;
  const dataUrl = toDataUrl(buffer, path);
  return isValidFaviconDataUrl(dataUrl) ? dataUrl : null;
}

/**
 * Bump when resolver logic changes in a way that could produce a different icon
 * for unchanged source. Cached entries from an older version are re-resolved
 * rather than served, so a fix reaches existing projects without waiting for
 * their next deploy. v2: SVGs are measured and aspect-filtered. v3: the
 * project's own icon declaration outranks filename guessing, and wide SVG
 * marks are ranked rather than discarded.
 */
export const REPO_FAVICON_RESOLVER_VERSION = 3;

export interface RepoFaviconCacheEntry {
  dataUrl: string | null;
  resolvedAt: string;
  /** Latest successful deployment ID at resolve time — cache invalidates on next deploy. */
  deployId: string | null;
  /** Resolver version that produced this entry; absent on pre-versioned entries. */
  version?: number;
}

export function isRepoFaviconCacheValid(
  cached: RepoFaviconCacheEntry | undefined,
  latestDeployId: string | null,
): boolean {
  if (!cached?.resolvedAt) return false;
  if (!isValidFaviconDataUrl(cached.dataUrl)) return false;
  if ((cached.version ?? 1) !== REPO_FAVICON_RESOLVER_VERSION) return false;
  return (cached.deployId ?? null) === latestDeployId;
}

function findExactPath(files: string[], candidate: string): string | null {
  const normalized = candidate.replace(/^\/+/, "");
  return files.find((file) => file.toLowerCase() === normalized.toLowerCase()) ?? null;
}

export function getAspectRatio(width: number, height: number): number {
  if (height <= 0) return Infinity;
  return width / height;
}

export function isSuitableFaviconAspectRatio(ratio: number): boolean {
  return ratio >= FAVICON_ASPECT_RATIO_MIN && ratio <= FAVICON_ASPECT_RATIO_MAX;
}

/** Parse PNG width/height from the IHDR chunk. */
export function parsePngDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 24) return null;
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
    return null;
  }
  if (buffer.toString("ascii", 12, 16) !== "IHDR") return null;

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

/** Parse ICO dimensions — prefers the largest square entry, else first entry. */
export function parseIcoDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 6) return null;
  const count = buffer.readUInt16LE(4);
  if (count === 0) return null;

  let bestSquare: ImageDimensions | null = null;
  let bestSquareSize = 0;
  let firstEntry: ImageDimensions | null = null;

  for (let i = 0; i < count; i++) {
    const offset = 6 + i * 16;
    if (buffer.length < offset + 16) break;

    let width = buffer[offset] ?? 0;
    let height = buffer[offset + 1] ?? 0;
    if (width === 0) width = 256;
    if (height === 0) height = 256;

    const dim = { width, height };
    if (i === 0) firstEntry = dim;

    if (width === height && width > bestSquareSize) {
      bestSquare = dim;
      bestSquareSize = width;
    }
  }

  return bestSquare ?? firstEntry;
}

/** A length is only informative if it's absolute; `100%` says nothing about shape. */
function parseSvgLength(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.endsWith("%")) return null;
  const value = Number.parseFloat(trimmed);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Parse SVG dimensions from width/height, falling back to the viewBox.
 *
 * Without this an SVG is unmeasurable, and a wide wordmark like a 320x64
 * `favicon.svg` sails past the aspect filter and renders distorted in a square
 * avatar. Returns null when the shape genuinely can't be determined.
 */
export function parseSvgDimensions(buffer: Buffer): ImageDimensions | null {
  const head = buffer.toString("utf8", 0, Math.min(buffer.length, 4096));
  const openTag = /<svg\b[^>]*>/i.exec(head)?.[0];
  if (!openTag) return null;

  const attr = (name: string): string | undefined =>
    new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(openTag)?.[1];

  const width = parseSvgLength(attr("width"));
  const height = parseSvgLength(attr("height"));
  if (width && height) return { width, height };

  const viewBox = attr("viewBox");
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map((n) => Number.parseFloat(n));
    if (parts.length === 4) {
      const vbWidth = parts[2];
      const vbHeight = parts[3];
      if (Number.isFinite(vbWidth) && Number.isFinite(vbHeight) && vbWidth! > 0 && vbHeight! > 0) {
        return { width: vbWidth!, height: vbHeight! };
      }
    }
  }

  return null;
}

export function parseImageDimensions(buffer: Buffer, path: string): ImageDimensions | null {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return parsePngDimensions(buffer);
    case "ico":
      return parseIcoDimensions(buffer);
    case "svg":
      return parseSvgDimensions(buffer);
    default:
      return null;
  }
}

/** Path-based score before fetching image bytes. Higher is better. */
export function scoreFaviconPath(path: string): number {
  const lower = path.toLowerCase();
  let score = 0;

  // SVG first: it is the mark a modern project actually authors, while a
  // leftover favicon.ico is often a framework default nobody replaced.
  if (/(^|\/)favicon\.svg$/i.test(lower)) score += 100;
  else if (/(^|\/)favicon\.png$/i.test(lower)) score += 90;
  else if (/(^|\/)favicon\.ico$/i.test(lower)) score += 85;
  else if (/favicon\.(ico|png|svg|webp)$/i.test(lower)) score += 70;
  else if (/apple-touch-icon/i.test(lower)) score += 20;
  else score += 40;

  if (lower.includes("logo")) score -= 50;
  if (/(^|\/)icon-\d+/i.test(lower)) score -= 10;

  return score;
}

/**
 * Combined path + dimension score. Returns null when the image is unsuitable (e.g. wordmark).
 * SVG favicons skip dimension checks.
 */
export function scoreFaviconWithDimensions(
  path: string,
  dimensions: ImageDimensions | null,
  declared = false,
): number | null {
  let score = scoreFaviconPath(path);
  const ext = path.split(".").pop()?.toLowerCase();

  if (declared) {
    // The project named this file as its icon, so stop guessing. It outranks
    // every conventional match and is never vetoed on shape: a deliberately wide
    // mark is still this project's favicon, and the client letterboxes rather
    // than distorting it.
    score += 500;
    if (ext === "svg") score += 10;
    return score;
  }

  // An unmeasurable image keeps its path score rather than being rejected, but a
  // measurable one — SVG included — must pass the aspect filter like any other.
  if (!dimensions) return ext === "svg" ? score : score - 10;

  const ratio = getAspectRatio(dimensions.width, dimensions.height);

  // Shape vetoes raster only. A wide PNG/ICO favicon renders badly at any size
  // and is nearly always a mistake, but an SVG is vector, scales cleanly, and is
  // letterboxed rather than distorted by the client — so a wide SVG mark is
  // ranked below a square one instead of being thrown away.
  if (ext !== "svg" && !isSuitableFaviconAspectRatio(ratio)) return null;

  if (ratio >= FAVICON_IDEAL_ASPECT_MIN && ratio <= FAVICON_IDEAL_ASPECT_MAX) {
    score += 50;
  } else {
    score += 20;
  }

  const maxDim = Math.max(dimensions.width, dimensions.height);
  const minDim = Math.min(dimensions.width, dimensions.height);

  if (minDim >= 16 && maxDim <= 64) score += 30;
  else if (maxDim > 128) score -= 30;

  return score;
}

function addUniquePath(paths: string[], seen: Set<string>, path: string | null): void {
  if (!path) return;
  const key = path.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  paths.push(path);
}

/** Collect favicon path candidates ordered by static path priority. */
export function findRepoFaviconPaths(
  files: string[],
  options?: { rootDirectory?: string; webDirectory?: string },
): string[] {
  const rootDirectory = normalizeDir(options?.rootDirectory);
  const webDirectory = normalizeDir(options?.webDirectory);
  const candidates: string[] = [];
  const seen = new Set<string>();

  const staticCandidates = [
    ...prefixPaths(webDirectory, STATIC_FAVICON_PATHS),
    ...prefixPaths(rootDirectory, STATIC_FAVICON_PATHS),
    ...STATIC_FAVICON_PATHS,
  ];

  for (const candidate of staticCandidates) {
    addUniquePath(candidates, seen, findExactPath(files, candidate));
  }

  for (const file of files) {
    if (/(^|\/)favicon\.(ico|png|svg|webp)$/i.test(file)) {
      addUniquePath(candidates, seen, file);
    }
  }

  for (const file of files) {
    if (/apple-touch-icon.*\.(png|ico|svg|webp)$/i.test(file)) {
      addUniquePath(candidates, seen, file);
    }
  }

  return candidates;
}

/** @deprecated Prefer findRepoFaviconPaths — returns highest-priority static path match. */
export function findRepoFaviconPath(
  files: string[],
  options?: { rootDirectory?: string; webDirectory?: string },
): string | null {
  return findRepoFaviconPaths(files, options)[0] ?? null;
}

function extractIconHrefsFromHtml(html: string, baseFile: string): string[] {
  const hrefs: string[] = [];
  const linkPattern = /<link\b[^>]*>/gi;
  for (const tag of html.match(linkPattern) ?? []) {
    const rel = tag.match(/\brel=["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? "";
    if (!/(^|\s)(shortcut\s+icon|icon)(\s|$)/.test(rel)) continue;
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const resolved = resolveRelativePath(baseFile, href);
    if (resolved) hrefs.push(resolved);
  }
  return hrefs;
}

async function findFaviconPathsFromManifest(
  connection: ConnectionLike,
  ref: RepoRef,
  files: string[],
  manifestPath: string,
): Promise<string[]> {
  const content = await fetchRepoFile(connection, ref, manifestPath);
  if (!content) return [];

  try {
    const parsed = JSON.parse(content) as { icons?: Array<{ src?: string; sizes?: string }> };
    const paths: string[] = [];
    const seen = new Set<string>();

    for (const icon of parsed.icons ?? []) {
      if (!icon.src) continue;
      const resolved = resolveRelativePath(manifestPath, icon.src);
      const match = resolved ? findExactPath(files, resolved) : null;
      if (!match) continue;

      const key = match.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      paths.push(match);
    }

    return paths;
  } catch {
    return [];
  }
}

async function findFaviconPathsFromHtmlFiles(
  connection: ConnectionLike,
  ref: RepoRef,
  files: string[],
  htmlPaths: string[],
): Promise<string[]> {
  const paths: string[] = [];
  const seen = new Set<string>();

  for (const htmlPath of htmlPaths) {
    const content = await fetchRepoFile(connection, ref, htmlPath);
    if (!content) continue;

    for (const href of extractIconHrefsFromHtml(content, htmlPath)) {
      const match = findExactPath(files, href);
      addUniquePath(paths, seen, match);
    }
  }

  return paths;
}

/** Rank entry documents by how likely they are to be the root document. */
function scoreEntryFile(path: string, rootDirectory: string, webDirectory: string): number {
  const lower = path.toLowerCase();
  let score = 0;

  if (/(^|\/)index\.html$/.test(lower)) score += 100;
  else if (/(^|\/)app\.html$/.test(lower)) score += 95;
  else if (/(layout|base|main|default)\.astro$/.test(lower)) score += 92;
  else if (/src\/layouts\//.test(lower)) score += 85;
  else if (/layout\.(tsx|jsx|ts|js)$/.test(lower)) score += 80;
  else if (/src\/pages\/index\.astro$/.test(lower)) score += 75;
  else score += 60;

  // A configured monorepo sub-app is more relevant than a sibling package.
  if (webDirectory && lower.startsWith(`${webDirectory.toLowerCase()}/`)) score += 40;
  else if (rootDirectory && lower.startsWith(`${rootDirectory.toLowerCase()}/`)) score += 30;

  // Shallower paths are likelier to be the real root document.
  score -= lower.split("/").length;
  return score;
}

/** Entry documents worth reading for an icon declaration, best first. */
export function findDeclarationEntryFiles(
  files: string[],
  options?: { rootDirectory?: string; webDirectory?: string },
): string[] {
  const rootDirectory = normalizeDir(options?.rootDirectory);
  const webDirectory = normalizeDir(options?.webDirectory);

  return files
    .filter((file) => ENTRY_FILE_PATTERNS.some((pattern) => pattern.test(file)))
    .sort(
      (a, b) =>
        scoreEntryFile(b, rootDirectory, webDirectory) - scoreEntryFile(a, rootDirectory, webDirectory),
    )
    .slice(0, MAX_ENTRY_FILES);
}

export interface RepoFaviconCandidate {
  path: string;
  /** True when the project names this file as its icon in its own entry document. */
  declared: boolean;
}

/**
 * Ordered favicon candidates.
 *
 * Declaration beats convention: read what the project says its icon is before
 * guessing from filenames. Only when nothing is declared do conventional paths
 * and manifest icons come into play.
 */
export async function resolveRepoFaviconCandidates(
  connection: ConnectionLike,
  ref: RepoRef,
  options?: { rootDirectory?: string; webDirectory?: string },
): Promise<RepoFaviconCandidate[]> {
  const files = await getRepoFileTree(connection, ref);
  const candidates: RepoFaviconCandidate[] = [];
  const seen = new Set<string>();

  const push = (path: string | null, declared: boolean): void => {
    if (!path) return;
    const key = path.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ path, declared });
  };

  // 1. What the project declares. Stop at the first entry document that answers,
  //    so the common case costs one extra file read rather than MAX_ENTRY_FILES.
  for (const entryFile of findDeclarationEntryFiles(files, options)) {
    const declaredPaths = await findFaviconPathsFromHtmlFiles(connection, ref, files, [entryFile]);
    if (declaredPaths.length === 0) continue;
    for (const path of declaredPaths) push(path, true);
    break;
  }

  // 2. Conventional filenames — guesses, subject to the shape filter.
  for (const path of findRepoFaviconPaths(files, options)) push(path, false);

  // 3. Manifest icons last: they are app icons (often large or maskable) rather
  //    than favicons, so they only fill in when nothing better exists.
  const manifestCandidates = files.filter((file) =>
    /(^|\/)site\.webmanifest$|(^|\/)manifest\.json$/i.test(file),
  );
  for (const manifestPath of manifestCandidates) {
    for (const path of await findFaviconPathsFromManifest(connection, ref, files, manifestPath)) {
      push(path, false);
    }
  }

  return candidates;
}

export async function resolveRepoFaviconPaths(
  connection: ConnectionLike,
  ref: RepoRef,
  options?: { rootDirectory?: string; webDirectory?: string },
): Promise<string[]> {
  const candidates = await resolveRepoFaviconCandidates(connection, ref, options);
  return candidates.map((candidate) => candidate.path);
}

export async function resolveRepoFaviconPath(
  connection: ConnectionLike,
  ref: RepoRef,
  options?: { rootDirectory?: string; webDirectory?: string },
): Promise<string | null> {
  const paths = await resolveRepoFaviconPaths(connection, ref, options);
  return paths[0] ?? null;
}

export async function resolveRepoFaviconDataUrl(
  connection: ConnectionLike,
  ref: RepoRef,
  options?: { rootDirectory?: string; webDirectory?: string },
): Promise<string | null> {
  const candidates = await resolveRepoFaviconCandidates(connection, ref, options);
  if (!candidates.length) return null;

  let bestPath: string | null = null;
  let bestBuffer: Buffer | null = null;
  let bestScore = -Infinity;

  for (const { path, declared } of candidates) {
    const file = await fetchRepoFileBuffer(connection, ref, path);
    if (!file?.buffer.length) continue;

    const dimensions = parseImageDimensions(file.buffer, path);
    const score = scoreFaviconWithDimensions(path, dimensions, declared);
    if (score === null) continue;

    if (score > bestScore) {
      bestScore = score;
      bestPath = path;
      bestBuffer = file.buffer;
    }
  }

  if (!bestPath || !bestBuffer) return null;
  return bufferToFaviconDataUrl(bestBuffer, bestPath);
}
