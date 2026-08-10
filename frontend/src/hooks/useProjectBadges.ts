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

interface ProjectInput {
  id: string;
  repository: string;
  branch?: string;
  connectionId?: string;
}

function buildFetchKey(p: ProjectInput): string {
  return `${p.repository}:${p.branch ?? ""}:${p.connectionId ?? ""}`;
}

/**
 * Fetches tech badge info for a list of projects.
 * Results are cached in localStorage per project (invalidated when repo/branch/connection changes).
 * Returns max 4 major-framework badges per project sorted by confidence.
 */
export function useProjectBadges(projects: ProjectInput[]): ProjectBadgesResult {
  const [badges, setBadges] = useState<Record<string, TechBadgeInfo[]>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(() => new Set());
  const fetchedRef = useRef<Map<string, string>>(new Map());

  // Stable content-hash of the projects list for dependency tracking
  const projectsKey = useMemo(
    () => projects.map((p) => `${p.id}:${buildFetchKey(p)}`).join("|"),
    [projects],
  );

  useEffect(() => {
    // Reset state when the projects list changes structurally
    setBadges({});
    setLoadingIds(new Set());
    fetchedRef.current.clear();
  }, [projectsKey]);

  useEffect(() => {
    if (projects.length === 0) return;

    const pending = new Set<string>();
    const immediateResults: Record<string, TechBadgeInfo[]> = {};

    for (const p of projects) {
      if (!p.repository) continue;

      const repoKey = getRepoKey(p.repository);
      if (!repoKey) continue;

      const branch = p.branch || "main";
      const connectionId = p.connectionId || "";
      const fetchKey = buildFetchKey(p);

      // Skip if already fetched with the same key
      if (fetchedRef.current.get(p.id) === fetchKey) continue;
      fetchedRef.current.set(p.id, fetchKey);

      // Check localStorage cache first
      const cached = getProjectBadgeCache(p.id, repoKey, branch, connectionId);
      if (cached !== null) {
        immediateResults[p.id] = cached;
        continue;
      }

      // Mark as loading and fetch from API
      pending.add(p.id);
      fetchBadge(p.id, repoKey, branch, connectionId);
    }

    // Apply cached results synchronously
    if (Object.keys(immediateResults).length > 0) {
      setBadges((prev) => ({ ...prev, ...immediateResults }));
    }
    if (pending.size > 0) {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        for (const id of pending) next.add(id);
        return next;
      });
    }

    async function fetchBadge(
      projectId: string,
      repoKey: string,
      branch: string,
      connectionId: string,
    ): Promise<void> {
      try {
        const res = await gitApi.getRepoBadges(repoKey, branch, connectionId || undefined);
        const selected = selectProjectBadges(res.badges || []);
        setProjectBadgeCache(projectId, repoKey, branch, connectionId, selected);
        setBadges((prev) => ({ ...prev, [projectId]: selected }));
      } catch {
        setBadges((prev) => ({ ...prev, [projectId]: [] }));
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(projectId);
          return next;
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- projectsKey is a stable content hash
  }, [projectsKey]);

  return { badges, loadingIds };
}
