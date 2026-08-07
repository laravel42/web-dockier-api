import type { PartialBlock } from "@blocknote/core";
import type { Project } from "@/types";

const CACHE_VERSION = 1;

export interface OverviewCacheEntry {
  blocks: PartialBlock[] | undefined;
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
