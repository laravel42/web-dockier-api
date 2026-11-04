import { useState, useEffect } from "react";
import { gitApi } from "@/services/api";
import { parseOwnerRepo, getRepoKey } from "@/utils/parseOwnerRepo";
import {
  getProjectBadgeCache,
  setProjectBadgeCache,
  selectProjectBadges,
} from "@/utils/projectBadgeCache";
import { getErrorMessage } from "@/utils/errors";
import type { Project, RepoStats } from "@/types";

/**
 * Repository stats and tech badges for the project detail page.
 */
export function useRepoStats(project: Project | null) {
  const [stats, setStats] = useState<RepoStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");

  const [badges, setBadges] = useState<Array<{ name: string; category: string; confidence: number }>>([]);
  const [allBadges, setAllBadges] = useState<Array<{ name: string; category: string; confidence: number }>>([]);

  useEffect(() => {
    if (!project?.connectionId || !project.repository) return;
    if (project.sourceType === "template") return;

    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;

    // Responses are applied only while this effect is the current one: without
    // the guard, two quick project or branch changes landed in completion order
    // and the slower response overwrote the newer project's stats.
    let current = true;

    // Stats
    setStatsLoading(true);
    setStatsError("");
    gitApi.getRepoStats(project.connectionId, parsed.owner, parsed.repo, project.branch || undefined, project.id)
      .then((res) => { if (current) setStats(res); })
      .catch((err: unknown) => { if (current) setStatsError(getErrorMessage(err, "Failed to load stats")); })
      .finally(() => { if (current) setStatsLoading(false); });

    // Badges
    const repoKey = getRepoKey(project.repository);
    if (repoKey) {
      const branch = project.branch || "main";
      const cached = getProjectBadgeCache(project.id, repoKey, branch, project.connectionId || "");
      // Reset, not keep: on a project switch the previous project's badges would
      // otherwise stay on screen until the new response landed.
      setBadges(cached ?? []);
      setAllBadges([]);
      gitApi.getRepoBadges(repoKey, branch, project.connectionId)
        .then((res) => {
          if (!current) return;
          const all = res.badges || [];
          const selected = selectProjectBadges(all);
          setProjectBadgeCache(project.id, repoKey, branch, project.connectionId || "", selected);
          setBadges(selected);
          setAllBadges(all);
        })
        .catch(() => {});
    }

    return () => { current = false; };
  }, [project?.id, project?.connectionId, project?.repository, project?.branch, project?.sourceType]);

  return { stats, statsLoading, statsError, badges, allBadges };
}
