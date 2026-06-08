import type { TechBadgeInfo } from "../types";

const CACHE_VERSION = 1;
const CACHE_PREFIX = `project-badges:v${CACHE_VERSION}:`;

interface CachedProjectBadges {
  repoKey: string;
  branch: string;
  connectionId: string;
  badges: TechBadgeInfo[];
}

function storageKey(projectId: string): string {
  return `${CACHE_PREFIX}${projectId}`;
}

export function selectProjectBadges(badges: TechBadgeInfo[], limit = 4): TechBadgeInfo[] {
  return [...badges]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}

export function getProjectBadgeCache(
  projectId: string,
  repoKey: string,
  branch: string,
  connectionId: string,
): TechBadgeInfo[] | null {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedProjectBadges;
    if (
      cached.repoKey !== repoKey
      || cached.branch !== branch
      || cached.connectionId !== connectionId
    ) {
      return null;
    }
    return cached.badges;
  } catch {
    return null;
  }
}

export function setProjectBadgeCache(
  projectId: string,
  repoKey: string,
  branch: string,
  connectionId: string,
  badges: TechBadgeInfo[],
): void {
  try {
    const payload: CachedProjectBadges = { repoKey, branch, connectionId, badges };
    localStorage.setItem(storageKey(projectId), JSON.stringify(payload));
  } catch {
    // quota exceeded — ignore
  }
}

export function clearProjectBadgeCache(projectId: string): void {
  try {
    localStorage.removeItem(storageKey(projectId));
  } catch {
    // ignore
  }
}
