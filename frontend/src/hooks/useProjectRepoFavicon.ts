import { useState, useEffect, useRef, useMemo } from "react";
import { gitApi } from "../services/api";
import { getRepoKey } from "../utils/parseOwnerRepo";
import { isValidFaviconUrl } from "../utils/projectFavicon";
import { isFaviconCacheFresh, readCachedFavicons, writeCachedFavicon } from "../utils/faviconCache";

export interface ProjectRepoFaviconsResult {
  favicons: Record<string, string | undefined>;
  loadingIds: ReadonlySet<string>;
}

interface ProjectInput {
  id: string;
  repository: string;
  branch?: string;
  connectionId?: string;
  settings?: {
    rootDirectory?: string;
    webDirectory?: string;
  };
}



function buildFetchKey(p: ProjectInput): string {
  const rootDirectory = p.settings?.rootDirectory ?? "";
  const webDirectory = p.settings?.webDirectory ?? "";
  return `${p.repository}:${p.branch ?? ""}:${p.connectionId ?? ""}:${rootDirectory}:${webDirectory}`;
}

/**
 * Repository favicons, resolved from source files and held across visits.
 *
 * Cached entries are read during render rather than in an effect, so a revisited
 * project list paints its real icons on the first frame instead of showing
 * letter fallbacks and swapping them in a round trip later. A favicon only
 * changes when the project deploys, so a fresh entry skips the network entirely.
 */
export function useProjectRepoFavicons(projects: ProjectInput[]): ProjectRepoFaviconsResult {
  const [fetched, setFetched] = useState<Record<string, string | undefined>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(() => new Set());
  const fetchedRef = useRef<Map<string, string>>(new Map());

  const projectsKey = useMemo(
    () => projects.map((p) => `${p.id}:${buildFetchKey(p)}`).join("|"),
    [projects],
  );

  // Synchronous — this is what removes the pop-in.
  const cached = useMemo(
    () => readCachedFavicons(projects.map(buildFetchKey)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- projectsKey is a stable content hash
    [projectsKey],
  );

  const favicons = useMemo(() => {
    const merged: Record<string, string | undefined> = {};
    for (const project of projects) {
      // A value resolved this session wins; otherwise fall back to storage.
      if (project.id in fetched) {
        merged[project.id] = fetched[project.id];
        continue;
      }
      const entry = cached[buildFetchKey(project)];
      if (entry) merged[project.id] = entry.favicon;
    }
    return merged;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- projectsKey is a stable content hash
  }, [projectsKey, fetched, cached]);

  useEffect(() => {
    let cancelled = false;
    if (projects.length === 0) return;

    // Drop bookkeeping for projects that left the list, but keep what is already
    // resolved for the ones that remain, so a re-sort doesn't refire everything.
    const liveIds = new Set(projects.map((p) => p.id));
    for (const id of [...fetchedRef.current.keys()]) {
      if (!liveIds.has(id)) fetchedRef.current.delete(id);
    }
    setFetched((prev) => {
      const stale = Object.keys(prev).filter((id) => !liveIds.has(id));
      if (stale.length === 0) return prev;
      const next = { ...prev };
      for (const id of stale) delete next[id];
      return next;
    });

    const queue: { projectId: string; repoKey: string; fetchKey: string; project: ProjectInput }[] = [];

    for (const project of projects) {
      if (!project.repository || !project.connectionId) continue;

      const repoKey = getRepoKey(project.repository);
      if (!repoKey) continue;

      const fetchKey = buildFetchKey(project);
      if (fetchedRef.current.get(project.id) === fetchKey) continue;

      // A recent entry is trusted outright: the icon cannot change until the
      // project deploys again, so there is nothing to ask for.
      if (isFaviconCacheFresh(cached[fetchKey])) {
        fetchedRef.current.set(project.id, fetchKey);
        continue;
      }

      fetchedRef.current.set(project.id, fetchKey);
      queue.push({ projectId: project.id, repoKey, fetchKey, project });
    }

    if (queue.length === 0) return;

    // Only projects with nothing to show are "loading"; a stale-but-present icon
    // stays on screen while it revalidates.
    const withoutAnyIcon = queue.filter((item) => !cached[item.fetchKey]).map((item) => item.projectId);
    if (withoutAnyIcon.length > 0) {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        for (const id of withoutAnyIcon) next.add(id);
        return next;
      });
    }

    void (async () => {
      try {
        const { results } = await gitApi.getRepoFaviconsBatch(
          queue.map((item) => ({
            repo: item.repoKey,
            branch: item.project.branch || "main",
            connectionId: item.project.connectionId,
            rootDirectory: item.project.settings?.rootDirectory,
            webDirectory: item.project.settings?.webDirectory,
          })),
        );
        if (cancelled) return;

        // Several projects can share a repo and branch, so index the answers and
        // apply each to every project that was waiting on it.
        const byPair = new Map(results.map((r) => [`${r.repo}@${r.branch}`, r]));
        const resolved: Record<string, string | undefined> = {};
        for (const item of queue) {
          const answer = byPair.get(`${item.repoKey}@${item.project.branch || "main"}`);
          // Absent means the route had no cached icon and did not get to resolving
          // this one — it caps how many it walks per call. Not written to the
          // cache, so the next visit asks again instead of trusting a blank.
          if (!answer) continue;
          const favicon = answer.favicon && isValidFaviconUrl(answer.favicon) ? answer.favicon : undefined;
          resolved[item.projectId] = favicon;
          writeCachedFavicon(item.fetchKey, { favicon, deployId: answer.deployId ?? null });
        }
        setFetched((prev) => ({ ...prev, ...resolved }));
      } catch {
        /* Leave any cached icon in place rather than blanking avatars on a
           transient failure; the entries simply aren't refreshed. */
      } finally {
        if (!cancelled) {
          setLoadingIds((prev) => {
            const next = new Set(prev);
            for (const item of queue) next.delete(item.projectId);
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

  return { favicons, loadingIds };
}

/**
 * Fetch a single project's repository favicon from source files.
 */
export function useProjectRepoFavicon(project: ProjectInput | undefined): string | undefined {
  const projectList = useMemo(() => (project ? [project] : []), [project]);
  const { favicons } = useProjectRepoFavicons(projectList);
  return project ? favicons[project.id] : undefined;
}
