import type { TechBadgeInfo } from "../types";
import {
  BADGE_SECONDARY,
  BADGE_SUPERSEDES,
  BADGE_WHITELIST,
} from "../data/badgeWhitelist";

const CACHE_VERSION = 2;
const CACHE_PREFIX = `project-badges:v${CACHE_VERSION}:`;
/** Badges follow the repo's stack, which moves slowly; a week keeps them fresh enough. */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedProjectBadges {
  repoKey: string;
  branch: string;
  connectionId: string;
  badges: TechBadgeInfo[];
  /** Absent on entries written before the TTL existed; those are treated as expired. */
  savedAt?: number;
}

function storageKey(projectId: string): string {
  return `${CACHE_PREFIX}${projectId}`;
}

function getSuppressedBadgeNames(names: ReadonlySet<string>): Set<string> {
  const suppressed = new Set<string>();
  for (const name of names) {
    for (const child of BADGE_SUPERSEDES[name] ?? []) {
      if (names.has(child)) suppressed.add(child);
    }
  }
  return suppressed;
}

export function selectProjectBadges(badges: TechBadgeInfo[], limit = 4): TechBadgeInfo[] {
  const whitelisted = badges.filter((badge) => BADGE_WHITELIST.has(badge.name));
  const names = new Set(whitelisted.map((badge) => badge.name));
  const suppressed = getSuppressedBadgeNames(names);

  let filtered = whitelisted.filter((badge) => !suppressed.has(badge.name));

  const hasMajor = filtered.some((badge) => !BADGE_SECONDARY.has(badge.name));
  if (hasMajor) {
    filtered = filtered.filter((badge) => !BADGE_SECONDARY.has(badge.name));
  }

  return filtered
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
    if (!cached.savedAt || Date.now() - cached.savedAt > CACHE_TTL_MS) {
      localStorage.removeItem(storageKey(projectId));
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
    const payload: CachedProjectBadges = {
      repoKey,
      branch,
      connectionId,
      badges,
      savedAt: Date.now(),
    };
    localStorage.setItem(storageKey(projectId), JSON.stringify(payload));
  } catch {
    // quota exceeded — ignore
  }
}

/**
 * Drops expired entries and every key from an older cache version.
 *
 * A read only ever touches its own project's key, so entries for deleted
 * projects and keys left by `v1` were never reclaimed and grew for good.
 */
export function pruneProjectBadgeCache(): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith("project-badges:")) continue;
      if (!key.startsWith(CACHE_PREFIX)) {
        stale.push(key);
        continue;
      }
      try {
        const entry = JSON.parse(localStorage.getItem(key) ?? "") as CachedProjectBadges;
        if (!entry.savedAt || Date.now() - entry.savedAt > CACHE_TTL_MS) stale.push(key);
      } catch {
        stale.push(key);
      }
    }
    for (const key of stale) localStorage.removeItem(key);
  } catch {
    // storage unavailable — nothing to prune
  }
}

export function clearProjectBadgeCache(projectId: string): void {
  try {
    localStorage.removeItem(storageKey(projectId));
  } catch {
    // ignore
  }
}
