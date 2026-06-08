import { useState, useEffect, useRef, useMemo } from "react";
import { gitApi } from "../services/api";
import { getRepoKey } from "../utils/parseOwnerRepo";
import {
  getProjectBadgeCache,
  setProjectBadgeCache,
  selectProjectBadges,
} from "../utils/projectBadgeCache";
import type { TechBadgeInfo } from "../types";

export interface ProjectBadgesResult {
  badges: Record<string, TechBadgeInfo[]>;
  loadingIds: ReadonlySet<string>;
}

function projectFetchKey(
  p: { repository: string; branch?: string; connectionId?: string },
): string {
  return `${p.repository}:${p.branch ?? ""}:${p.connectionId ?? ""}`;
}

/**
 * Fetches tech badge info for a list of projects.
 * Results are cached in localStorage per project (invalidated when repo/branch/connection changes).
 * Returns max 4 major-framework badges per project (whitelist + dedup).
 */
export function useProjectBadges(
  projects: Array<{ id: string; repository: string; branch?: string; connectionId?: string }>,
): ProjectBadgesResult {
  const [fetchedLangs, setFetchedLangs] = useState<Record<string, TechBadgeInfo[]>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(() => new Set());
  const fetchedRef = useRef<Map<string, string>>(new Map());

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
      if (cached !== null) result[p.id] = cached;
    }
    return result;
    // projectsKey captures repo/branch/connection changes for the current projects list
    // eslint-disable-next-line react-hooks/exhaustive-deps -- projectsKey is a stable content hash
  }, [projectsKey]);

  useEffect(() => {
    setFetchedLangs({});
    setLoadingIds(new Set());
  }, [projectsKey]);

  useEffect(() => {
    if (projects.length === 0) return;

    const currentIds = new Set(projects.map((p) => p.id));
    for (const id of fetchedRef.current.keys()) {
      if (!currentIds.has(id)) fetchedRef.current.delete(id);
    }

    for (const p of projects) {
      if (!p.repository) continue;

      const repoKey = getRepoKey(p.repository);
      if (!repoKey) continue;

      const branch = p.branch || "main";
      const connectionId = p.connectionId || "";
      const fetchKey = projectFetchKey(p);

      if (fetchedRef.current.get(p.id) === fetchKey) continue;

      const cached = getProjectBadgeCache(p.id, repoKey, branch, connectionId);
      if (cached !== null) {
        fetchedRef.current.set(p.id, fetchKey);
        continue;
      }

      fetchedRef.current.set(p.id, fetchKey);
      setLoadingIds((prev) => new Set(prev).add(p.id));

      void gitApi
        .getRepoBadges(repoKey, branch, connectionId || undefined)
        .then((res) => {
          const badges = selectProjectBadges(res.badges || []);
          setProjectBadgeCache(p.id, repoKey, branch, connectionId, badges);
          setFetchedLangs((prev) => ({ ...prev, [p.id]: badges }));
        })
        .catch(() => {
          setFetchedLangs((prev) => ({ ...prev, [p.id]: [] }));
        })
        .finally(() => {
          setLoadingIds((prev) => {
            const next = new Set(prev);
            next.delete(p.id);
            return next;
          });
        });
    }
    // projectsKey captures repo/branch/connection changes for the current projects list
    // eslint-disable-next-line react-hooks/exhaustive-deps -- projectsKey is a stable content hash
  }, [projectsKey]);

  const badges = useMemo(
    () => ({ ...cachedLangs, ...fetchedLangs }),
    [cachedLangs, fetchedLangs],
  );

  return { badges, loadingIds };
}
