import { useState, useEffect, useRef } from "react";
import { gitApi } from "../services/api";
import { getRepoKey } from "../utils/parseOwnerRepo";
import { BADGE_WHITELIST } from "../data/badgeWhitelist";
import type { TechBadgeInfo } from "../types";

/**
 * Fetches tech badge info for a list of projects.
 * Filters to whitelisted frameworks/CMS/UI kits only (same as RepoInfoCard).
 * Returns max 4 badges per project.
 */
export function useProjectBadges(
  projects: Array<{ id: string; repository: string; branch?: string; connectionId?: string }>,
): Record<string, TechBadgeInfo[]> {
  const [projectLangs, setProjectLangs] = useState<Record<string, TechBadgeInfo[]>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (projects.length === 0) return;
    // Reset fetched ref when project list changes (e.g. after creation)
    const currentIds = new Set(projects.map(p => p.id));
    for (const id of fetchedRef.current) {
      if (!currentIds.has(id)) fetchedRef.current.delete(id);
    }
    for (const p of projects) {
      if (!p.repository || fetchedRef.current.has(p.id)) continue;
      fetchedRef.current.add(p.id);
      const key = getRepoKey(p.repository);
      if (!key) continue;
      gitApi
        .getRepoBadges(key, p.branch || undefined, p.connectionId || undefined)
        .then((res) => {
          const filtered = (res.badges || []).filter(b => BADGE_WHITELIST.has(b.name)).slice(0, 4);
          if (filtered.length > 0) {
            setProjectLangs((prev) => ({ ...prev, [p.id]: filtered }));
          }
        })
        .catch(() => {});
    }
  }, [projects]);

  return projectLangs;
}
