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

/**
 * The favicon route is tenant rate-limited, so resolve a few at a time rather
 * than opening one connection per project at once.
 */
const FETCH_CONCURRENCY = 4;

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

    async function fetchOne(
      projectId: string,
      repoKey: string,
      fetchKey: string,
      project: ProjectInput,
    ): Promise<void> {
      try {
        const res = await gitApi.getRepoFavicon(
          repoKey,
          project.branch || "main",
          project.connectionId,
          project.settings?.rootDirectory,
          project.settings?.webDirectory,
        );
        if (cancelled) return;
        const favicon = res.favicon && isValidFaviconUrl(res.favicon) ? res.favicon : undefined;
        setFetched((prev) => ({ ...prev, [projectId]: favicon }));
        writeCachedFavicon(fetchKey, { favicon, deployId: res.deployId ?? null });
      } catch {
        if (cancelled) return;
        // Leave any cached icon in place rather than blanking the avatar on a
        // transient failure; the entry simply isn't refreshed.
        setFetched((prev) => (prev[projectId] === undefined ? { ...prev, [projectId]: undefined } : prev));
      } finally {
        if (!cancelled) {
          setLoadingIds((prev) => {
            if (!prev.has(projectId)) return prev;
            const next = new Set(prev);
            next.delete(projectId);
            return next;
          });
        }
      }
    }

    let cursor = 0;
    const workers = Array.from({ length: Math.min(FETCH_CONCURRENCY, queue.length) }, async () => {
      while (!cancelled) {
        const item = queue[cursor++];
        if (!item) return;
        await fetchOne(item.projectId, item.repoKey, item.fetchKey, item.project);
      }
    });
    void Promise.all(workers);

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
