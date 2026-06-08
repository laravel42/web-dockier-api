import { useState, useEffect, useRef, useMemo } from "react";
import { gitApi } from "../services/api";
import { getRepoKey } from "../utils/parseOwnerRepo";
import {
  getProjectBadgeCache,
  setProjectBadgeCache,
  selectProjectBadges,
} from "../utils/projectBadgeCache";
import type { TechBadgeInfo } from "../types";

/**
 * Fetches tech badge info for a list of projects.
 * Results are cached in localStorage per project (invalidated when repo/branch/connection changes).
 * Returns max 4 badges per project, sorted by confidence.
 */
export function useProjectBadges(
  projects: Array<{ id: string; repository: string; branch?: string; connectionId?: string }>,
): Record<string, TechBadgeInfo[]> {
  const [fetchedLangs, setFetchedLangs] = useState<Record<string, TechBadgeInfo[]>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  const projectsKey = projects
    .map((p) => `${p.id}:${p.repository}:${p.branch ?? ""}:${p.connectionId ?? ""}`)
    .join("|");

  const cachedLangs = useMemo(() => {
    const result: Record<string, TechBadgeInfo[]> = {};
    for (const p of projects) {
      if (!p.repository) continue;
      const repoKey = getRepoKey(p.repository);
      if (!repoKey) continue;
      const cached = getProjectBadgeCache(p.id, repoKey, p.branch || "main", p.connectionId || "");
      if (cached) result[p.id] = cached;
    }
    return result;
    // projectsKey captures repo/branch/connection changes for the current projects list
    // eslint-disable-next-line react-hooks/exhaustive-deps -- projectsKey is a stable content hash
  }, [projectsKey]);

  useEffect(() => {
    if (projects.length === 0) return;

    const currentIds = new Set(projects.map((p) => p.id));
    for (const id of fetchedRef.current) {
      if (!currentIds.has(id)) fetchedRef.current.delete(id);
    }

    for (const p of projects) {
      if (!p.repository || fetchedRef.current.has(p.id)) continue;

      const repoKey = getRepoKey(p.repository);
      if (!repoKey) continue;

      const branch = p.branch || "main";
      const connectionId = p.connectionId || "";
      if (getProjectBadgeCache(p.id, repoKey, branch, connectionId)) {
        fetchedRef.current.add(p.id);
        continue;
      }

      fetchedRef.current.add(p.id);

      void gitApi
        .getRepoBadges(repoKey, branch, connectionId || undefined)
        .then((res) => {
          const badges = selectProjectBadges(res.badges || []);
          setProjectBadgeCache(p.id, repoKey, branch, connectionId, badges);
          if (badges.length > 0) {
            setFetchedLangs((prev) => ({ ...prev, [p.id]: badges }));
          }
        })
        .catch(() => {});
    }
    // projectsKey captures repo/branch/connection changes for the current projects list
    // eslint-disable-next-line react-hooks/exhaustive-deps -- projectsKey is a stable content hash
  }, [projectsKey]);

  return useMemo(
    () => ({ ...cachedLangs, ...fetchedLangs }),
    [cachedLangs, fetchedLangs],
  );
}
