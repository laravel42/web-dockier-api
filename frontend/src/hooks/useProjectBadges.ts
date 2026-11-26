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
 *
 * One batch request for the whole list, not one per project. The per-project
 * route analyses the repo on a cache miss and is capped at 30/min per tenant,
 * so a page of 50 (100 on Deploy) pushed most of its requests into a 429 that
 * this hook swallowed — those projects just showed no badges. The batch route
 * reads cache only; `analysis_cache` is warmed when the project is created.
 *
 * Results are cached in localStorage per project, invalidated when the repo,
 * branch or connection changes. Returns at most 4 badges per project.
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
    let cancelled = false;

    const immediateResults: Record<string, TechBadgeInfo[]> = {};
    /**
     * Work to request, indexed by the `repo@branch` the route answers with.
     * Several projects can point at the same repo and branch, so each key holds
     * every project waiting on it — the pair is asked for once and the answer
     * fans back out to all of them.
     */
    const misses = new Map<
      string,
      { repoKey: string; branch: string; targets: Array<{ projectId: string; connectionId: string }> }
    >();
    const allPendingIds = () => [...misses.values()].flatMap((m) => m.targets.map((t) => t.projectId));

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

      const cached = getProjectBadgeCache(p.id, repoKey, branch, connectionId);
      if (cached !== null) {
        immediateResults[p.id] = cached;
        continue;
      }

      const key = `${repoKey}@${branch}`;
      const existing = misses.get(key);
      if (existing) existing.targets.push({ projectId: p.id, connectionId });
      else misses.set(key, { repoKey, branch, targets: [{ projectId: p.id, connectionId }] });
    }

    if (Object.keys(immediateResults).length > 0) {
      setBadges((prev) => ({ ...prev, ...immediateResults }));
    }
    if (misses.size === 0) return;

    setLoadingIds((prev) => {
      const next = new Set(prev);
      for (const id of allPendingIds()) next.add(id);
      return next;
    });

    void (async () => {
      try {
        const { results } = await gitApi.getRepoBadgesBatch(
          [...misses.values()].map(({ repoKey, branch }) => ({ repo: repoKey, branch })),
        );
        if (cancelled) return;

        const found: Record<string, TechBadgeInfo[]> = {};
        for (const result of results) {
          const miss = misses.get(`${result.repo}@${result.branch}`);
          if (!miss) continue;
          const selected = selectProjectBadges(result.badges || []);
          for (const target of miss.targets) {
            // Cached per project, since the key includes its connection.
            setProjectBadgeCache(target.projectId, miss.repoKey, miss.branch, target.connectionId, selected);
            found[target.projectId] = selected;
          }
        }
        // Repos the batch had nothing for are left out of `badges` and NOT
        // cached: the analysis may still be queued, and caching an empty answer
        // would hide the badges for as long as the cache lives.
        setBadges((prev) => ({ ...prev, ...found }));
      } catch {
        /* leave these projects unbadged; a later mount retries */
      } finally {
        // No `return` in a finally block — it would swallow a thrown error.
        if (!cancelled) {
          setLoadingIds((prev) => {
            const next = new Set(prev);
            for (const id of allPendingIds()) next.delete(id);
            return next;
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- projectsKey is a stable content hash
  }, [projectsKey]);

  return { badges, loadingIds };
}
