import type { Project } from "@/types";

/*
  v2 caches the markdown itself. v1 cached BlockNote blocks, which meant the
  README was parsed to blocks and serialised back just to display it — a lossy
  round-trip that existed only because the overview used to be editable. The
  version sits in the key, so v1 entries are simply never read.
*/
const CACHE_VERSION = 2;

export interface OverviewCacheEntry {
  markdown: string | undefined;
  loadError: string | null;
}

const memory = new Map<string, OverviewCacheEntry>();

export function getOverviewCacheKey(project: Project): string {
  const repo = project.repository ?? "";
  const branch = project.branch ?? "main";
  const conn = project.connectionId ?? "";
  return `overview:v${CACHE_VERSION}:${project.id}:${conn}:${repo}:${branch}`;
}

export function getCachedOverview(key: string): OverviewCacheEntry | null {
  const hit = memory.get(key);
  if (hit) return hit;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as OverviewCacheEntry;
    memory.set(key, entry);
    return entry;
  } catch {
    return null;
  }
}

export function setCachedOverview(key: string, entry: OverviewCacheEntry): void {
  memory.set(key, entry);
  try {
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    /* quota */
  }
}
