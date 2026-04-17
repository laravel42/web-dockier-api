import { useState, useEffect, useRef } from "react";
import { gitApi } from "../services/api";
import { getRepoKey } from "../utils/parseOwnerRepo";
import type { TechBadgeInfo } from "../types";

/**
 * Fetches tech badge info for a list of projects.
 * Deduplicates requests using a ref to track already-fetched project IDs.
 */
export function useProjectBadges(
  projects: Array<{ id: string; repository: string; branch?: string }>,
): Record<string, TechBadgeInfo[]> {
  const [projectLangs, setProjectLangs] = useState<Record<string, TechBadgeInfo[]>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (projects.length === 0) return;
    for (const p of projects) {
      if (!p.repository || fetchedRef.current.has(p.id)) continue;
      fetchedRef.current.add(p.id);
      const key = getRepoKey(p.repository);
      if (!key) continue;
      gitApi
        .getRepoBadges(key, p.branch || undefined)
        .then((res) => {
          if (res.badges && res.badges.length > 0) {
            setProjectLangs((prev) => ({ ...prev, [p.id]: res.badges }));
          }
        })
        .catch(() => {});
    }
  }, [projects]);

  return projectLangs;
}
